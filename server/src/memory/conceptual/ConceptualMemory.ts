import { rankCandidates, type ConceptualCandidate } from "./similarity";
import { bestMatch } from "./ranking";
import type { VisualFeatures } from "../../perception/featureExtraction";

/**
 * Conceptual Memory compares unknown observations against known
 * objects/concepts using multi-factor similarity when no exact
 * static/dynamic match exists.
 */
export class ConceptualMemory {
  constructor(private candidates: ConceptualCandidate[] = []) {}

  addCandidate(c: ConceptualCandidate) { this.candidates.push(c); }

  compare(target: VisualFeatures) {
    const ranked = rankCandidates(target, this.candidates);
    return { ranked, ...bestMatch(ranked) };
  }
}
