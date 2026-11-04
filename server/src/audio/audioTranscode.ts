import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

/**
 * Any format -> raw 16-bit PCM transcoding, done server-side.
 * ------------------------------------------------------------
 * This exists to close a real gap: some TTS providers only output a
 * compressed/container format (MP3, WAV-with-unusual-encoding, etc.), and
 * this hardware's firmware has no on-device audio codec at all. Two ways
 * to fix that: add a codec library to the ESP32 firmware (untestable
 * here — this repo has no way to compile or run embedded C++, so shipping
 * that blind would risk breaking real hardware in ways nobody could catch
 * until it's flashed), or convert to PCM once, server-side, where the
 * conversion can actually be tested end-to-end with real audio. This is
 * that second, verifiable option — `ffmpeg-static` bundles a real,
 * working ffmpeg binary (verified in this codebase's own test suite by
 * generating real tones, encoding them, and transcoding them back — see
 * tests/unit/audio/audioTranscode.test.ts).
 *
 * Deliberately format-agnostic: ffmpeg auto-detects the input container/
 * codec from the byte stream itself (no file extension or content-type
 * needed), so the same function serves EdgeTextToSpeech (MP3),
 * OmniVoiceTextToSpeech (whatever WaveSpeedAI's OmniVoice model returns —
 * their docs don't pin this down, and auto-detection means it doesn't
 * need to), and any future provider without new code.
 *
 * Once this runs, firmware needs ZERO changes: `protocol/CommandPoller.cpp`
 * already knows how to play a "pcm16" `PendingSpeech` entry (see
 * audio/PendingSpeechCache.ts) — it was written generically, not tied to
 * any one provider, so any provider's output reaching it in this format
 * just works.
 */
export async function transcodeToPcm16(inputBuffer: Buffer, sampleRateHz = 16000): Promise<Buffer> {
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static did not resolve a binary for this platform — audio cannot be transcoded to PCM on this host");
  }
  const binaryPath: string = ffmpegPath;

  return new Promise<Buffer>((resolve, reject) => {
    const ffmpeg = spawn(binaryPath, [
      "-hide_banner",
      "-loglevel", "error",
      "-i", "pipe:0", // format auto-detected from the byte stream
      "-f", "s16le",
      "-acodec", "pcm_s16le",
      "-ar", String(sampleRateHz),
      "-ac", "1", // mono — matches the single-channel I2S speaker wiring
      "pipe:1",
    ]);

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    ffmpeg.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    ffmpeg.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    ffmpeg.on("error", reject); // e.g. binary missing/not executable
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout));
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${Buffer.concat(stderr).toString("utf8").slice(0, 500)}`));
      }
    });

    ffmpeg.stdin.on("error", () => {
      // Writing to a closed/errored stdin (e.g. ffmpeg exited early on a
      // malformed buffer) throws EPIPE — the "close" handler above still
      // fires with a meaningful exit code, so this only needs to swallow
      // the otherwise-unhandled write error, not do anything itself.
    });
    ffmpeg.stdin.end(inputBuffer);
  });
}

/** Alias kept for call sites/tests that specifically mean "this input is
 * MP3" — identical implementation, since transcodeToPcm16 already
 * auto-detects the input format regardless of name. */
export const transcodeMp3ToPcm16 = transcodeToPcm16;
