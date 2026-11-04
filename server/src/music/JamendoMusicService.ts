import { logger } from "../logging/Logger";

/**
 * JAMENDO MUSIC SERVICE
 * -----------------------
 * The actual legal audio source for "Vision, play [song]" — Jamendo is a
 * free-to-use catalog of Creative Commons-licensed music with a public
 * REST API that returns real, directly-fetchable MP3 stream URLs. This
 * is the opposite of what youtube-dl-exec/yt-dlp does: nothing here
 * extracts or rips a stream from a source that didn't intend to serve
 * it — Jamendo's API is *built* for exactly this use case.
 *
 * Requires a free Jamendo API client_id (register at
 * https://devportal.jamendo.com — takes a couple of minutes, no cost),
 * set as JAMENDO_CLIENT_ID. Without one, search() returns an empty
 * result and PlaySongService reports "not found" honestly rather than
 * failing in a confusing way.
 *
 * HONEST LIMITATION: this sandbox's network whitelist blocks
 * api.jamendo.com directly (confirmed by testing, not assumed — same
 * class of restriction documented elsewhere in this codebase for
 * storage.googleapis.com and media.githubusercontent.com), so the live
 * HTTP call in search()/fetchAudio() could not be exercised end-to-end
 * here. The request/response shapes below match Jamendo's public API
 * documentation exactly; tests mock the HTTP layer (see
 * tests/unit/music/jamendoMusicService.test.ts) rather than skip
 * coverage entirely. This will make a real network call the moment it
 * runs somewhere with normal internet access and a real client_id.
 */

const JAMENDO_API_BASE = "https://api.jamendo.com/v3.0";

export interface JamendoTrack {
  id: string;
  name: string;
  artistName: string;
  durationSec: number;
  /** Direct, legally-servable MP3 URL — Jamendo's own CDN, not an
   * extracted/ripped stream. */
  audioUrl: string;
}

interface JamendoApiTrack {
  id: string;
  name: string;
  artist_name: string;
  duration: number;
  audio: string;
}

interface JamendoApiResponse {
  headers: { status: string; code: number };
  results: JamendoApiTrack[];
}

function clientId(): string | null {
  return process.env.JAMENDO_CLIENT_ID || null;
}

/**
 * Searches Jamendo's catalog for a track matching the given free-text
 * query (whatever the person asked for, e.g. "some upbeat coldplay").
 * Returns an empty array — not an error — if no client_id is configured
 * or nothing matches; PlaySongService treats both the same way (report
 * honestly that nothing licensed was found for this request).
 */
export async function searchJamendo(query: string, limit = 5): Promise<JamendoTrack[]> {
  const id = clientId();
  if (!id) {
    logger.debug("JAMENDO_CLIENT_ID not configured — song search will report no results", { query });
    return [];
  }

  const url = new URL(`${JAMENDO_API_BASE}/tracks/`);
  url.searchParams.set("client_id", id);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("search", query);
  url.searchParams.set("audioformat", "mp31");

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      logger.warn("Jamendo search request failed", { status: response.status, query });
      return [];
    }
    const data = (await response.json()) as JamendoApiResponse;
    return data.results.map((t) => ({
      id: t.id,
      name: t.name,
      artistName: t.artist_name,
      durationSec: t.duration,
      audioUrl: t.audio,
    }));
  } catch (err) {
    logger.warn("Jamendo search request threw (non-fatal, reporting no results)", { error: (err as Error).message, query });
    return [];
  }
}

/** Fetches the real audio bytes for a track returned by searchJamendo —
 * a plain, legal HTTP download from Jamendo's own CDN, the same as
 * fetching any other file the API tells you where to find. */
export async function fetchJamendoAudio(track: JamendoTrack): Promise<Buffer> {
  const response = await fetch(track.audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch Jamendo audio for "${track.name}": HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
