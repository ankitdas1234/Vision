import { compareFeatures } from "./featureComparison";
import type { VisualFeatures } from "../../perception/featureExtraction";
import type { SimilarityResult } from "../../packages/types";

const WEIGHTS = { shapeScore: 0.2, colourScore: 0.15, sizeScore: 0.15, appearanceScore: 0.15, contextScore: 0.1, featureScore: 0.15, semanticScore: 0.1 };

export interface ConceptualCandidate { id: string; name: string; features: VisualFeatures }

export function rankCandidates(target: VisualFeatures, candidates: ConceptualCandidate[]): SimilarityResult[] {
  return candidates
    .map((c) => {
      const scores = compareFeatures(target, c.features);
      const totalScore = Object.entries(scores).reduce((sum, [k, v]) => sum + v * (WEIGHTS as Record<string, number>)[k], 0);
      const matchingFeatures = Object.entries(scores).filter(([, v]) => v >= 0.7).map(([k]) => k);
      const conflictingFeatures = Object.entries(scores).filter(([, v]) => v < 0.3).map(([k]) => k);
      return {
        candidateId: c.id,
        candidateName: c.name,
        totalScore,
        ...scores,
        matchingFeatures,
        conflictingFeatures,
        confidence: totalScore,
      } as SimilarityResult;
    })
    .sort((a, b) => b.totalScore - a.totalScore);
}
