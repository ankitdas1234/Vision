import type { VisualFeatures } from "../../perception/featureExtraction";

/** Simple normalized similarity 0-1 for a single scalar feature pair. */
function scalarScore(a?: number, b?: number, tolerance = 0.25): number {
  if (a === undefined || b === undefined) return 0;
  const diff = Math.abs(a - b) / Math.max(a, b, 1e-6);
  return Math.max(0, 1 - diff / tolerance);
}

function categoricalScore(a?: string, b?: string): number {
  if (!a || !b) return 0;
  return a.toLowerCase() === b.toLowerCase() ? 1 : 0;
}

export function compareFeatures(a: VisualFeatures, b: VisualFeatures) {
  const shapeScore = categoricalScore(a.shape, b.shape);
  const colourScore = categoricalScore(a.primaryColour, b.primaryColour);
  const sizeScore = scalarScore(a.dimensions?.width, b.dimensions?.width);
  const appearanceScore = categoricalScore(a.texture, b.texture);
  const contextScore = 0.5; // requires surrounding-scene context, defaulted here
  const featureScore = scalarScore(a.aspectRatio, b.aspectRatio, 0.15);
  const semanticScore = 0.5; // requires semantic embedding comparison

  return { shapeScore, colourScore, sizeScore, appearanceScore, contextScore, featureScore, semanticScore };
}
