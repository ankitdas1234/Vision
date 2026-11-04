import sharp from "sharp";

export interface VisualFeatures {
  shape?: string;
  primaryColour?: string;
  secondaryColour?: string;
  estimatedSize?: string;
  texture?: string;
  aspectRatio?: number;
  dimensions?: { width: number; height: number };
  visualFeatures?: Record<string, number>;
  semanticFeatures?: Record<string, number>;
}

/**
 * Fixed set of named colour buckets, as approximate sRGB centroids.
 * Deliberately a small, human-nameable palette (not a huge colour-name
 * database) since this only needs to be consistent enough for
 * memory/conceptual/featureComparison.ts's categorical comparison
 * ("primaryColour matches or it doesn't") to mean something across two
 * different sightings of a similar object, not to be a precise colour ID.
 */
const COLOUR_BUCKETS: { name: string; r: number; g: number; b: number }[] = [
  { name: "black", r: 20, g: 20, b: 20 },
  { name: "white", r: 235, g: 235, b: 235 },
  { name: "gray", r: 128, g: 128, b: 128 },
  { name: "red", r: 200, g: 40, b: 40 },
  { name: "orange", r: 220, g: 120, b: 40 },
  { name: "yellow", r: 220, g: 210, b: 60 },
  { name: "green", r: 60, g: 160, b: 70 },
  { name: "cyan", r: 60, g: 170, b: 180 },
  { name: "blue", r: 50, g: 90, b: 180 },
  { name: "purple", r: 120, g: 60, b: 160 },
  { name: "pink", r: 220, g: 130, b: 170 },
  { name: "brown", r: 110, g: 70, b: 40 },
];

function nearestColourName(r: number, g: number, b: number): string {
  let best = COLOUR_BUCKETS[0];
  let bestDist = Infinity;
  for (const bucket of COLOUR_BUCKETS) {
    const d = (r - bucket.r) ** 2 + (g - bucket.g) ** 2 + (b - bucket.b) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = bucket;
    }
  }
  return best.name;
}

/** Coarse 3-bucket shape classification from aspect ratio alone — see the
 * HONESTY NOTE on extractFeatures() below for what this is and isn't.
 * aspectRatio is width/height, so > 1 means wider than it is tall. */
function shapeFromAspectRatio(aspectRatio: number): string {
  if (aspectRatio >= 0.85 && aspectRatio <= 1.15) return "square";
  return aspectRatio > 1.15 ? "wide" : "tall";
}

/**
 * Extracts a VisualFeatures snapshot for CONCEPTUAL memory comparison
 * (memory/conceptual/ConceptualMemory.ts) from a real detection's
 * bounding box AND the frame it came from.
 *
 * HONESTY NOTE — read before assuming this is more precise than it is:
 *   - `shape` is a 3-bucket classification (square/tall/wide) from
 *     aspect ratio alone, NOT real contour/silhouette shape recognition.
 *     A round plate and a square plate of the same aspect ratio bucket
 *     the same. Real shape classification would need a dedicated model
 *     this codebase doesn't have.
 *   - `primaryColour` IS real signal: the average RGB across the cropped
 *     detection region (downsampled first for a steadier average),
 *     bucketed to the nearest of a fixed named-colour set above. Genuine
 *     pixel data, not a guess — but coarse: a two-tone object averages
 *     to a muddy in-between colour, and small/thin objects can be
 *     dominated by whatever background sneaks into the bounding box.
 *
 * This was previously never wired up at all in the real pipeline — see
 * brain/BrainOrchestrator.ts's call site for the fix and why CONCEPTUAL
 * memory could never actually succeed without it (missing shape/colour
 * meant the best possible match score capped well below the sufficiency
 * threshold, even for an identical object).
 *
 * Degrades gracefully rather than throwing: if the crop fails for any
 * reason (an out-of-frame bounding box, a corrupt buffer), this still
 * returns aspectRatio/dimensions/shape (geometry needs no image
 * decoding) with `primaryColour` simply omitted — ConceptualMemory's
 * comparison already scores a missing categorical feature as 0 rather
 * than crashing, so a partial result degrades the match quality, not
 * the lookup itself.
 */
export async function extractFeatures(
  imageBuffer: Buffer,
  detection: { boundingBox: { x: number; y: number; width: number; height: number } },
): Promise<VisualFeatures> {
  const { x, y, width, height } = detection.boundingBox;
  const aspectRatio = height === 0 ? 0 : width / height;
  const dimensions = { width, height };
  const shape = shapeFromAspectRatio(aspectRatio);

  try {
    const left = Math.max(0, Math.round(x));
    const top = Math.max(0, Math.round(y));
    const cropWidth = Math.max(1, Math.round(width));
    const cropHeight = Math.max(1, Math.round(height));

    const { data, info } = await sharp(imageBuffer)
      .extract({ left, top, width: cropWidth, height: cropHeight })
      // Downsample first — averaging a handful of representative pixels
      // is both faster and steadier against noise than every raw pixel.
      .resize(12, 12, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i + 2 < data.length; i += info.channels) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
    const primaryColour = n > 0 ? nearestColourName(r / n, g / n, b / n) : undefined;
    return { aspectRatio, dimensions, shape, primaryColour };
  } catch {
    return { aspectRatio, dimensions, shape };
  }
}
