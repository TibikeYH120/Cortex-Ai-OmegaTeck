import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db";
import { eq, asc, desc } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import type {
  MessageParam,
  Tool,
  ContentBlock,
  ToolUseBlock,
  ImageBlockParam,
  TextBlockParam,
  ToolResultBlockParam,
  ContentBlockParam,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources";

type AllowedMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

// Owner identity for a request: either an authenticated user or a guest session.
type Owner =
  | { type: "user"; userId: number }
  | { type: "guest"; sessionId: string };

/**
 * Resolves the caller's identity from the Express session.
 * - Authenticated users → { type: "user", userId }
 * - Everyone else with a valid session → { type: "guest", sessionId }
 */
function getOwner(req: Request): Owner {
  if (req.session.userId) {
    return { type: "user", userId: req.session.userId };
  }
  return { type: "guest", sessionId: req.sessionID };
}

/**
 * Checks whether a DB conversation row belongs to the caller.
 */
function isOwner(
  conv: { userId: number | null; guestSessionId: string | null },
  owner: Owner
): boolean {
  if (owner.type === "user") {
    return conv.userId === owner.userId;
  }
  return conv.guestSessionId === owner.sessionId;
}

/**
 * Returns a Drizzle WHERE clause that scopes conversations to the caller.
 */
function ownerFilter(owner: Owner) {
  if (owner.type === "user") {
    return eq(conversations.userId, owner.userId);
  }
  return eq(conversations.guestSessionId, owner.sessionId);
}

// ── Web search ────────────────────────────────────────────────────────────────

export interface WebSearchSource {
  url: string;
  title: string;
}

interface SearchResult {
  url: string;
  title: string;
  snippet: string;
}

/**
 * Searches Wikipedia for matching articles.
 */
async function wikipediaSearch(query: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "4",
    srprop: "snippet|titlesnippet",
    format: "json",
    origin: "*",
  });
  const resp = await fetch(`https://en.wikipedia.org/w/api.php?${params.toString()}`, {
    headers: { "User-Agent": "CORTEX-AI-Search/1.0" },
    signal: AbortSignal.timeout(6000),
  });
  if (!resp.ok) return [];
  const data = await resp.json() as {
    query?: { search?: Array<{ title: string; snippet: string }> };
  };
  return (data.query?.search ?? []).map(r => ({
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
    title: r.title,
    snippet: r.snippet.replace(/<\/?[^>]+>/g, "").slice(0, 400),
  }));
}

/**
 * DuckDuckGo Instant Answer JSON API — good for quick facts and Wikipedia abstracts.
 */
async function duckduckgoSearch(query: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    no_html: "1",
    skip_disambig: "1",
    t: "cortex-ai",
  });
  const resp = await fetch(`https://api.duckduckgo.com/?${params.toString()}`, {
    headers: { "Accept-Language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(6000),
  });
  if (!resp.ok) return [];
  const data = await resp.json() as {
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

/**
 * Combined web search: DuckDuckGo + Wikipedia, deduplicated.
 */
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
  return all.filter(r => {
    if (!r.url || seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  }).slice(0, 6);
}

// Tool definition for Claude — standard function schema, no beta headers required.
const WEB_SEARCH_TOOL: Tool = {
  name: "web_search",
  description:
    "Search the web for up-to-date information. Use this when you need current events, recent news, live data (prices, releases, etc.) or any information that may have changed after your training cutoff.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "A concise, specific search query (English preferred for best results)",
      },
    },
    required: ["query"],
  },
};

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

// ── Conversation routes ───────────────────────────────────────────────────────

router.get("/conversations", async (req: Request, res: Response) => {
  const owner = getOwner(req);
  try {
    const rows = await db
      .select()
      .from(conversations)
      .where(ownerFilter(owner))
      .orderBy(desc(conversations.createdAt));
    res.json(rows.map(c => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
    })));
  } catch (err) {
    req.log.error({ err }, "List conversations error");
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/conversations", async (req: Request, res: Response) => {
  const { title } = req.body;
  if (!title) {
    res.status(400).json({ error: "Title is required" });
    return;
  }
  const owner = getOwner(req);
  try {
    const values =
      owner.type === "user"
        ? { title, userId: owner.userId }
        : { title, guestSessionId: owner.sessionId };

    // Persist the session for guests so the session ID survives across requests.
    if (owner.type === "guest") {
      (req.session as Record<string, unknown>).guestMode = true;
      await new Promise<void>((resolve, reject) =>
        req.session.save(err => (err ? reject(err) : resolve()))
      );
    }

    const [conv] = await db.insert(conversations).values(values).returning();
    res.status(201).json({
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Create conversation error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/conversations/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  try {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    if (!conv) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const owner = getOwner(req);
    if (!isOwner(conv, owner)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt));
    res.json({
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
      messages: msgs.map(m => ({
        id: m.id,
        conversationId: m.conversationId,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Get conversation error");
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/conversations/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  try {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    if (!conv) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const owner = getOwner(req);
    if (!isOwner(conv, owner)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await db.delete(conversations).where(eq(conversations.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Delete conversation error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/conversations/:id/messages", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  try {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    if (!conv) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const owner = getOwner(req);
    if (!isOwner(conv, owner)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt));
    res.json(msgs.map(m => ({
      id: m.id,
      conversationId: m.conversationId,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })));
  } catch (err) {
    req.log.error({ err }, "List messages error");
    res.status(500).json({ error: "Server error" });
  }
});

// ── SSE helper ────────────────────────────────────────────────────────────────

/** Writes a JSON-encoded SSE data line and flushes if possible. */
function sseWrite(res: Response, payload: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  (res as Response & { flush?: () => void }).flush?.();
}

/**
 * Streams the response from a MessageStream to the SSE connection,
 * accumulating and returning the full text.
 * Ignores tool_use events — if Claude tries to call a tool in this stream,
 * that block is skipped (it won't produce text_delta events anyway).
 */
async function streamToSSE(
  stream: AsyncIterable<RawMessageStreamEvent>,
  res: Response
): Promise<string> {
  let fullText = "";
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      fullText += event.delta.text;
      sseWrite(res, { content: event.delta.text });
    }
  }
  return fullText;
}

// ── Message endpoint ──────────────────────────────────────────────────────────

router.post("/conversations/:id/messages", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
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
    const matches = imageAttachment.match(/^data:(image\/(jpeg|png|gif|webp));base64,(.+)$/);
    if (!matches) {
      res.status(400).json({ error: "Unsupported image type — use JPEG, PNG, GIF, or WEBP" });
      return;
    }
    parsedAttachment = { mediaType: matches[1] as AllowedMediaType, base64Data: matches[3] };
  }

  try {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    if (!conv) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const owner = getOwner(req);
    if (!isOwner(conv, owner)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Persist only text — base64 images are too large for DB and are ephemeral by design.
    await db.insert(messages).values({ conversationId: id, role: "user", content: textContent });

    const existingMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));

    // Build the messages array — all previous turns are text-only.
    const chatMessages: MessageParam[] = existingMessages.slice(0, -1).map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Build the final user message (may include an image attachment).
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

    // SSE headers — X-Accel-Buffering disables nginx proxy buffering
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.flushHeaders();

    let fullResponse = "";
    let usedSearch = false;
    const sources: WebSearchSource[] = [];

    // Images are not sent through the tool-use path (Anthropic doesn't mix
    // image blocks with tool_use in the same turn in a standard way).
    const canSearch = !parsedAttachment;

    if (canSearch) {
      // ── Step 1: Non-streaming first call — detect whether Claude wants to search ──
      // Using a non-streaming call lets us branch before we start writing SSE content,
      // and avoids partial-stream complexity with the tool_use mid-stream case.
      const firstResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        tools: [WEB_SEARCH_TOOL],
        tool_choice: { type: "auto" },
        messages: chatMessages,
      });

      if (firstResponse.stop_reason === "tool_use") {
        // Find the tool_use block that Claude emitted
        const toolUseBlock = firstResponse.content.find(
          (b): b is ToolUseBlock => b.type === "tool_use"
        );

        if (toolUseBlock) {
          const searchQuery = (toolUseBlock.input as { query?: string }).query ?? textContent;

          // Notify the client that search is underway
          sseWrite(res, { searching: true });
          usedSearch = true;

          let searchResults: SearchResult[] = [];
          try {
            searchResults = await runWebSearch(searchQuery);
          } catch (searchErr) {
            req.log.warn({ err: searchErr }, "Web search failed, continuing without results");
          }

          // Collect sources for the frontend
          for (const r of searchResults) {
            if (r.url && r.title) sources.push({ url: r.url, title: r.title });
          }

          const toolResultContent =
            searchResults.length > 0
              ? searchResults
                  .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`)
                  .join("\n\n")
              : "No results found for this query.";

          // Append the assistant's tool_use turn and the user's tool_result turn.
          // The assistant message must include all content blocks from firstResponse.content
          // so the conversation history is consistent.
          const assistantContentBlocks: ContentBlock[] = firstResponse.content;
          chatMessages.push({ role: "assistant", content: assistantContentBlocks });

          const toolResult: ToolResultBlockParam = {
            type: "tool_result",
            tool_use_id: toolUseBlock.id,
            content: toolResultContent,
          };
          chatMessages.push({ role: "user", content: [toolResult] });

          // ── Step 2: Streaming call with tool_result in history ──
          // tool_choice: auto is intentional — the proxy requires the tools array when
          // tool_use/tool_result appear in the history. Claude naturally responds with
          // text at this point because the tool result has already been provided.
          const stream = anthropic.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 8192,
            system: SYSTEM_PROMPT,
            tools: [WEB_SEARCH_TOOL],
            tool_choice: { type: "auto" },
            messages: chatMessages,
          });
          fullResponse = await streamToSSE(stream, res);
        }
      } else {
        // No tool use — Claude answered directly in the first response.
        // Stream the text as SSE content events so the client gets a consistent experience.
        for (const block of firstResponse.content) {
          if (block.type === "text" && block.text) {
            // Send in chunks of ~80 chars to keep the streaming feel
            const CHUNK = 80;
            let i = 0;
            while (i < block.text.length) {
              const chunk = block.text.slice(i, i + CHUNK);
              fullResponse += chunk;
              sseWrite(res, { content: chunk });
              i += CHUNK;
            }
          }
        }
      }
    } else {
      // Image attachment path — skip tool use, go straight to streaming.
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: chatMessages,
      });
      fullResponse = await streamToSSE(stream, res);
    }

    // Persist the assistant's final text response
    await db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse });

    // Emit sources before the done event
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
