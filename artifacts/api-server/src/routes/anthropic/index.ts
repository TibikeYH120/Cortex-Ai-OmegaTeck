import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db";
import { eq, asc, desc, and } from "drizzle-orm";
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
  content: string | ContentBlockParam[];
}

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

The prompt inside the brackets should be detailed and descriptive for best results. Do not add any other text before or after the bracket tag when generating an image.`;

// Helper: resolve the authenticated user's ID, or return null for unauthenticated requests.
// Guests never reach these endpoints (frontend blocks API calls in guest mode).
function getSessionUserId(req: Request): number | null {
  return req.session.userId ?? null;
}

router.get("/conversations", async (req: Request, res: Response) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
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
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { title } = req.body;
  if (!title) {
    res.status(400).json({ error: "Title is required" });
    return;
  }
  try {
    const [conv] = await db.insert(conversations).values({ title, userId }).returning();
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
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  try {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .limit(1);
    if (!conv) {
      res.status(404).json({ error: "Not found" });
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
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  try {
    const deleted = await db
      .delete(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .returning();
    if (deleted.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Delete conversation error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/conversations/:id/messages", async (req: Request, res: Response) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  try {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .limit(1);
    if (!conv) {
      res.status(404).json({ error: "Not found" });
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
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
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
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .limit(1);
    if (!conv) {
      res.status(404).json({ error: "Not found" });
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
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: chatMessages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullResponse += event.delta.text;
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
        // Force-flush each chunk so the proxy doesn't buffer the stream
        (res as any).flush?.();
      }
    }

    await db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse });
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
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
