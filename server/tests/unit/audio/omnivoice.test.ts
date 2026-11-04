import { describe, it, expect, vi, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { OmniVoiceTextToSpeech } from "../../../src/audio/TextToSpeech";

const execFileAsync = promisify(execFile);

async function generateTestWav(durationSeconds: number): Promise<Buffer> {
  if (!ffmpegPath) throw new Error("ffmpeg-static not available in this environment");
  const { stdout } = await execFileAsync(
    ffmpegPath,
    ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=440:duration=${durationSeconds}`, "-f", "wav", "pipe:1"],
    { encoding: "buffer", maxBuffer: 20 * 1024 * 1024 },
  );
  return stdout as unknown as Buffer;
}

describe("OmniVoiceTextToSpeech", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.resetModules();
    vi.doUnmock("../../../src/config/omnivoice");
  });

  it("throws a clear error when unconfigured", async () => {
    await expect(new OmniVoiceTextToSpeech().synthesize("hello")).rejects.toThrow(/WAVESPEED_API_KEY/);
  });

  it("submits, polls until completed, fetches the audio, and transcodes it to pcm16", async () => {
    vi.resetModules();
    vi.doMock("../../../src/config/omnivoice", () => ({
      omniVoiceConfig: {
        enabled: true,
        apiKey: "test-key",
        baseUrl: "https://api.wavespeed.ai/api/v3",
        model: "wavespeed-ai/omnivoice/text-to-speech",
        voiceDescription: undefined,
      },
    }));

    const testWav = await generateTestWav(1);
    let pollCount = 0;

    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/wavespeed-ai/omnivoice/text-to-speech")) {
        expect(init?.method).toBe("POST");
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
        const body = JSON.parse(init!.body as string);
        expect(body.text).toBe("Hello there");
        return new Response(JSON.stringify({ code: 200, message: "success", data: { id: "task-123" } }), { status: 200 });
      }
      if (url.includes("/predictions/task-123/result")) {
        pollCount++;
        if (pollCount < 2) {
          return new Response(JSON.stringify({ data: { status: "processing" } }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: { status: "completed", outputs: ["https://cdn.example.com/audio.wav"] } }), { status: 200 });
      }
      if (url === "https://cdn.example.com/audio.wav") {
        return new Response(testWav, { status: 200 });
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const { OmniVoiceTextToSpeech: FreshProvider } = await import("../../../src/audio/TextToSpeech");
    const provider = new FreshProvider();
    const result = await provider.synthesize("Hello there");

    expect(result.format).toBe("pcm16");
    expect(result.sampleRateHz).toBe(16000);
    // 1s at 16kHz 16-bit mono ≈ 32,000 bytes.
    expect(result.audioBuffer.length).toBeGreaterThan(28_000);
    expect(result.audioBuffer.length).toBeLessThan(36_000);
    expect(pollCount).toBe(2);
  }, 20_000);

  it("throws a clear error when the job reports a terminal failure status", async () => {
    vi.resetModules();
    vi.doMock("../../../src/config/omnivoice", () => ({
      omniVoiceConfig: { enabled: true, apiKey: "test-key", baseUrl: "https://api.wavespeed.ai/api/v3", model: "wavespeed-ai/omnivoice/text-to-speech", voiceDescription: undefined },
    }));

    global.fetch = vi.fn(async (url: string) => {
      if (url.endsWith("/wavespeed-ai/omnivoice/text-to-speech")) {
        return new Response(JSON.stringify({ data: { id: "task-456" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: { status: "failed", error: "model overloaded" } }), { status: 200 });
    }) as unknown as typeof fetch;

    const { OmniVoiceTextToSpeech: FreshProvider } = await import("../../../src/audio/TextToSpeech");
    await expect(new FreshProvider().synthesize("hello")).rejects.toThrow(/model overloaded/);
  }, 15_000);

  it("throws a clear error if the submit response has no task id", async () => {
    vi.resetModules();
    vi.doMock("../../../src/config/omnivoice", () => ({
      omniVoiceConfig: { enabled: true, apiKey: "test-key", baseUrl: "https://api.wavespeed.ai/api/v3", model: "wavespeed-ai/omnivoice/text-to-speech", voiceDescription: undefined },
    }));
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ data: {} }), { status: 200 })) as unknown as typeof fetch;

    const { OmniVoiceTextToSpeech: FreshProvider } = await import("../../../src/audio/TextToSpeech");
    await expect(new FreshProvider().synthesize("hello")).rejects.toThrow(/prediction id/);
  });
});
