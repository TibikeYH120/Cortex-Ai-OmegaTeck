import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const VOICE_IDS: Record<string, string> = {
  nova: "21m00Tcm4TlvDq8ikWAM",
  aria: "9BWtsMINqrJLrRacOk9x",
  echo: "TxGEqnHWrfWFTfGW9XjX",
  orion: "pNInz6obpgDQGcFmaJgB",
};

router.post("/", async (req: Request, res: Response) => {
  const { text, voiceId } = req.body as { text?: string; voiceId?: string };

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "TTS service not configured" });
    return;
  }

  const resolvedVoiceId =
    (voiceId && VOICE_IDS[voiceId]) ? VOICE_IDS[voiceId] :
    voiceId && Object.values(VOICE_IDS).includes(voiceId) ? voiceId :
    VOICE_IDS.nova;

  try {
    const elRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: text.trim().slice(0, 5000),
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.75,
            style: 0.05,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!elRes.ok) {
      const errBody = await elRes.text();
      req.log.error({ status: elRes.status, errBody }, "ElevenLabs TTS error");
      res.status(502).json({ error: "TTS upstream error" });
      return;
    }

    const audioBuffer = await elRes.arrayBuffer();
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(Buffer.from(audioBuffer));
  } catch (err) {
    req.log.error({ err }, "TTS route error");
    res.status(500).json({ error: "TTS failed" });
  }
});

export default router;
