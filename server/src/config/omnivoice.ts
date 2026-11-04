import { env } from "./env";

/**
 * OmniVoice (k2-fsa/OmniVoice, a massively multilingual zero-shot TTS
 * model — 600+ languages) served via WaveSpeedAI's REST inference API.
 * Optional, opt-in — only active when TTS_PROVIDER=omnivoice AND
 * WAVESPEED_API_KEY is set; the default provider remains "edge" (free,
 * no key needed). See audio/TextToSpeech.ts OmniVoiceTextToSpeech and
 * docs/audio.md for the full picture of available providers.
 */
export const omniVoiceConfig = {
  enabled: !!env.WAVESPEED_API_KEY,
  apiKey: env.WAVESPEED_API_KEY,
  baseUrl: "https://api.wavespeed.ai/api/v3",
  model: "wavespeed-ai/omnivoice/text-to-speech",
  voiceDescription: env.OMNIVOICE_VOICE_DESCRIPTION,
};
