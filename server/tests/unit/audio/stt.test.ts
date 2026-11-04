import { describe, it, expect, vi, afterEach } from "vitest";
import { MockSpeechToText, ElevenLabsSpeechToText, GroqSpeechToText } from "../../../src/audio/SpeechToText";

describe("speech-to-text providers", () => {
  it("mock provider returns an empty transcript", async () => {
    const result = await new MockSpeechToText().transcribe(Buffer.from("anything"));
    expect(result.transcript).toBe("");
    expect(result.confidence).toBe(0);
  });

  it("ElevenLabs STT throws a clear error when unconfigured", async () => {
    await expect(new ElevenLabsSpeechToText().transcribe(Buffer.from("audio"))).rejects.toThrow(/ELEVENLABS_API_KEY/);
  });

  it("Groq STT throws a clear error when unconfigured", async () => {
    await expect(new GroqSpeechToText().transcribe(Buffer.from("audio"))).rejects.toThrow(/GROQ_API_KEY/);
  });

  describe("with mocked network + configured keys", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
      vi.resetModules();
      vi.doUnmock("../../../src/config/elevenlabs");
      vi.doUnmock("../../../src/config/env");
    });

    it("ElevenLabsSpeechToText sends multipart form data and parses the response", async () => {
      vi.resetModules();
      vi.doMock("../../../src/config/elevenlabs", () => ({
        elevenLabsConfig: { enabled: true, apiKey: "test-key", baseUrl: "https://api.elevenlabs.io/v1", voiceId: "v", modelId: "m" },
      }));
      const fetchSpy = vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
        expect(init.method).toBe("POST");
        expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("test-key");
        expect(init.body).toBeInstanceOf(FormData);
        return new Response(JSON.stringify({ text: "hello there", language_code: "en", language_probability: 0.95 }), { status: 200 });
      });
      global.fetch = fetchSpy as unknown as typeof fetch;

      const { ElevenLabsSpeechToText: FreshProvider } = await import("../../../src/audio/SpeechToText");
      const result = await new FreshProvider().transcribe(Buffer.from("fake wav bytes"));

      expect(result.transcript).toBe("hello there");
      expect(result.language).toBe("en");
      expect(result.confidence).toBe(0.95);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("ElevenLabsSpeechToText surfaces a clear error on a non-OK response", async () => {
      vi.resetModules();
      vi.doMock("../../../src/config/elevenlabs", () => ({
        elevenLabsConfig: { enabled: true, apiKey: "test-key", baseUrl: "https://api.elevenlabs.io/v1", voiceId: "v", modelId: "m" },
      }));
      global.fetch = vi.fn(async () => new Response("bad request", { status: 400 })) as unknown as typeof fetch;

      const { ElevenLabsSpeechToText: FreshProvider } = await import("../../../src/audio/SpeechToText");
      await expect(new FreshProvider().transcribe(Buffer.from("x"))).rejects.toThrow(/400/);
    });

    it("GroqSpeechToText sends multipart form data with model + verbose_json and parses the response", async () => {
      vi.resetModules();
      vi.doMock("../../../src/config/env", () => ({
        env: { GROQ_API_KEY: "groq-test-key", GROQ_STT_MODEL: "whisper-large-v3-turbo" },
      }));
      const fetchSpy = vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer groq-test-key");
        expect(init.body).toBeInstanceOf(FormData);
        return new Response(JSON.stringify({ text: "what's the weather", language: "english" }), { status: 200 });
      });
      global.fetch = fetchSpy as unknown as typeof fetch;

      const { GroqSpeechToText: FreshProvider } = await import("../../../src/audio/SpeechToText");
      const result = await new FreshProvider().transcribe(Buffer.from("fake wav bytes"));

      expect(result.transcript).toBe("what's the weather");
      expect(result.language).toBe("english");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("GroqSpeechToText surfaces a clear error on a non-OK response", async () => {
      vi.resetModules();
      vi.doMock("../../../src/config/env", () => ({
        env: { GROQ_API_KEY: "groq-test-key", GROQ_STT_MODEL: "whisper-large-v3-turbo" },
      }));
      global.fetch = vi.fn(async () => new Response("unauthorized", { status: 401 })) as unknown as typeof fetch;

      const { GroqSpeechToText: FreshProvider } = await import("../../../src/audio/SpeechToText");
      await expect(new FreshProvider().transcribe(Buffer.from("x"))).rejects.toThrow(/401/);
    });
  });
});
