import { searchJamendo } from "../../music/JamendoMusicService";
import { logger } from "../../logging/Logger";

export interface SimTrack { title: string; artist: string; audioUrl: string; full: boolean }

/** Hosts the simulator is allowed to play audio from (https only). */
const ALLOWED = ["jamendo.com", "itunes.apple.com", "mzstatic.com", "apple.com"];
export function isAllowedAudioUrl(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.protocol !== "https:") return false;
    const h = url.hostname.toLowerCase();
    return ALLOWED.some((d) => h === d || h.endsWith("." + d));
  } catch { return false; }
}

/** Keyless fallback: Apple's public iTunes Search API returns a licensed 30-second preview of the real song. */
async function searchItunes(query: string, max = 1): Promise<SimTrack[]> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", query);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "12");
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`iTunes search HTTP ${res.status}`);
  const data = (await res.json()) as { results?: Array<{ trackName?: string; artistName?: string; previewUrl?: string }> };
  return (data.results ?? [])
    .filter((r) => r.previewUrl && r.trackName && isAllowedAudioUrl(r.previewUrl))
    .slice(0, max)
    .map((r) => ({ title: r.trackName!, artist: r.artistName ?? "Unknown artist", audioUrl: r.previewUrl!, full: false }));
}

/** Real song match first (iTunes preview, no setup); full-length Jamendo tracks first if a client id is set. Returns up to `max` playable tracks (first = best match). */
export async function findTracks(song: string, max = 1): Promise<SimTrack[]> {
  if (process.env.JAMENDO_CLIENT_ID) {
    try {
      const list = (await searchJamendo(song, max)).filter((t) => isAllowedAudioUrl(t.audioUrl));
      if (list.length) return list.map((t) => ({ title: t.name, artist: t.artistName, audioUrl: t.audioUrl, full: true }));
    } catch (e) { logger.warn("Jamendo lookup failed", { error: (e as Error).message }); }
  }
  try { return await searchItunes(song, max); } catch (e) { logger.warn("iTunes preview lookup failed", { error: (e as Error).message }); }
  return [];
}

export async function findTrack(song: string): Promise<SimTrack | null> {
  return (await findTracks(song, 1))[0] ?? null;
}
