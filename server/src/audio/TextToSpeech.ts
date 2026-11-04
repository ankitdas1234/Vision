import { elevenLabsConfig } from "../config/elevenlabs";
import { omniVoiceConfig } from "../config/omnivoice";
import { env } from "../config/env";
import { transcodeToPcm16 } from "./audioTranscode";

export interface SynthesisResult {
  audioBuffer: Buffer;
  durationMs: number;
  /** "pcm16" is directly playable on this hardware — raw 16-bit PCM
   * straight to the I2S speaker (see AudioManager::playChunk on the
   * firmware side and audio/PendingSpeechCache.ts), no decoder needed.
   * "mp3" has no on-device decoder yet — see docs/architecture-map.md §3. */
  format: "pcm16" | "mp3";
  sampleRateHz: number;
}

export interface TextToSpeechProvider {
  synthesize(text: string): Promise<SynthesisResult>;
}

export class MockTextToSpeech implements TextToSpeechProvider {
  async synthesize(text: string): Promise<SynthesisResult> {
    // MOCK MODE — returns an empty buffer; used when no TTS provider is configured.
    return { audioBuffer: Buffer.from(""), durationMs: Math.max(500, text.length * 60), format: "pcm16", sampleRateHz: 16000 };
  }
}

/**
 * FREE, no API key required — uses Microsoft Edge's "Read Aloud" text-to-speech
 * engine via the `msedge-tts` package. Same neural voices Edge uses in-browser,
 * no signup, no billing. Default voice `EDGE_TTS_VOICE` is a British male
 * neural voice; browse more at
 * https://github.com/Migushthe2nd/MsEdgeTTS#voices (or call `getVoices()`
 * on `MsEdgeTTS` for the live list).
 *
 * This library's own OUTPUT_FORMAT enum only exposes MP3 or Opus/WebM —
 * no raw PCM option — and this hardware has no on-device MP3/Opus decoder
 * (adding one would mean an untestable-in-this-repo embedded C++ audio
 * codec dependency). Rather than leave this provider's speech unplayable,
 * the MP3 it returns is transcoded to raw 16-bit PCM here, server-side,
 * using the real (not simulated) `ffmpeg-static` binary — see
 * audio/audioTranscode.ts and its test, which verifies this against actual
 * generated audio rather than assuming it works. Firmware then needs zero
 * special-casing: it already knows how to play a "pcm16" result the exact
 * same way it plays ElevenLabs' output.
 */
export class EdgeTextToSpeech implements TextToSpeechProvider {
  async synthesize(text: string): Promise<SynthesisResult> {
    const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
    const tts = new MsEdgeTTS();
    await tts.setMetadata(env.EDGE_TTS_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const { audioStream } = tts.toStream(text);
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) chunks.push(chunk as Buffer);
    tts.close();

    const mp3Buffer = Buffer.concat(chunks);
    const durationMs = Math.max(500, text.length * 55);

    if (mp3Buffer.length === 0) {
      return { audioBuffer: mp3Buffer, durationMs, format: "mp3", sampleRateHz: 24000 };
    }

    try {
      // 16kHz to match this firmware's I2S mic/speaker config exactly
      // (config/audio_config.h AUDIO_SAMPLE_RATE_HZ) — same target rate
      // ElevenLabsTextToSpeech below requests directly.
      const pcmBuffer = await transcodeToPcm16(mp3Buffer, 16000);
      return { audioBuffer: pcmBuffer, durationMs, format: "pcm16", sampleRateHz: 16000 };
    } catch (err) {
      // ffmpeg missing/broken on this host — fall back to returning the
      // MP3 as-is rather than failing the whole speak() call. Still
      // previewable on the dashboard; just won't play on the robot's
      // speaker this time (see PendingSpeechCache/CommandPoller, which
      // already skip playback for non-pcm16 formats).
      return { audioBuffer: mp3Buffer, durationMs, format: "mp3", sampleRateHz: 24000 };
    }
  }
}

/**
 * OmniVoice (k2-fsa/OmniVoice) — a massively multilingual (600+ languages)
 * zero-shot TTS model, served here via WaveSpeedAI's REST inference API.
 * Optional and opt-in: only used when TTS_PROVIDER=omnivoice and
 * WAVESPEED_API_KEY is set (see config/omnivoice.ts) — the default
 * remains EdgeTextToSpeech (free, no key). Distinguishing feature over
 * the other two providers is attribute-driven voice design (e.g.
 * "female, young adult, british accent") instead of picking a named
 * voice, and much broader language coverage.
 *
 * This is an asynchronous, poll-based API (submit a job, poll for
 * completion) unlike Edge/ElevenLabs' synchronous request/response —
 * WaveSpeedAI's own documented pattern is exactly what's implemented
 * here: submit, then GET the result endpoint every couple of seconds
 * until it reports "completed" (or a terminal failure status).
 *
 * WaveSpeedAI's docs don't pin down the exact audio container/codec
 * OmniVoice's output URL points to ("usually URL strings" is as specific
 * as they get) — rather than guess and risk being wrong, the fetched
 * audio is run through the same format-agnostic transcodeToPcm16 used
 * for Edge's MP3 output (see audio/audioTranscode.ts, which lets ffmpeg
 * auto-detect the actual format from the byte stream), so this works
 * regardless of exactly what comes back.
 *
 * HONEST NOTE: built precisely against WaveSpeedAI's published API
 * contract and covered by tests/unit/audio/tts.test.ts using a mocked
 * fetch — but this sandbox's network egress doesn't reach api.wavespeed.ai,
 * so an actual live generation has not been exercised end-to-end here.
 * Same caveat as ElevenLabsTextToSpeech/ElevenLabsSpeechToText above —
 * verify with a real key before relying on it.
 */
export class OmniVoiceTextToSpeech implements TextToSpeechProvider {
  private static readonly POLL_INTERVAL_MS = 1500;
  private static readonly MAX_POLL_ATTEMPTS = 20; // ~30s — generous given WaveSpeedAI's own "under 5 seconds" typical figure

  async synthesize(text: string): Promise<SynthesisResult> {
    if (!omniVoiceConfig.enabled) {
      throw new Error("WAVESPEED_API_KEY is not configured — set it in .env, or use TTS_PROVIDER=edge (free, no key needed)");
    }

    const submitRes = await fetch(`${omniVoiceConfig.baseUrl}/${omniVoiceConfig.model}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${omniVoiceConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        ...(omniVoiceConfig.voiceDescription ? { voice_description: omniVoiceConfig.voiceDescription } : {}),
      }),
    });
    if (!submitRes.ok) {
      throw new Error(`OmniVoice submit request failed: ${submitRes.status} ${await submitRes.text()}`);
    }
    const submitBody = (await submitRes.json()) as { data?: { id?: string } };
    const taskId = submitBody.data?.id;
    if (!taskId) {
      throw new Error("OmniVoice submit response did not contain a prediction id");
    }

    let outputUrl: string | undefined;
    for (let attempt = 0; attempt < OmniVoiceTextToSpeech.MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise((r) => setTimeout(r, OmniVoiceTextToSpeech.POLL_INTERVAL_MS));

      const resultRes = await fetch(`${omniVoiceConfig.baseUrl}/predictions/${taskId}/result`, {
        headers: { Authorization: `Bearer ${omniVoiceConfig.apiKey}` },
      });
      if (!resultRes.ok) {
        throw new Error(`OmniVoice result request failed: ${resultRes.status} ${await resultRes.text()}`);
      }
      const resultBody = (await resultRes.json()) as {
        data?: { status?: string; outputs?: unknown[]; error?: string };
      };
      const status = resultBody.data?.status;

      if (status === "completed") {
        const first = resultBody.data?.outputs?.[0];
        if (typeof first !== "string") {
          throw new Error("OmniVoice completed but did not return a usable audio URL");
        }
        outputUrl = first;
        break;
      }
      if (status === "failed" || status === "cancelled" || status === "timeout" || status === "deleted") {
        throw new Error(`OmniVoice generation ${status}: ${resultBody.data?.error ?? "no error detail provided"}`);
      }
      // Anything else (queued/processing/etc.) — keep polling.
    }

    if (!outputUrl) {
      throw new Error(`OmniVoice generation did not complete within ${(OmniVoiceTextToSpeech.MAX_POLL_ATTEMPTS * OmniVoiceTextToSpeech.POLL_INTERVAL_MS) / 1000}s`);
    }

    const audioRes = await fetch(outputUrl);
    if (!audioRes.ok) {
      throw new Error(`Fetching OmniVoice's generated audio failed: ${audioRes.status}`);
    }
    const rawAudio = Buffer.from(await audioRes.arrayBuffer());
    const durationMs = Math.max(500, text.length * 55);

    try {
      const pcmBuffer = await transcodeToPcm16(rawAudio, 16000);
      return { audioBuffer: pcmBuffer, durationMs, format: "pcm16", sampleRateHz: 16000 };
    } catch {
      // Same graceful fallback as EdgeTextToSpeech — still previewable on
      // the dashboard even if the transcode step itself failed.
      return { audioBuffer: rawAudio, durationMs, format: "mp3", sampleRateHz: 24000 };
    }
  }
}

/**
 * ElevenLabs TTS — paid, opt-in. Only used when TTS_PROVIDER=elevenlabs and
 * ELEVENLABS_API_KEY is set. Requests raw 16-bit PCM at 16kHz directly
 * (ElevenLabs' documented `output_format=pcm_16000`) rather than MP3 —
 * chosen specifically because it matches this firmware's existing I2S
 * config (AUDIO_SAMPLE_RATE_HZ 16000 in config/audio_config.h) exactly,
 * and needs no transcoding at all: the bytes go straight to
 * AudioManager::playChunk. EdgeTextToSpeech above reaches the same
 * playable pcm16 format too now, via a transcode step, so either provider
 * works on the physical speaker — this one just skips that extra step.
 */
export class ElevenLabsTextToSpeech implements TextToSpeechProvider {
  async synthesize(text: string): Promise<SynthesisResult> {
    if (!elevenLabsConfig.enabled) {
      throw new Error("ELEVENLABS_API_KEY is not configured — set it in .env, or use TTS_PROVIDER=edge (free, no key needed)");
    }

    const res = await fetch(`${elevenLabsConfig.baseUrl}/text-to-speech/${elevenLabsConfig.voiceId}?output_format=pcm_16000`, {
      method: "POST",
      headers: {
        "xi-api-key": elevenLabsConfig.apiKey!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: elevenLabsConfig.modelId,
        voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
      }),
    });

    if (!res.ok) {
      throw new Error(`ElevenLabs TTS request failed: ${res.status} ${await res.text()}`);
    }

    const audioBuffer = Buffer.from(await res.arrayBuffer());
    // Raw PCM has no header to derive duration from — estimate from byte
    // count instead: 16-bit mono at 16kHz = 32,000 bytes/second.
    const durationMs = Math.max(500, Math.round((audioBuffer.length / 32000) * 1000));
    return { audioBuffer, durationMs, format: "pcm16", sampleRateHz: 16000 };
  }
}


