import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db";
import { eq, asc, desc } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import type {
  MessageParam,
  Tool,
  ToolResultBlockParam,
  ContentBlockParam,
  ImageBlockParam,
  TextBlockParam,
} from "@anthropic-ai/sdk/resources";

type AllowedMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

// ── Owner helpers ─────────────────────────────────────────────────────────────

type Owner =
  | { type: "user"; userId: number }
  | { type: "guest"; sessionId: string };

function getOwner(req: Request): Owner {
  if (req.session.userId) return { type: "user", userId: req.session.userId };
  return { type: "guest", sessionId: req.sessionID };
}

function isOwner(
  conv: { userId: number | null; guestSessionId: string | null },
  owner: Owner
): boolean {
  return owner.type === "user"
    ? conv.userId === owner.userId
    : conv.guestSessionId === owner.sessionId;
}

function ownerFilter(owner: Owner) {
  return owner.type === "user"
    ? eq(conversations.userId, owner.userId)
    : eq(conversations.guestSessionId, owner.sessionId);
}

// ── Web search backend ────────────────────────────────────────────────────────

export interface WebSearchSource {
  url: string;
  title: string;
}

interface SearchResult {
  url: string;
  title: string;
  snippet: string;
}

/** Wikipedia search — reliable factual coverage. */
async function wikipediaSearch(query: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "4",
    srprop: "snippet",
    format: "json",
    origin: "*",
  });
  const resp = await fetch(
    `https://en.wikipedia.org/w/api.php?${params.toString()}`,
    {
      headers: { "User-Agent": "CORTEX-AI-Search/1.0" },
      signal: AbortSignal.timeout(6000),
    }
  );
  if (!resp.ok) return [];
  const data = (await resp.json()) as {
    query?: { search?: Array<{ title: string; snippet: string }> };
  };
  return (data.query?.search ?? []).map(r => ({
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
    title: r.title,
    snippet: r.snippet.replace(/<\/?[^>]+>/g, "").slice(0, 400),
  }));
}

/** DuckDuckGo Instant Answer API — good for direct facts. */
async function duckduckgoSearch(query: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    no_html: "1",
    skip_disambig: "1",
    t: "cortex-ai",
  });
  const resp = await fetch(
    `https://api.duckduckgo.com/?${params.toString()}`,
    {
      headers: { "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(6000),
    }
  );
  if (!resp.ok) return [];
  const data = (await resp.json()) as {
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
    Results?: Array<{ FirstURL?: string; Text?: string }>;
    RelatedTopics?: Array<{ FirstURL?: string; Text?: string }>;
  };

  const results: SearchResult[] = [];
  if (data.AbstractText && data.AbstractURL) {
    results.push({
      url: data.AbstractURL,
      title: data.Heading ?? query,
      snippet: data.AbstractText.slice(0, 400),
    });
  }
  for (const r of (data.Results ?? []).slice(0, 3)) {
    if (r.FirstURL && r.Text) {
      results.push({
        url: r.FirstURL,
        title: r.Text.split(" - ")[0].slice(0, 120),
        snippet: r.Text.slice(0, 400),
      });
    }
  }
  for (const t of (data.RelatedTopics ?? []).slice(0, 4)) {
    if (t.FirstURL && t.Text) {
      results.push({
        url: t.FirstURL,
        title: t.Text.split(" - ")[0].slice(0, 120),
        snippet: t.Text.slice(0, 400),
      });
    }
  }
  return results.slice(0, 5);
}

/** Combined search: DuckDuckGo + Wikipedia, deduplicated. */
async function runWebSearch(query: string): Promise<SearchResult[]> {
  const [ddg, wiki] = await Promise.allSettled([
    duckduckgoSearch(query),
    wikipediaSearch(query),
  ]);
  const all = [
    ...(ddg.status === "fulfilled" ? ddg.value : []),
    ...(wiki.status === "fulfilled" ? wiki.value : []),
  ];
  const seen = new Set<string>();
  return all
    .filter(r => {
      if (!r.url || seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    })
    .slice(0, 6);
}

// ── Anthropic tool definition ─────────────────────────────────────────────────

const WEB_SEARCH_TOOL: Tool = {
  name: "web_search",
  description:
    "Search the web for up-to-date information: current events, recent news, live data (prices, releases, docs) or anything that may have changed after your training cutoff.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "A concise, specific search query",
      },
    },
    required: ["query"],
  },
};

// ── SSE helper ────────────────────────────────────────────────────────────────

type FlushableResponse = Response & { flush?: () => void };

function sseWrite(res: Response, payload: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  (res as FlushableResponse).flush?.();
}

// ── Core streaming loop ───────────────────────────────────────────────────────

/**
 * Runs the Anthropic streaming conversation with automatic tool-use handling.
 *
 * Two-phase approach:
 *
 * PHASE 1 — Detection stream (tool_choice: auto, max_tokens: 8192):
 *   • Start a real streaming call with the web_search tool.
 *   • Forward text_delta events to the SSE client immediately (true streaming).
 *   • If a tool_use block arrives instead, collect its input_json_delta events.
 *   • The stream ends naturally with stop_reason "end_turn" or "tool_use".
 *
 * PHASE 2 — Synthesis stream (no tools, max_tokens: 8192):
 *   Only reached if Phase 1 ended with a tool call.
 *   • Emit { searching: true } to the frontend.
 *   • Execute the web search (DuckDuckGo + Wikipedia).
 *   • Build a clean synthesis message history: the original messages with the
 *     last user turn augmented by the search results.  The tool_use/tool_result
 *     pair is NOT included in this history because the Replit Anthropic proxy
 *     (Vertex AI backend) does not support tool_choice:"none", which is the
 *     only standard mechanism to prevent Claude from re-searching after a
 *     tool_result.  Providing results via the user message achieves the same
 *     semantic goal — Claude synthesises the fetched data into a text response
 *     — while remaining compatible with the proxy.
 *   • Start a second real streaming call (no tools) and forward its text_delta
 *     events immediately (true streaming).
 */
async function runStreamingConversation(
  chatMessages: MessageParam[],
  system: string,
  res: Response,
  log: Request["log"]
): Promise<{ fullText: string; usedSearch: boolean; sources: WebSearchSource[] }> {
  let fullText = "";

  // ── Phase 1: detection stream ─────────────────────────────────────────────

  const detectionStream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system,
    tools: [WEB_SEARCH_TOOL],
    tool_choice: { type: "auto" },
    messages: chatMessages,
  });

  let inToolUse = false;
  let toolUseId = "";
  let toolInputJson = "";

  for await (const event of detectionStream) {
    switch (event.type) {
      case "content_block_start":
        if (event.content_block.type === "tool_use") {
          inToolUse = true;
          toolUseId = event.content_block.id;
          toolInputJson = "";
        }
        break;

      case "content_block_delta":
        if (event.delta.type === "text_delta" && !inToolUse) {
          fullText += event.delta.text;
          sseWrite(res, { content: event.delta.text });
        } else if (event.delta.type === "input_json_delta" && inToolUse) {
          toolInputJson += event.delta.partial_json;
        }
        break;

      case "content_block_stop":
        if (inToolUse) inToolUse = false;
        break;

      default:
        break;
    }
  }

  if (!toolUseId) {
    // No tool was called — the detection stream IS the final response.
    return { fullText, usedSearch: false, sources: [] };
  }

  // ── Phase 2: search execution + synthesis stream ──────────────────────────

  let searchQuery = "";
  try {
    searchQuery = (JSON.parse(toolInputJson) as { query?: string }).query ?? "";
  } catch {
    searchQuery = "";
  }

  sseWrite(res, { searching: true });

  const sources: WebSearchSource[] = [];

  if (searchQuery) {
    let searchResults: SearchResult[] = [];
    try {
      searchResults = await runWebSearch(searchQuery);
    } catch (searchErr) {
      log.warn({ err: searchErr }, "Web search failed");
    }

    for (const r of searchResults) {
      if (r.url && r.title && !sources.some(s => s.url === r.url)) {
        sources.push({ url: r.url, title: r.title });
      }
    }

    const toolResultText =
      searchResults.length > 0
        ? searchResults
            .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`)
            .join("\n\n")
        : "No results found for this query.";

    // Derive the original user message text to re-present it alongside the
    // search results.  chatMessages[-1] is always the latest user turn.
    const lastUserMsg = chatMessages[chatMessages.length - 1];
    let originalUserText = "";
    if (typeof lastUserMsg.content === "string") {
      originalUserText = lastUserMsg.content;
    } else if (Array.isArray(lastUserMsg.content)) {
      for (const block of lastUserMsg.content) {
        if (block.type === "text") {
          originalUserText = block.text;
          break;
        }
      }
    }

    // Build a clean synthesis history: earlier turns + an augmented user message
    // that embeds the search results.  No tool_use/tool_result blocks means no
    // tools parameter is required, and Claude responds with text naturally.
    const synthesisMessages: MessageParam[] = [
      ...chatMessages.slice(0, -1),
      {
        role: "user",
        content: `[WEB SEARCH RESULTS for "${searchQuery}"]:\n\n${toolResultText}\n\n[END SEARCH RESULTS]\n\nUser question: ${originalUserText}`,
      },
    ];

    const synthesisStream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system,
      messages: synthesisMessages,
    });

    for await (const event of synthesisStream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        fullText += event.delta.text;
        sseWrite(res, { content: event.delta.text });
      }
    }
  }

  return { fullText, usedSearch: true, sources };
}

// ── Express router ────────────────────────────────────────────────────────────

const router: IRouter = Router();

const SYSTEM_PROMPT = `You are CORTEX AI, the advanced artificial intelligence assistant of OmegaTeck Technology.

OmegaTeck Technology is an innovative tech company. Founder and creative director: Tibor. Projects: OmegaHumanity, VoidExio. Focus: game development, web development, creative technology, AI integration.

Personality:
- Technology expert, friendly, direct communication style
- Respond in the language the user writes in (English by default)
- Always wrap code in \`\`\` code blocks with the appropriate language tag
- Keep responses concise and impactful when possible
- Expert in: React, Next.js, Three.js, Tailwind CSS, game design, Roblox, Unreal Engine 5

When generating HTML, React, or Next.js code, produce complete, runnable examples that can be previewed directly.

IMAGE GENERATION:
When the user requests an image (e.g. "generate an image of...", "create a picture of...", "draw me...", "make an image of..."), respond with ONLY this format and nothing else:
[GENERATE_IMAGE: <detailed image prompt in English>]

The prompt inside the brackets should be detailed and descriptive for best results. Do not add any other text before or after the bracket tag when generating an image.

WEB SEARCH:
You have access to a web_search tool. Use it when:
- The user asks about current events, recent news, or anything time-sensitive
- You need up-to-date information (prices, docs, releases, stats)
- You are uncertain whether your training data is current enough
Do NOT use web search for general knowledge questions you can answer confidently.
After receiving search results, synthesize them into a helpful answer and always mention sources.`;

// ── CRUD routes ───────────────────────────────────────────────────────────────

router.get("/conversations", async (req: Request, res: Response) => {
  const owner = getOwner(req);
  try {
    const rows = await db
      .select()
      .from(conversations)
      .where(ownerFilter(owner))
      .orderBy(desc(conversations.createdAt));
    res.json(rows.map(c => ({ id: c.id, title: c.title, createdAt: c.createdAt })));
  } catch (err) {
    req.log.error({ err }, "List conversations error");
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/conversations", async (req: Request, res: Response) => {
  const { title } = req.body;
  if (!title) { res.status(400).json({ error: "Title is required" }); return; }
  const owner = getOwner(req);
  try {
    const values =
      owner.type === "user"
        ? { title, userId: owner.userId }
        : { title, guestSessionId: owner.sessionId };

    if (owner.type === "guest") {
      (req.session as Record<string, unknown>).guestMode = true;
      await new Promise<void>((resolve, reject) =>
        req.session.save(err => (err ? reject(err) : resolve()))
      );
    }

    const [conv] = await db.insert(conversations).values(values).returning();
    res.status(201).json({ id: conv.id, title: conv.title, createdAt: conv.createdAt });
  } catch (err) {
    req.log.error({ err }, "Create conversation error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/conversations/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conv) { res.status(404).json({ error: "Not found" }); return; }
    const owner = getOwner(req);
    if (!isOwner(conv, owner)) { res.status(403).json({ error: "Forbidden" }); return; }
    const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt));
    res.json({
      id: conv.id, title: conv.title, createdAt: conv.createdAt,
      messages: msgs.map(m => ({
        id: m.id, conversationId: m.conversationId, role: m.role,
        content: m.content, createdAt: m.createdAt,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Get conversation error");
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/conversations/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conv) { res.status(404).json({ error: "Not found" }); return; }
    const owner = getOwner(req);
    if (!isOwner(conv, owner)) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(conversations).where(eq(conversations.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Delete conversation error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/conversations/:id/messages", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conv) { res.status(404).json({ error: "Not found" }); return; }
    const owner = getOwner(req);
    if (!isOwner(conv, owner)) { res.status(403).json({ error: "Forbidden" }); return; }
    const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt));
    res.json(msgs.map(m => ({
      id: m.id, conversationId: m.conversationId, role: m.role,
      content: m.content, createdAt: m.createdAt,
    })));
  } catch (err) {
    req.log.error({ err }, "List messages error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── Message endpoint ──────────────────────────────────────────────────────────

router.post("/conversations/:id/messages", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { content, imageAttachment } = req.body as {
    content?: string;
    imageAttachment?: string;
  };
  if (!content && !imageAttachment) {
    res.status(400).json({ error: "Message content is required" });
    return;
  }

  const textContent = content ?? "";

  // Validate image attachment before any DB writes
  const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
  let parsedAttachment: { mediaType: AllowedMediaType; base64Data: string } | null = null;
  if (imageAttachment != null) {
    if (typeof imageAttachment !== "string" || !imageAttachment.startsWith("data:image/")) {
      res.status(400).json({ error: "Invalid image attachment format" });
      return;
    }
    if (imageAttachment.length > MAX_ATTACHMENT_BYTES * 1.4) {
      res.status(413).json({ error: "Image attachment too large (max 5 MB)" });
      return;
    }
    const matches = imageAttachment.match(
      /^data:(image\/(jpeg|png|gif|webp));base64,(.+)$/
    );
    if (!matches) {
      res.status(400).json({ error: "Unsupported image type — use JPEG, PNG, GIF, or WEBP" });
      return;
    }
    parsedAttachment = {
      mediaType: matches[1] as AllowedMediaType,
      base64Data: matches[3],
    };
  }

  try {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conv) { res.status(404).json({ error: "Not found" }); return; }
    const owner = getOwner(req);
    if (!isOwner(conv, owner)) { res.status(403).json({ error: "Forbidden" }); return; }

    // Persist only text — base64 images are ephemeral and too large for DB storage.
    await db.insert(messages).values({ conversationId: id, role: "user", content: textContent });

    const existingMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));

    // Build conversation history for the API call
    const chatMessages: MessageParam[] = existingMessages.slice(0, -1).map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Compose the final user message (may include an image)
    if (parsedAttachment) {
      const userContent: ContentBlockParam[] = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: parsedAttachment.mediaType,
            data: parsedAttachment.base64Data,
          },
        } satisfies ImageBlockParam,
      ];
      if (textContent) {
        userContent.push({ type: "text", text: textContent } satisfies TextBlockParam);
      }
      chatMessages.push({ role: "user", content: userContent });
    } else {
      chatMessages.push({ role: "user", content: textContent });
    }

    // SSE headers — X-Accel-Buffering disables nginx/proxy buffering
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.flushHeaders();

    let fullResponse: string;
    let usedSearch: boolean;
    let sources: WebSearchSource[];

    if (parsedAttachment) {
      // Image messages skip the tool-use path — stream directly without tools.
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: chatMessages,
      });
      let text = "";
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          text += event.delta.text;
          sseWrite(res, { content: event.delta.text });
        }
      }
      fullResponse = text;
      usedSearch = false;
      sources = [];
    } else {
      ({ fullText: fullResponse, usedSearch, sources } =
        await runStreamingConversation(chatMessages, SYSTEM_PROMPT, res, req.log));
    }

    await db.insert(messages).values({
      conversationId: id,
      role: "assistant",
      content: fullResponse,
    });

    if (usedSearch && sources.length > 0) {
      sseWrite(res, { sources });
    }

    sseWrite(res, { done: true, usedSearch });
    res.end();
  } catch (err) {
    req.log.error({ err }, "Send message error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Server error" });
    } else {
      sseWrite(res, { error: "Server error" });
      res.end();
    }
  }
});

export default router;
