import sharp from "sharp";
import { faceRecognitionConfig } from "../../config/faceRecognitionConfig";

/**
 * TEMPORAL DEDUPLICATION
 * -----------------------
 * The whole-frame checksum in camera/imageProcessor.ts only catches
 * byte-identical frames — useless here, since two consecutive JPEG
 * captures of someone standing still are never byte-identical (sensor
 * noise, JPEG re-encode jitter). What we actually want to catch is
 * "perceptually the same picture," which needs a perceptual hash:
 *
 *   dHash (difference hash): downsize to 9x8 grayscale, compare each
 *   pixel to its right-hand neighbour (brighter/darker = 1 bit each),
 *   giving a 64-bit fingerprint that's stable under JPEG recompression,
 *   minor sensor noise, and small brightness shifts, but changes
 *   meaningfully when the actual content changes (person moved, turned,
 *   expression changed).
 *
 * Two hashes' Hamming distance (bits that differ) is the standard
 * similarity metric for this: 0 = same image, ~32 = unrelated images.
 *
 * Kept per-track (not global) with a time window, so: (a) two different
 * people's faces in the same robot's view are never accidentally
 * deduplicated against each other, and (b) a person who leaves and comes
 * back gets a fresh window rather than being deduplicated against a
 * hash from minutes ago.
 */

export interface DedupDecision {
  isDuplicate: boolean;
  hash: string;
  /** Hamming distance to the closest recent hash in this track's history,
   * null if there was no prior history to compare against. */
  closestDistanceToHistory: number | null;
}

interface TrackHistory {
  hashes: { hash: bigint; timestamp: number }[];
}

/** Computes a 64-bit dHash as a hex string. */
export async function computePerceptualHash(imageBuffer: Buffer): Promise<string> {
  const width = 9;
  const height = 8;
  const { data } = await sharp(imageBuffer, { failOn: "none" }).resize(width, height, { fit: "fill" }).grayscale().raw().toBuffer({ resolveWithObject: true });

  let bits = "";
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const left = data[y * width + x];
      const right = data[y * width + x + 1];
      bits += left > right ? "1" : "0";
    }
  }
  // 64 bits -> 16 hex chars
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += Number.parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

function hammingDistance(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

/**
 * Per-track perceptual-hash history with TTL-based eviction. One
 * instance is shared process-wide (see perception/qualityGate.ts), keyed
 * by an opaque track id (typically `${robotId}:${trackedPersonSlot}` —
 * see attention/AttentionController.ts for what a "track" is here).
 */
export class TemporalDeduplicator {
  private readonly tracks = new Map<string, TrackHistory>();

  private pruneStaleTracks(now: number): void {
    const ttl = faceRecognitionConfig.temporalDedup.windowMs;
    for (const [trackId, history] of this.tracks) {
      history.hashes = history.hashes.filter((h) => now - h.timestamp <= ttl);
      if (history.hashes.length === 0) this.tracks.delete(trackId);
    }
  }

  async check(trackId: string, imageBuffer: Buffer): Promise<DedupDecision> {
    const now = Date.now();
    this.pruneStaleTracks(now);

    const hashHex = await computePerceptualHash(imageBuffer);
    const hashInt = BigInt(`0x${hashHex}`);

    const history = this.tracks.get(trackId);
    let closestDistance: number | null = null;
    if (history) {
      for (const entry of history.hashes) {
        const d = hammingDistance(hashInt, entry.hash);
        if (closestDistance === null || d < closestDistance) closestDistance = d;
      }
    }

    const isDuplicate = closestDistance !== null && closestDistance < faceRecognitionConfig.temporalDedup.minHammingDistance;

    if (!isDuplicate) {
      const entry = history ?? { hashes: [] };
      entry.hashes.push({ hash: hashInt, timestamp: now });
      if (entry.hashes.length > faceRecognitionConfig.temporalDedup.historySize) entry.hashes.shift();
      this.tracks.set(trackId, entry);
    }

    return { isDuplicate, hash: hashHex, closestDistanceToHistory: closestDistance };
  }

  /** Exposed for tests and for an explicit "track ended" signal (e.g. the
   * person left frame — see attention/AttentionController.ts) so memory
   * doesn't wait for TTL expiry. */
  clearTrack(trackId: string): void {
    this.tracks.delete(trackId);
  }

  get activeTrackCount(): number {
    return this.tracks.size;
  }
}

export const temporalDeduplicator = new TemporalDeduplicator();
