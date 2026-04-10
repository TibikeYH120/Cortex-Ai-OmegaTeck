import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import OpenAI, { toFile } from "openai";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function getOpenAIClient() {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey || !baseURL) {
    throw new Error("AI_INTEGRATIONS_OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_BASE_URL is not set");
  }
  return new OpenAI({ apiKey, baseURL });
}

router.post("/", upload.single("audio"), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "audio file is required" });
    return;
  }

  try {
    const openai = getOpenAIClient();

    const audioFile = await toFile(
      file.buffer,
      file.originalname || "recording.webm",
      { type: file.mimetype || "audio/webm" },
    );

    const transcription = await openai.audio.transcriptions.create({
      model: "gpt-4o-mini-transcribe",
      file: audioFile,
      response_format: "json",
    });

    res.json({ transcript: transcription.text || "" });
  } catch (err: unknown) {
    req.log.error({ err }, "STT route error");
    res.status(500).json({ error: "STT failed" });
  }
});

export default router;
