import { Router, type IRouter, type Request, type Response } from "express";
import { generateImage } from "@workspace/integrations-gemini-ai/image";

const router: IRouter = Router();

router.post("/generate", async (req: Request, res: Response) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
    res.status(400).json({ error: "Prompt is required (min 3 characters)" });
    return;
  }

  try {
    const { b64_json, mimeType } = await generateImage(prompt.trim());
    const imageData = `data:${mimeType};base64,${b64_json}`;
    res.json({ imageData });
  } catch (err: any) {
    req.log.error({ err }, "Image generation error");
    res.status(500).json({ error: "Image generation failed: " + (err.message || "Unknown error") });
  }
});

export default router;
