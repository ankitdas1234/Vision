import { MockSpeechToText, ElevenLabsSpeechToText, GroqSpeechToText, type SpeechToTextProvider } from "./SpeechToText";
import { MockTextToSpeech, EdgeTextToSpeech, ElevenLabsTextToSpeech, OmniVoiceTextToSpeech, type TextToSpeechProvider } from "./TextToSpeech";
import { understandIntent, type Intent } from "./IntentEngine";
import { googleDriveService } from "../google-drive/GoogleDriveService";
import { elevenLabsConfig } from "../config/elevenlabs";
import { omniVoiceConfig } from "../config/omnivoice";
import { env } from "../config/env";

export type AudioState = "IDLE" | "LISTENING" | "PROCESSING" | "SPEAKING";

function defaultTtsProvider(): TextToSpeechProvider {
  if (env.TTS_PROVIDER === "elevenlabs" && elevenLabsConfig.enabled) return new ElevenLabsTextToSpeech();
  if (env.TTS_PROVIDER === "omnivoice" && omniVoiceConfig.enabled) return new OmniVoiceTextToSpeech();
  if (env.TTS_PROVIDER === "mock") return new MockTextToSpeech();
  return new EdgeTextToSpeech(); // free, no API key — default
}

/** No free no-signup STT option exists (unlike TTS's Edge default), so
 * this stays MockSpeechToText unless the operator explicitly configures
 * one — see config/env.ts STT_PROVIDER and docs/audio.md "Hearing". */
function defaultSttProvider(): SpeechToTextProvider {
  if (env.STT_PROVIDER === "elevenlabs" && elevenLabsConfig.enabled) return new ElevenLabsSpeechToText();
  if (env.STT_PROVIDER === "groq" && env.GROQ_API_KEY) return new GroqSpeechToText();
  return new MockSpeechToText();
}

/**
 * Orchestrates the microphone -> STT -> intent -> ... -> TTS -> speaker
 * pipeline. Movement intents are NOT executed here — they're handed back
 * to the caller (brain/routes) so they still go through the Command
 * Registry, authorization, and safety like any other command.
 */
export class AudioService {
  private state: AudioState = "IDLE";
  constructor(
    private stt: SpeechToTextProvider = defaultSttProvider(),
    private tts: TextToSpeechProvider = defaultTtsProvider()
  ) {}

  getState() { return this.state; }

  startListening() { this.state = "LISTENING"; return { state: this.state }; }
  stopListening() { this.state = "IDLE"; return { state: this.state }; }

  async processAudio(audioBuffer: Buffer, robotId: string): Promise<{ transcript: string; confidence: number; intent: Intent; storedAudio: boolean }> {
    this.state = "PROCESSING";
    const transcription = await this.stt.transcribe(audioBuffer);
    const intent = understandIntent(transcription.transcript);
    const upload = await googleDriveService.uploadAudio(audioBuffer, `${robotId}-${Date.now()}.wav`);
    this.state = "IDLE";
    return { transcript: transcription.transcript, confidence: transcription.confidence, intent, storedAudio: upload.stored };
  }

  async speak(text: string): Promise<{ durationMs: number; audioBase64?: string; mimeType?: string; format?: "pcm16" | "mp3"; sampleRateHz?: number }> {
    this.state = "SPEAKING";
    const result = await this.tts.synthesize(text);
    this.state = "IDLE";
    // Non-empty buffer (i.e. a real provider is configured) is also returned as
    // base64 so the dashboard can preview it directly. Actually reaching the
    // robot's physical speaker is a separate step — see
    // commands/CommandExecutor.ts's AUDIO_SPEAK handler, which caches this
    // in audio/PendingSpeechCache.ts for CommandPoller.cpp to fetch.
    if (result.audioBuffer.length === 0) return { durationMs: result.durationMs };
    return {
      durationMs: result.durationMs,
      audioBase64: result.audioBuffer.toString("base64"),
      mimeType: result.format === "pcm16" ? "audio/pcm" : "audio/mpeg",
      format: result.format,
      sampleRateHz: result.sampleRateHz,
    };
  }

  stopAudio() { this.state = "IDLE"; return { state: this.state }; }
}

export const audioService = new AudioService();
