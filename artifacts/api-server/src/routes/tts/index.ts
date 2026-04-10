import { Router, type IRouter, type Request, type Response } from "express";
import OpenAI from "openai";

const router: IRouter = Router();

const OPENAI_VOICE_MAP: Record<string, string> = {
  nova: "nova",
  aria: "shimmer",
  echo: "echo",
  orion: "onyx",
};

function getOpenAIClient() {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey || !baseURL) {
    throw new Error("AI_INTEGRATIONS_OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_BASE_URL is not set");
  }
  return new OpenAI({ apiKey, baseURL });
}

router.post("/", async (req: Request, res: Response) => {
  const { text, voiceId } = req.body as { text?: string; voiceId?: string };

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const openaiVoice = (voiceId && OPENAI_VOICE_MAP[voiceId]) || "nova";

  try {
    const openai = getOpenAIClient();

    const response = await openai.chat.completions.create({
      model: "gpt-audio-mini",
      modalities: ["text", "audio"],
      audio: { voice: openaiVoice as "nova" | "shimmer" | "echo" | "onyx", format: "mp3" },
      messages: [
        {
          role: "system",
          content: "You are a text-to-speech assistant. Read the user's text aloud exactly as written, word for word, without adding any commentary, acknowledgments, or extra words.",
        },
        {
          role: "user",
          content: text.trim().slice(0, 4000),
        },
      ],
    });

    const audioData = response.choices[0]?.message?.audio?.data;
    if (!audioData) {
      req.log.error({ response }, "No audio data in TTS response");
      res.status(502).json({ error: "No audio in response" });
      return;
    }

    const audioBuffer = Buffer.from(audioData, "base64");
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(audioBuffer);
  } catch (err: unknown) {
    req.log.error({ err }, "TTS route error");
    res.status(500).json({ error: "TTS failed" });
  }
});

export default router;
