import Anthropic from "@anthropic-ai/sdk";

function buildAnthropicClient(): Anthropic {
  const integrationKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const integrationBase = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;

  if (integrationKey && integrationBase) {
    return new Anthropic({ apiKey: integrationKey, baseURL: integrationBase });
  }

  const directKey = process.env.ANTHROPIC_API_KEY;
  if (directKey) {
    return new Anthropic({ apiKey: directKey });
  }

  throw new Error(
    "No Anthropic API key found. Set ANTHROPIC_API_KEY (or the Replit AI_INTEGRATIONS_ANTHROPIC_* vars)."
  );
}

export const anthropic = buildAnthropicClient();
