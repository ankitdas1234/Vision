/**
 * Vision has ONE mono I2S microphone — it cannot separate two overlapping
 * voices in hardware. Real "who's talking" separation needs one of:
 *   (a) a diarization-capable STT provider (e.g. Deepgram, AssemblyAI,
 *       Whisper + pyannote) that returns speaker-tagged segments from a
 *       single mono stream, or
 *   (b) a physical mic array with beamforming, or
 *   (c) camera-assisted active-speaker detection (Vision already has a
 *       camera and tracks people — correlating mouth movement with audio
 *       energy is a cheaper next step than new hardware).
 *
 * Until one of those is wired in, MockDiarization treats every audio
 * buffer as exactly one speaker (today's actual behavior) — but the rest
 * of the pipeline (ConversationArbiterService, speech_events logging,
 * admin-veto handling) is already speaker-aware and will "just work" the
 * moment a real provider is swapped in here, the same way TextToSpeech
 * providers are swapped in AudioService.
 */
export interface SpeakerSegment {
  speakerTag: string; // provider-local id, e.g. "spk_0", "spk_1" — not a person identity by itself
  transcript: string;
  confidence: number;
  startMs: number;
  endMs: number;
  /** True only when this segment's voiceprint matched an enrolled ADMIN voice.
   * Never inferred from role/session alone — that would let anyone standing
   * near an admin's open dashboard session claim admin priority. */
  isAdmin?: boolean;
  /** Best-guess link to a tracked `people` row (face/voice match), if any. */
  personId?: string | null;
}

export interface DiarizationProvider {
  /** Splits one audio buffer into per-speaker segments. Segments that
   * overlap in time (startMs/endMs ranges intersect) represent simultaneous
   * speech — that's what ConversationArbiterService uses to detect it. */
  diarize(audioBuffer: Buffer): Promise<SpeakerSegment[]>;
}

export class MockDiarization implements DiarizationProvider {
  async diarize(): Promise<SpeakerSegment[]> {
    // MOCK MODE — no real diarization model wired up; report silence.
    // A real provider fills this with 1+ speaker-tagged segments.
    return [];
  }
}

export const diarizationProvider: DiarizationProvider = new MockDiarization();
