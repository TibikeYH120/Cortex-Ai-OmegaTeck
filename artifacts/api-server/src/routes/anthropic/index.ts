import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { conversations, messages, usersTable } from "@workspace/db";
import { eq, asc, desc } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import OpenAI from "openai";
import type {
  MessageParam,
  Tool,
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

/**
 * Tavily Search API — real web results specifically designed for AI agents.
 * Requires TAVILY_API_KEY env var (free tier: 1,000 queries/month).
 * Get a free key at https://app.tavily.com
 * Returns empty array if the key is not set, so callers fall back gracefully.
 */
async function tavilySearch(query: string): Promise<SearchResult[]> {
  const apiKey = process.env["TAVILY_API_KEY"];
  if (!apiKey) return [];

  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      max_results: 8,
      search_depth: "basic",
      include_answer: false,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) return [];

  const data = (await resp.json()) as {
    results?: Array<{
      title?: string;
      url?: string;
      content?: string;
    }>;
  };

  return (data.results ?? [])
    .filter(r => r.url && r.title)
    .map(r => ({
      url: r.url!,
      title: r.title!,
      snippet: (r.content ?? "").slice(0, 400),
    }))
    .slice(0, 6);
}

/**
 * Combined search strategy:
 *  1. Tavily Search (if TAVILY_API_KEY is set) — real web results for AI
 *  2. Wikipedia — factual encyclopaedic coverage, run in parallel as supplement
 *  3. If Tavily is unavailable, falls back to Wikipedia-only results
 * Results are deduplicated by URL and capped at 8.
 */
async function runWebSearch(query: string): Promise<SearchResult[]> {
  const hasTavily = Boolean(process.env["TAVILY_API_KEY"]);

  const [tavilyResult, wikiResult] = await Promise.allSettled([
    tavilySearch(query),
    wikipediaSearch(query),
  ]);

  const tavilyItems = tavilyResult.status === "fulfilled" ? tavilyResult.value : [];
  const wikiItems = wikiResult.status === "fulfilled" ? wikiResult.value : [];

  // If Tavily returned results, use them as primary and supplement with Wikipedia.
  // If Tavily is not configured, fall back to Wikipedia alone.
  const primary = hasTavily && tavilyItems.length > 0 ? tavilyItems : wikiItems;
  const supplementary = hasTavily && tavilyItems.length > 0 ? wikiItems : [];

  const seen = new Set<string>();
  const combined = [...primary, ...supplementary].filter(r => {
    if (!r.url || seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  return combined.slice(0, 8);
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

// ── OpenAI client helper ──────────────────────────────────────────────────────

function getOpenAIClient(): OpenAI {
  const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const integrationBase = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (integrationKey && integrationBase) {
    return new OpenAI({ apiKey: integrationKey, baseURL: integrationBase });
  }
  const directKey = process.env.OPENAI_API_KEY;
  if (directKey) {
    return new OpenAI({ apiKey: directKey });
  }
  throw new Error("No OpenAI API key found. Set OPENAI_API_KEY or the Replit AI_INTEGRATIONS_OPENAI_* vars.");
}

// ── OpenAI Streaming helper (CORTEX LITE) ─────────────────────────────────────

const BASE_SYSTEM_PROMPT_LITE = `You are CORTEX AI (Lite Mode), the fast AI assistant of OmegaTeck Technology.

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

The prompt inside the brackets should be detailed and descriptive for best results. Do not add any other text before or after the bracket tag when generating an image.`;

function buildSystemPromptLite(systemAbout?: string | null, systemRespond?: string | null): string {
  let prompt = BASE_SYSTEM_PROMPT_LITE;
  if (systemAbout?.trim()) {
    prompt += `\n\n--- USER CONTEXT (always keep in mind) ---\n${systemAbout.trim()}`;
  }
  if (systemRespond?.trim()) {
    prompt += `\n\n--- RESPONSE STYLE PREFERENCES ---\n${systemRespond.trim()}`;
  }
  return prompt;
}

interface OpenAIChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

async function runOpenAIStreaming(
  chatMessages: OpenAIChatMsg[],
  systemPrompt: string,
  res: Response,
): Promise<string> {
  const openai = getOpenAIClient();
  const allMessages: OpenAIChatMsg[] = [
    { role: "system", content: systemPrompt },
    ...chatMessages,
  ];

  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: allMessages,
    stream: true,
    max_tokens: 8192,
  });

  let fullText = "";
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      fullText += delta;
      sseWrite(res, { content: delta });
    }
  }
  return fullText;
}

// ── Streaming conversation helper ─────────────────────────────────────────────

/** Extract the plain-text content from the last MessageParam in a list. */
function lastUserText(msgs: MessageParam[]): string {
  const last = msgs[msgs.length - 1];
  if (typeof last?.content === "string") return last.content;
  if (Array.isArray(last?.content)) {
    for (const b of last.content) {
      if (b.type === "text") return b.text;
    }
  }
  return "";
}

/**
 * Two-phase streaming conversation:
 *
 * Phase 1 – run a streaming call with the web_search tool (tool_choice: auto).
 *   Text deltas are forwarded to the SSE client immediately (true streaming).
 *   If the model uses the tool instead, collect the tool input JSON.
 *
 * Phase 2 – only when Phase 1 called a tool:
 *   Execute the web search, then run a second streaming synthesis call with
 *   the results embedded in the user message.  The tool_use/tool_result pair
 *   is omitted from the synthesis history because the Replit Anthropic proxy
 *   (Vertex AI / Claude) does not support tool_choice:"none", which is the
 *   mechanism that would normally prevent Claude from re-searching.
 *   A fallback synthesis call (no search context) is issued whenever the
 *   search query is unparseable or the search itself fails, so the response
 *   is always non-empty.
 */
async function runStreamingConversation(
  chatMessages: MessageParam[],
  system: string,
  res: Response,
  log: Request["log"]
): Promise<{ fullText: string; usedSearch: boolean; sources: WebSearchSource[] }> {
  let fullText = "";

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
    return { fullText, usedSearch: false, sources: [] };
  }

  // Phase 2 — search and synthesis
  sseWrite(res, { searching: true });

  let searchQuery = "";
  try {
    searchQuery = (JSON.parse(toolInputJson) as { query?: string }).query ?? "";
  } catch {
    searchQuery = "";
  }

  const sources: WebSearchSource[] = [];
  let contextText = "No search results available.";

  if (searchQuery) {
    let results: SearchResult[] = [];
    try {
      results = await runWebSearch(searchQuery);
    } catch (err) {
      log.warn({ err }, "Web search failed");
    }
    for (const r of results) {
      if (r.url && r.title && !sources.some(s => s.url === r.url)) {
        sources.push({ url: r.url, title: r.title });
      }
    }
    contextText =
      results.length > 0
        ? results.map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`).join("\n\n")
        : "No results found for this query.";
  }

  const originalUserText = lastUserText(chatMessages);
  const synthesisUserContent = searchQuery
    ? `[WEB SEARCH RESULTS for "${searchQuery}"]:\n\n${contextText}\n\n[END SEARCH RESULTS]\n\nUser question: ${originalUserText}`
    : originalUserText;

  const synthesisMessages: MessageParam[] = [
    ...chatMessages.slice(0, -1),
    { role: "user", content: synthesisUserContent },
  ];

  const synthesisStream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system,
    messages: synthesisMessages,
  });

  for await (const event of synthesisStream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      fullText += event.delta.text;
      sseWrite(res, { content: event.delta.text });
    }
  }

  return { fullText, usedSearch: true, sources };
}

// ── System prompt builder ─────────────────────────────────────────────────────

function buildSystemPrompt(systemAbout?: string | null, systemRespond?: string | null): string {
  let prompt = BASE_SYSTEM_PROMPT;
  if (systemAbout?.trim()) {
    prompt += `\n\n--- USER CONTEXT (always keep in mind) ---\n${systemAbout.trim()}`;
  }
  if (systemRespond?.trim()) {
    prompt += `\n\n--- RESPONSE STYLE PREFERENCES ---\n${systemRespond.trim()}`;
  }
  return prompt;
}

// ── Express router ────────────────────────────────────────────────────────────

const router: IRouter = Router();

const BASE_SYSTEM_PROMPT = `You are CORTEX AI, the advanced artificial intelligence assistant of OmegaTeck Technology.

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

  const { content, imageAttachment, imageAttachments: rawImageAttachments, systemAbout: guestAbout, systemRespond: guestRespond, cortexModel } = req.body as {
    content?: string;
    imageAttachment?: string;
    imageAttachments?: string[];
    systemAbout?: string;
    systemRespond?: string;
    cortexModel?: string;
  };
  const useLite = cortexModel === "cortex-lite";

  // Support both single (legacy) and multiple attachments
  const allAttachmentStrings: string[] = [];
  if (Array.isArray(rawImageAttachments)) {
    allAttachmentStrings.push(...rawImageAttachments.slice(0, 10));
  } else if (typeof imageAttachment === "string") {
    allAttachmentStrings.push(imageAttachment);
  }

  if (!content && allAttachmentStrings.length === 0) {
    res.status(400).json({ error: "Message content is required" });
    return;
  }

  const textContent = content ?? "";

  // Validate all image attachments before any DB writes
  const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
  type ParsedAttachment = { mediaType: AllowedMediaType; base64Data: string };
  const parsedAttachments: ParsedAttachment[] = [];
  for (const att of allAttachmentStrings) {
    if (typeof att !== "string" || !att.startsWith("data:image/")) {
      res.status(400).json({ error: "Invalid image attachment format" });
      return;
    }
    if (att.length > MAX_ATTACHMENT_BYTES * 1.4) {
      res.status(413).json({ error: "Image attachment too large (max 5 MB each)" });
      return;
    }
    const matches = att.match(/^data:(image\/(jpeg|png|gif|webp));base64,(.+)$/);
    if (!matches) {
      res.status(400).json({ error: "Unsupported image type — use JPEG, PNG, GIF, or WEBP" });
      return;
    }
    parsedAttachments.push({ mediaType: matches[1] as AllowedMediaType, base64Data: matches[3] });
  }

  try {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conv) { res.status(404).json({ error: "Not found" }); return; }
    const owner = getOwner(req);
    if (!isOwner(conv, owner)) { res.status(403).json({ error: "Forbidden" }); return; }

    // Resolve system instructions (DB for logged-in users, POST body for guests)
    let systemAbout: string | null = null;
    let systemRespond: string | null = null;
    if (owner.type === "user") {
      const [userRow] = await db
        .select({ systemAbout: usersTable.systemAbout, systemRespond: usersTable.systemRespond })
        .from(usersTable)
        .where(eq(usersTable.id, owner.userId))
        .limit(1);
      systemAbout = userRow?.systemAbout ?? null;
      systemRespond = userRow?.systemRespond ?? null;
    } else {
      systemAbout = typeof guestAbout === "string" ? guestAbout.trim().slice(0, 500) || null : null;
      systemRespond = typeof guestRespond === "string" ? guestRespond.trim().slice(0, 500) || null : null;
    }
    const effectiveSystemPrompt = buildSystemPrompt(systemAbout, systemRespond);

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

    // Compose the final user message (may include multiple images)
    if (parsedAttachments.length > 0) {
      const userContent: ContentBlockParam[] = parsedAttachments.map(att => ({
        type: "image",
        source: {
          type: "base64",
          media_type: att.mediaType,
          data: att.base64Data,
        },
      } satisfies ImageBlockParam));
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

    if (useLite) {
      // ── CORTEX LITE: OpenAI gpt-4o streaming ──────────────────────────────
      const liteSystemPrompt = buildSystemPromptLite(systemAbout, systemRespond);
      const openAIMsgs: OpenAIChatMsg[] = existingMessages.slice(0, -1).map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      openAIMsgs.push({ role: "user", content: textContent });
      fullResponse = await runOpenAIStreaming(openAIMsgs, liteSystemPrompt, res);
      usedSearch = false;
      sources = [];
    } else if (parsedAttachment) {
      // ── CORTEX standard: Claude with image — skip tool-use path ───────────
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: effectiveSystemPrompt,
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
      // ── CORTEX standard: Claude with web search tools ─────────────────────
      ({ fullText: fullResponse, usedSearch, sources } =
        await runStreamingConversation(chatMessages, effectiveSystemPrompt, res, req.log));
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
