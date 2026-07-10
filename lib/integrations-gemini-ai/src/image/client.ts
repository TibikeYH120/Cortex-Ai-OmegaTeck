import { GoogleGenAI, Modality } from "@google/genai";

function buildGeminiImageClient(): GoogleGenAI {
  const integrationKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const integrationBase = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

  if (integrationKey && integrationBase) {
    return new GoogleGenAI({
      apiKey: integrationKey,
      httpOptions: { apiVersion: "", baseUrl: integrationBase },
    });
  }

  const directKey = process.env.GEMINI_API_KEY;
  if (directKey) {
    return new GoogleGenAI({ apiKey: directKey });
  }

  throw new Error(
    "No Gemini API key found. Set GEMINI_API_KEY (or the Replit AI_INTEGRATIONS_GEMINI_* vars)."
  );
}

export const ai = buildGeminiImageClient();

export async function generateImage(
  prompt: string
): Promise<{ b64_json: string; mimeType: string }> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
  );

  if (!imagePart?.inlineData?.data) {
    const textPart = candidate?.content?.parts?.find(
      (part: { text?: string }) => part.text
    ) as { text?: string } | undefined;
    const finishReason = candidate?.finishReason;
    const blockReason = (response as { promptFeedback?: { blockReason?: string } }).promptFeedback?.blockReason;

    console.error("[gemini-image] No image data in response.", {
      finishReason,
      blockReason,
      modelText: textPart?.text?.slice(0, 300),
    });

    if (blockReason) {
      throw new Error(`Image request blocked by safety filters (${blockReason}). Try rephrasing the prompt.`);
    }
    if (finishReason && finishReason !== "STOP") {
      throw new Error(`Image generation stopped early (${finishReason}). Try rephrasing the prompt.`);
    }
    if (textPart?.text) {
      throw new Error(`Model responded with text instead of an image: "${textPart.text.slice(0, 200)}"`);
    }
    throw new Error("No image data in response");
  }

  return {
    b64_json: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}
