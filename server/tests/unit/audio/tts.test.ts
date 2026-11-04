import { describe, it, expect, vi } from "vitest";
import { MockTextToSpeech, EdgeTextToSpeech, ElevenLabsTextToSpeech } from "../../../src/audio/TextToSpeech";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);

describe("text-to-speech providers", () => {
  it("mock provider returns silence with an estimated duration", async () => {
    const result = await new MockTextToSpeech().synthesize("Hello there");
    expect(result.audioBuffer.length).toBe(0);
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it("EdgeTextToSpeech (free, default) is instantiable and implements the shared interface", () => {
    const provider = new EdgeTextToSpeech();
    expect(typeof provider.synthesize).toBe("function");
  });

  it("ElevenLabs provider throws a clear error when unconfigured, pointing at the free alternative", async () => {
    await expect(new ElevenLabsTextToSpeech().synthesize("Hello")).rejects.toThrow(/TTS_PROVIDER=edge/);
  });

  describe("EdgeTextToSpeech end-to-end MP3->PCM transcoding (mocked network call, real ffmpeg)", () => {
    it("returns playable pcm16 by transcoding the (mocked) MP3 response with the real ffmpeg binary", async () => {
      // Can't reach Microsoft's live TTS service from this test
      // environment — mock just the network-dependent library call, but
      // let the actual transcode step run against real ffmpeg, so this
      // proves the integration works rather than assuming it.
      if (!ffmpegPath) return; // environment has no ffmpeg binary — skip rather than fail
      const { stdout: testMp3 } = await execFileAsync(
        ffmpegPath,
        ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.5", "-codec:a", "libmp3lame", "-f", "mp3", "pipe:1"],
        { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 },
      );

      vi.doMock("msedge-tts", () => ({
        MsEdgeTTS: class {
          async setMetadata() {}
          toStream() {
            return {
              audioStream: (async function* () {
                yield testMp3 as unknown as Buffer;
              })(),
            };
          }
          close() {}
        },
        OUTPUT_FORMAT: { AUDIO_24KHZ_48KBITRATE_MONO_MP3: "audio-24khz-48kbitrate-mono-mp3" },
      }));
      vi.resetModules();
      const { EdgeTextToSpeech: FreshEdgeTTS } = await import("../../../src/audio/TextToSpeech");

      const result = await new FreshEdgeTTS().synthesize("Hello there");

      expect(result.format).toBe("pcm16");
      expect(result.sampleRateHz).toBe(16000);
      // 0.5s at 16kHz, 16-bit mono ≈ 16,000 bytes.
      expect(result.audioBuffer.length).toBeGreaterThan(14_000);
      expect(result.audioBuffer.length).toBeLessThan(20_000);

      vi.doUnmock("msedge-tts");
      vi.resetModules();
    }, 15_000);
  });
});
