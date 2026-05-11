import { Router, type IRouter, type Request, type Response } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

const VALID_API_KEYS = new Set([
  "ck_kTR5JaiDQ9Yv9wU6QuNCcHFeNbC2OSeR",
]);

function validateApiKey(req: Request): boolean {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return false;
  const key = auth.slice(7).trim();
  return VALID_API_KEYS.has(key);
}

router.post("/generate", async (req: Request, res: Response) => {
  if (!validateApiKey(req)) {
    res.status(401).json({ error: "Invalid or missing API key. Get your key at cortex-ai.omegateck.hu" });
    return;
  }

  const { prompt, system, maxTokens = 1024, temperature = 0.7 } = req.body as {
    prompt?: string;
    system?: string;
    maxTokens?: number;
    temperature?: number;
  };

  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "prompt is required and must be a string" });
    return;
  }

  const clampedTokens = Math.min(Math.max(1, maxTokens), 4096);

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: clampedTokens,
      system: system || "You are CORTEX AI, an advanced helpful assistant by OmegaTeck Technology.",
      messages: [{ role: "user", content: prompt }],
    });

    const textContent = message.content.find(c => c.type === "text");
    const responseText = textContent?.type === "text" ? textContent.text : "";

    res.json({
      response: responseText,
      model: "cortex-1-pro",
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ err }, "Cortex v1 generate error");
    res.status(500).json({ error: "Generation failed", detail: msg });
  }
});

export default router;
