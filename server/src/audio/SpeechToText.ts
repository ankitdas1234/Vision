import { elevenLabsConfig } from "../config/elevenlabs";
import { env } from "../config/env";

/** STT provider interface. Swap the mock for a real provider without touching callers. */
export interface TranscriptionResult { transcript: string; confidence: number; language: string }

export interface SpeechToTextProvider {
  transcribe(audioBuffer: Buffer): Promise<TranscriptionResult>;
}

export class MockSpeechToText implements SpeechToTextProvider {
  async transcribe(): Promise<TranscriptionResult> {
    // MOCK MODE — no real STT model wired up. This is also the default
    // (STT_PROVIDER=mock) since, unlike TTS, there's no free no-signup
    // option — see docs/audio.md "Hearing" for how to enable a real one.
    return { transcript: "", confidence: 0, language: "en" };
  }
}

/**
 * ElevenLabs speech-to-text ("Scribe"). Reuses ELEVENLABS_API_KEY —
 * convenient if that's already configured for TTS (see
 * audio/TextToSpeech.ts ElevenLabsTextToSpeech), since it's the same
 * account/key for both directions of the conversation pipeline. Sends the
 * audio as multipart/form-data per ElevenLabs' documented
 * POST /v1/speech-to-text contract.
 *
 * HONEST NOTE: this implementation is built precisely against
 * ElevenLabs' published API contract and its request/response handling
 * is covered by tests/unit/audio/stt.test.ts using a mocked fetch — but
 * this sandbox's network egress doesn't reach api.elevenlabs.io, so an
 * actual live transcription has not been exercised end-to-end here. The
 * same is true of ElevenLabsTextToSpeech and the OpenRouter vision
 * integration elsewhere in this codebase — verify with a real key before
 * relying on it in a live conversation.
 */
export class ElevenLabsSpeechToText implements SpeechToTextProvider {
  async transcribe(audioBuffer: Buffer): Promise<TranscriptionResult> {
    if (!elevenLabsConfig.enabled) {
      throw new Error("ELEVENLABS_API_KEY is not configured — set it in .env, or use STT_PROVIDER=mock/groq");
    }

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audioBuffer)], { type: "audio/wav" }), "audio.wav");
    form.append("model_id", "scribe_v1");

    const res = await fetch(`${elevenLabsConfig.baseUrl}/speech-to-text`, {
      method: "POST",
      headers: { "xi-api-key": elevenLabsConfig.apiKey! },
      body: form,
    });

    if (!res.ok) {
      throw new Error(`ElevenLabs STT request failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as { text?: string; language_code?: string; language_probability?: number };
    return {
      transcript: data.text ?? "",
      confidence: data.language_probability ?? 0.5,
      language: data.language_code ?? "en",
    };
  }
}

/**
 * Groq's OpenAI-compatible Whisper endpoint — a separate free-tier API key
 * from ElevenLabs (groq.com), chosen as the second option specifically
 * because Whisper-family transcription is well-documented, widely used,
 * and Groq's inference is unusually fast, which matters for a
 * conversational robot where transcription latency is part of the
 * perceived response time. Same honest live-verification caveat as
 * ElevenLabsSpeechToText above applies here too.
 */
export class GroqSpeechToText implements SpeechToTextProvider {
  async transcribe(audioBuffer: Buffer): Promise<TranscriptionResult> {
    if (!env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not configured — set it in .env, or use STT_PROVIDER=mock/elevenlabs");
    }

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audioBuffer)], { type: "audio/wav" }), "audio.wav");
    form.append("model", env.GROQ_STT_MODEL);
    form.append("response_format", "verbose_json"); // includes detected language, unlike the default plain-text/json shape

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: form,
    });

    if (!res.ok) {
      throw new Error(`Groq STT request failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as { text?: string; language?: string };
    return {
      transcript: data.text ?? "",
      // Groq's transcription response doesn't include a confidence score;
      // report a fixed moderate value rather than fabricating precision
      // the API doesn't provide.
      confidence: 0.6,
      language: data.language ?? "en",
    };
  }
}
