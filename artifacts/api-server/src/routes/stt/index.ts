import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

router.post("/", upload.single("audio"), async (req: Request, res: Response) => {
  if (!ELEVENLABS_API_KEY) {
    res.status(503).json({ error: "STT service not configured" });
    return;
  }

  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "audio file is required" });
    return;
  }

  try {
    const formData = new FormData();
    const blob = new Blob([file.buffer], { type: file.mimetype || "audio/webm" });
    formData.append("file", blob, file.originalname || "audio.webm");
    formData.append("model_id", "scribe_v1");

    const elRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: formData,
    });

    if (!elRes.ok) {
      const errBody = await elRes.text();
      req.log.error({ status: elRes.status, errBody }, "ElevenLabs STT error");
      res.status(502).json({ error: "STT upstream error" });
      return;
    }

    const data = await elRes.json() as { text?: string };
    res.json({ transcript: data.text || "" });
  } catch (err) {
    req.log.error({ err }, "STT route error");
    res.status(500).json({ error: "STT failed" });
  }
});

export default router;
