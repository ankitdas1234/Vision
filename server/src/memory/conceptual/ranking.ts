import type { SimilarityResult } from "../../packages/types";

export const CONCEPTUAL_SUFFICIENCY_THRESHOLD = 0.65;

export function bestMatch(results: SimilarityResult[]): { sufficient: boolean; best?: SimilarityResult } {
  const best = results[0];
  return { sufficient: !!best && best.totalScore >= CONCEPTUAL_SUFFICIENCY_THRESHOLD, best };
}
