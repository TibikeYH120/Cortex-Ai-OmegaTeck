import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db";
import { eq, asc, desc } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

const SYSTEM_PROMPT = `Te vagy a CORTEX AI, az OmegaTeck Technology fejlett mesterséges intelligencia asszisztense.

Az OmegaTeck Technology egy innovatív tech vállalat, alapítója és kreatív igazgatója Tibor. Projektjei: OmegaHumanity, VoidExio. Fókusz: játékfejlesztés, webfejlesztés, kreatív technológia, AI integráció.

Személyiség:
- Technológiai szakértő, barátságos, közvetlen stílus
- Ha magyarul írnak, magyarul válaszolj; ha angolul, angolul
- Kódot mindig \`\`\` blokkban adj meg
- Rövid, hatásos válaszok amikor lehet
- Szakértő: React, Next.js, Three.js, Tailwind CSS, game design, Roblox, Unreal Engine 5`;

router.get("/conversations", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(conversations).orderBy(desc(conversations.createdAt));
    res.json(rows.map(c => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
    })));
  } catch (err) {
    req.log.error({ err }, "List conversations error");
    res.status(500).json({ error: "Szerver hiba" });
  }
});

router.post("/conversations", async (req: Request, res: Response) => {
  const { title } = req.body;
  if (!title) {
    res.status(400).json({ error: "Cím kötelező" });
    return;
  }
  try {
    const [conv] = await db.insert(conversations).values({ title }).returning();
    res.status(201).json({
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Create conversation error");
    res.status(500).json({ error: "Szerver hiba" });
  }
});

router.get("/conversations/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Érvénytelen azonosító" });
    return;
  }
  try {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conv) {
      res.status(404).json({ error: "Nem található" });
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
    res.status(500).json({ error: "Szerver hiba" });
  }
});

router.delete("/conversations/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Érvénytelen azonosító" });
    return;
  }
  try {
    const deleted = await db.delete(conversations).where(eq(conversations.id, id)).returning();
    if (deleted.length === 0) {
      res.status(404).json({ error: "Nem található" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Delete conversation error");
    res.status(500).json({ error: "Szerver hiba" });
  }
});

router.get("/conversations/:id/messages", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Érvénytelen azonosító" });
    return;
  }
  try {
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
    res.status(500).json({ error: "Szerver hiba" });
  }
});

router.post("/conversations/:id/messages", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Érvénytelen azonosító" });
    return;
  }
  const { content } = req.body;
  if (!content) {
    res.status(400).json({ error: "Üzenet kötelező" });
    return;
  }

  try {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conv) {
      res.status(404).json({ error: "Nem található" });
      return;
    }

    await db.insert(messages).values({ conversationId: id, role: "user", content });

    const existingMessages = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt));
    const chatMessages = existingMessages.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

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
      }
    }

    await db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse });
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Send message error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Szerver hiba" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Szerver hiba" })}\n\n`);
      res.end();
    }
  }
});

export default router;
