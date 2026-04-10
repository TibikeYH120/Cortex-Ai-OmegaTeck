import { GoogleGenAI } from "@google/genai";

function buildGeminiClient(): GoogleGenAI {
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

export const ai = buildGeminiClient();
