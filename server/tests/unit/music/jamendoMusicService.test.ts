import { describe, it, expect, vi, afterEach } from "vitest";
import { searchJamendo, fetchJamendoAudio, type JamendoTrack } from "../../../src/music/JamendoMusicService";

const ORIGINAL_CLIENT_ID = process.env.JAMENDO_CLIENT_ID;

describe("searchJamendo", () => {
  afterEach(() => {
    process.env.JAMENDO_CLIENT_ID = ORIGINAL_CLIENT_ID;
    vi.restoreAllMocks();
  });

  it("returns an empty array (not an error) when no client_id is configured", async () => {
    delete process.env.JAMENDO_CLIENT_ID;
    const results = await searchJamendo("some song");
    expect(results).toEqual([]);
  });

  it("returns mapped results on a successful response", async () => {
    process.env.JAMENDO_CLIENT_ID = "test-client-id";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          headers: { status: "success", code: 0 },
          results: [{ id: "123", name: "Test Track", artist_name: "Test Artist", duration: 200, audio: "https://example.com/track.mp3" }],
        }),
      }),
    );

    const results = await searchJamendo("test");
    expect(results).toEqual([{ id: "123", name: "Test Track", artistName: "Test Artist", durationSec: 200, audioUrl: "https://example.com/track.mp3" }]);
    vi.unstubAllGlobals();
  });

  it("returns an empty array (not a thrown error) when the HTTP request fails", async () => {
    process.env.JAMENDO_CLIENT_ID = "test-client-id";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const results = await searchJamendo("test");
    expect(results).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("returns an empty array (not a thrown error) when fetch itself rejects", async () => {
    process.env.JAMENDO_CLIENT_ID = "test-client-id";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        throw new Error("network down");
      }),
    );
    const results = await searchJamendo("test");
    expect(results).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("returns an empty array when the catalog has no matches", async () => {
    process.env.JAMENDO_CLIENT_ID = "test-client-id";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ headers: { status: "success", code: 0 }, results: [] }) }),
    );
    const results = await searchJamendo("something extremely obscure");
    expect(results).toEqual([]);
    vi.unstubAllGlobals();
  });
});

describe("fetchJamendoAudio", () => {
  afterEach(() => vi.restoreAllMocks());

  const track: JamendoTrack = { id: "1", name: "Track", artistName: "Artist", durationSec: 100, audioUrl: "https://example.com/a.mp3" };

  it("returns the real audio bytes on success", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => bytes }));
    const result = await fetchJamendoAudio(track);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBe(4);
    vi.unstubAllGlobals();
  });

  it("throws a clear error when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(fetchJamendoAudio(track)).rejects.toThrow(/404/);
    vi.unstubAllGlobals();
  });
});
