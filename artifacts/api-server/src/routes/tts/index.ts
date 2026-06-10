import { Router, type IRouter, type Request, type Response } from "express";
import OpenAI from "openai";

const router: IRouter = Router();

const VOICE_MAP: Record<string, "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"> = {
  nova:  "nova",
  aria:  "shimmer",
  echo:  "echo",
  orion: "onyx",
};

function getOpenAIClient() {
  const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const integrationBase = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (integrationKey && integrationBase) {
    return new OpenAI({ apiKey: integrationKey, baseURL: integrationBase });
  }
  const directKey = process.env.OPENAI_API_KEY;
  if (directKey) return new OpenAI({ apiKey: directKey });
  throw new Error("No OpenAI API key found.");
}

router.post("/", async (req: Request, res: Response) => {
  const { text, voiceId } = req.body as { text?: string; voiceId?: string };

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const voice = (voiceId && VOICE_MAP[voiceId]) || "nova";

  try {
    const openai = getOpenAIClient();

    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice,
      input: text.trim().slice(0, 4000),
      response_format: "mp3",
    });

    const audioBuffer = Buffer.from(await mp3.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(audioBuffer);
  } catch (err: unknown) {
    req.log.error({ err }, "TTS route error");
    res.status(500).json({ error: "TTS failed" });
  }
});

export default router;
