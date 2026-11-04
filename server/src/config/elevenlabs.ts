import { env } from "./env";

export const elevenLabsConfig = {
  enabled: !!env.ELEVENLABS_API_KEY,
  apiKey: env.ELEVENLABS_API_KEY,
  voiceId: env.ELEVENLABS_VOICE_ID,
  modelId: env.ELEVENLABS_MODEL_ID,
  baseUrl: "https://api.elevenlabs.io/v1",
};
