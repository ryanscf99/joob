import OpenAI from "openai";

/** SpaceXAI / xAI OpenAI-compatible client (server-side only). */
export const XAI_BASE_URL = "https://api.x.ai/v1";
/** Default chat model — see https://docs.x.ai/docs/models */
export const XAI_MODEL = process.env.XAI_MODEL || "grok-4.5";

export function getXaiApiKey(): string | null {
  const key = process.env.XAI_API_KEY?.trim();
  return key || null;
}

export function createXaiClient(): OpenAI | null {
  const apiKey = getXaiApiKey();
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL: XAI_BASE_URL,
  });
}

export function isXaiConfigured(): boolean {
  return !!getXaiApiKey();
}
