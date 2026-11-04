import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { transcodeToPcm16 } from "../../../src/audio/audioTranscode";

const execFileAsync = promisify(execFile);

/** Generates a real 1-second 440Hz tone MP3 entirely locally (no network,
 * no TTS provider needed) — a stand-in for what EdgeTextToSpeech's output
 * looks like: a real, valid MP3 byte buffer. */
async function generateTestMp3(durationSeconds: number): Promise<Buffer> {
  if (!ffmpegPath) throw new Error("ffmpeg-static not available in this environment");
  const { stdout } = await execFileAsync(
    ffmpegPath,
    ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=440:duration=${durationSeconds}`, "-codec:a", "libmp3lame", "-f", "mp3", "pipe:1"],
    { encoding: "buffer", maxBuffer: 50 * 1024 * 1024 },
  );
  return stdout as unknown as Buffer;
}

describe("transcodeToPcm16 (real ffmpeg, real audio — not mocked)", () => {
  let oneSecondMp3: Buffer;

  beforeAll(async () => {
    oneSecondMp3 = await generateTestMp3(1);
  }, 20_000);

  it("produces a real, valid MP3 fixture to test against", () => {
    expect(oneSecondMp3.length).toBeGreaterThan(1000);
  });

  it("transcodes to roughly the expected number of PCM bytes for the requested sample rate", async () => {
    const pcm = await transcodeToPcm16(oneSecondMp3, 16000);
    // 1 second * 16000 Hz * 2 bytes/sample (16-bit) * 1 channel (mono) = 32,000 bytes.
    // Small variance is normal (MP3 encoder priming/padding samples).
    expect(pcm.length).toBeGreaterThan(30_000);
    expect(pcm.length).toBeLessThan(36_000);
  }, 15_000);

  it("respects a different requested sample rate", async () => {
    const pcm = await transcodeToPcm16(oneSecondMp3, 8000);
    // 1 second * 8000 Hz * 2 bytes = 16,000 bytes.
    expect(pcm.length).toBeGreaterThan(14_000);
    expect(pcm.length).toBeLessThan(18_000);
  }, 15_000);

  it("produces output containing real signal, not silence/garbage", async () => {
    const pcm = await transcodeToPcm16(oneSecondMp3, 16000);
    // A 440Hz sine wave should have plenty of nonzero 16-bit samples —
    // silence or a failed decode would be all (or almost all) zero bytes.
    let nonZeroBytes = 0;
    for (let i = 0; i < pcm.length; i++) if (pcm[i] !== 0) nonZeroBytes++;
    expect(nonZeroBytes / pcm.length).toBeGreaterThan(0.5);
  }, 15_000);

  it("rejects cleanly on genuinely invalid input rather than hanging", async () => {
    await expect(transcodeToPcm16(Buffer.from("not an mp3 at all"), 16000)).rejects.toThrow();
  }, 15_000);

  it("handles a very short clip without error", async () => {
    const shortMp3 = await generateTestMp3(0.2);
    const pcm = await transcodeToPcm16(shortMp3, 16000);
    expect(pcm.length).toBeGreaterThan(0);
  }, 15_000);
});
