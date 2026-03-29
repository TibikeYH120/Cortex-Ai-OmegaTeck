import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db";
import { eq, asc, desc } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";

type AllowedMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

interface TextBlockParam {
  type: "text";
  text: string;
}

interface ImageBlockParam {
  type: "image";
  source: {
    type: "base64";
    media_type: AllowedMediaType;
    data: string;
  };
}

type ContentBlockParam = TextBlockParam | ImageBlockParam;

interface MessageParam {
  role: "user" | "assistant";
  content: string | ContentBlockParam[] | any[];
}

// Owner identity for a request: either an authenticated user or a guest session.
type Owner =
  | { type: "user"; userId: number }
  | { type: "guest"; sessionId: string };

/**
 * Resolves the caller's identity from the Express session.
 * - Authenticated users → { type: "user", userId }
 * - Everyone else with a valid session → { type: "guest", sessionId }
 * The session is explicitly saved for guests so the session ID persists across requests.
 */
function getOwner(req: Request): Owner {
  if (req.session.userId) {
    return { type: "user", userId: req.session.userId };
  }
  return { type: "guest", sessionId: req.sessionID };
}

/**
 * Checks whether a DB conversation row belongs to the caller.
 *
 * Ownership rules:
 *  - Authenticated users: row.userId must equal the session userId.
 *  - Guest sessions:     row.guestSessionId must equal the session ID.
 *  - Orphaned rows:      rows with both fields NULL (pre-migration data) do not
 *    match any caller — they are inaccessible by design and would require a
 *    direct DB fix or a future admin endpoint to reassign ownership.
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

// ── Web search tool ────────────────────────────────────────────────────────────

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
 * Returns up to 4 results with url, title, and extract snippet.
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
  const data: any = await resp.json();
  return (data.query?.search ?? []).map((r: any) => ({
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
  const data: any = await resp.json();

  const results: SearchResult[] = [];

  if (data.AbstractText && data.AbstractURL) {
    results.push({
      url: data.AbstractURL,
      title: data.Heading || query,
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
 * Combined web search: DuckDuckGo + Wikipedia.
 * Deduplicates by URL and returns up to 6 results.
 */
async function webSearch(query: string): Promise<SearchResult[]> {
  const [ddg, wiki] = await Promise.allSettled([
    duckduckgoSearch(query),
    wikipediaSearch(query),
  ]);

  const ddgResults = ddg.status === "fulfilled" ? ddg.value : [];
  const wikiResults = wiki.status === "fulfilled" ? wiki.value : [];

  // Merge, deduplicating by URL
  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (const r of [...ddgResults, ...wikiResults]) {
    if (r.url && !seen.has(r.url)) {
      seen.add(r.url);
      merged.push(r);
    }
  }
  return merged.slice(0, 6);
}

// Tool definition for Claude — standard function schema, no beta headers required.
const WEB_SEARCH_TOOL = {
  name: "web_search",
  description:
    "Search the web for up-to-date information. Use this when you need current events, recent news, live data (prices, releases, etc.) or any information that may have changed after your training cutoff.",
  input_schema: {
    type: "object" as const,
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
    // We mark the session as a guest session (non-empty data) so express-session
    // will issue a Set-Cookie header even with saveUninitialized: false.
    if (owner.type === "guest") {
      (req.session as any).guestMode = true;
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

router.post("/conversations/:id/messages", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const { content, imageAttachment } = req.body;
  if (!content && !imageAttachment) {
    res.status(400).json({ error: "Message content is required" });
    return;
  }

  const textContent = content || "";

  // Validate and parse imageAttachment BEFORE any DB writes
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

    // Store only text in DB. Images are ephemeral by design: base64 payloads are too large
    // for DB storage. Attachment/generated-image previews live only in local React state and
    // are not restored when the conversation is reloaded from the server.
    await db.insert(messages).values({ conversationId: id, role: "user", content: textContent });

    const existingMessages = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt));

    // Build chat messages — all previous as text, the last user message may include an image
    const chatMessages: MessageParam[] = existingMessages.slice(0, -1).map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Compose the final user message content
    if (parsedAttachment) {
      const userContent: ContentBlockParam[] = [
        { type: "image", source: { type: "base64", media_type: parsedAttachment.mediaType, data: parsedAttachment.base64Data } },
      ];
      if (textContent) {
        userContent.push({ type: "text", text: textContent });
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

    // ── Step 1: First (non-streaming) call to detect if Claude wants to search ──
    // Images are not included in the tool-use path; skip the round-trip for them.
    const canSearch = !parsedAttachment;

    if (canSearch) {
      let firstResponse: any;
      try {
        firstResponse = await (anthropic.messages.create as any)({
          model: "claude-sonnet-4-6",
          max_tokens: 512,
          system: SYSTEM_PROMPT,
          tools: [WEB_SEARCH_TOOL],
          tool_choice: { type: "auto" },
          messages: chatMessages,
        });
      } catch (firstErr: any) {
        // If the proxy rejects the tools parameter, fall through to plain streaming.
        req.log.warn({ err: firstErr }, "First-pass tool detection failed, skipping search");
        firstResponse = null;
      }

      if (firstResponse?.stop_reason === "tool_use") {
        const toolUseBlock = firstResponse.content.find((b: any) => b.type === "tool_use");
        if (toolUseBlock) {
          const searchQuery: string = (toolUseBlock.input as any)?.query ?? textContent;

          // Notify the frontend that web search is running
          res.write(`data: ${JSON.stringify({ searching: true })}\n\n`);
          (res as any).flush?.();
          usedSearch = true;

          let searchResults: SearchResult[] = [];
          try {
            searchResults = await webSearch(searchQuery);
          } catch (searchErr) {
            req.log.warn({ err: searchErr }, "Web search failed, continuing without results");
          }

          // Collect sources for display
          for (const r of searchResults) {
            if (r.url && r.title) sources.push({ url: r.url, title: r.title });
          }

          // Instead of using the tool_result pattern (which the Replit proxy handles
          // inconsistently), inject the search results directly into the user message.
          // We replace the last user message with a version that includes the results.
          const contextBlock =
            searchResults.length > 0
              ? `\n\n[WEB SEARCH RESULTS for: "${searchQuery}"]\n` +
                searchResults
                  .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`)
                  .join("\n\n") +
                "\n[/WEB SEARCH RESULTS]\n\nUsing the search results above, please answer:"
              : `\n\n[WEB SEARCH returned no results for: "${searchQuery}"]\n\nPlease answer from your training knowledge:`;

          // Pop the last user message and rebuild it with search context appended
          chatMessages.pop();
          chatMessages.push({ role: "user", content: textContent + contextBlock });
        }
      }
    }

    // ── Step 2: Streaming call — plain response (search context is in the message if used) ──
    const streamParams: any = {
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: chatMessages,
    };
    // Pass tools only for the no-search path so Claude can still decide to search
    // on follow-up turns in the same conversation.
    if (canSearch && !usedSearch) {
      streamParams.tools = [WEB_SEARCH_TOOL];
      streamParams.tool_choice = { type: "auto" };
    }
    const stream = (anthropic.messages.stream as any)(streamParams);

    for await (const event of stream) {
      const e = event as any;
      if (e.type === "content_block_delta" && e.delta?.type === "text_delta") {
        fullResponse += e.delta.text;
        res.write(`data: ${JSON.stringify({ content: e.delta.text })}\n\n`);
        (res as any).flush?.();
      }
    }

    await db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse });

    // Emit sources before the done event so the frontend can attach them to the message
    if (usedSearch && sources.length > 0) {
      res.write(`data: ${JSON.stringify({ sources })}\n\n`);
      (res as any).flush?.();
    }

    res.write(`data: ${JSON.stringify({ done: true, usedSearch })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Send message error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Server error" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Server error" })}\n\n`);
      res.end();
    }
  }
});

export default router;
