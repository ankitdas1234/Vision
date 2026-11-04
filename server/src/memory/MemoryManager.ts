import { randomUUID } from "crypto";
import { StaticMemory } from "./static/StaticMemory";
import { staticMemoryLookup } from "./static/staticSearch";
import { DynamicMemory } from "./dynamic/DynamicMemory";
import { ConceptualMemory } from "./conceptual/ConceptualMemory";
import type { VisualFeatures } from "../perception/featureExtraction";
import type { MemorySource } from "../packages/types";
import { aiFallback } from "../ai/aiFallback";
import { memoryRepository } from "../repositories/memory.repository";
import { logger } from "../logging/Logger";

export type TraceOutcome = "hit" | "miss" | "skipped";
/** One line of "how the search went": which layer was tried and what it said. */
export interface TraceStep { layer: MemorySource; outcome: TraceOutcome; note: string }

export interface MemoryLookupResult {
  source: MemorySource | "NONE";
  confidence: number;
  /** True only when something saved in memory answered. False = not found (the AI is not asked from the memory page). */
  found: boolean;
  /** Short label of the means that found it, e.g. "Dynamic memory (learned earlier from the AI, verified)". Empty when not found. */
  foundBy: string;
  data: unknown;
  /** Every layer that was tried, in order, ending with the one that answered. */
  trace: TraceStep[];
  /** True when an AI answer was good enough to be remembered as a new conceptual memory. */
  learnedConcept: boolean;
  /** True only when the answer is something Vision actually has stored (static, dynamic or conceptual). False = it came from the AI (or nothing answered). */
  inMemory: boolean;
  /** Plain-language reason: what was searched, how it matched, and where the answer really came from. */
  basis: string;
  /** For static/dynamic hits: which record matched and in which field, with the matching text. */
  matches: MatchInfo[];
}

export interface MatchInfo { layer: MemorySource; id: string; title: string; matchedIn: ("title" | "content" | "key")[]; snippet: string; status?: string }

/** Where in each record the (case-insensitive, substring) search text was found, so the dashboard can show WHY it matched. */
export function explainMatches(layer: MemorySource, records: { id: string; title: string; content: string; memoryKey?: string; verificationStatus?: string }[], query: string): MatchInfo[] {
  const q = query.trim().toLowerCase();
  return records.map((r) => {
    const matchedIn: MatchInfo["matchedIn"] = [];
    if (r.title.toLowerCase().includes(q)) matchedIn.push("title");
    if (r.content.toLowerCase().includes(q)) matchedIn.push("content");
    if (r.memoryKey && r.memoryKey.toLowerCase().includes(q)) matchedIn.push("key");
    const src = matchedIn.includes("content") ? r.content : r.title;
    const at = Math.max(0, src.toLowerCase().indexOf(q));
    const snippet = (at > 30 ? "…" : "") + src.slice(Math.max(0, at - 30), at + q.length + 50) + (at + q.length + 50 < src.length ? "…" : "");
    return { layer, id: r.id, title: r.title, matchedIn, snippet, status: r.verificationStatus };
  });
}

/** Below this, an AI answer isn't trusted enough to memorize as a
 * reusable visual concept — a wrong guess remembered confidently would
 * cause CONCEPTUAL to confidently misidentify similar-looking things
 * later. High enough to filter out AI's own uncertain guesses, not so
 * high that a plainly-correct answer never gets learned. */
const AI_LEARN_CONFIDENCE_THRESHOLD = 0.5;

/**
 * Implements the mandatory priority chain:
 *   1. STATIC MEMORY
 *   2. VERIFIED DYNAMIC MEMORY
 *   3. CONCEPTUAL MEMORY
 *   4. OPENROUTER (AI) — last resort, treated as candidate info only
 *
 * `features` (extracted from a real detection's cropped pixels — see
 * perception/featureExtraction.ts) is what makes step 3 possible at all:
 * it's for comparing something by APPEARANCE when there's no name to
 * search by, so it's only meaningful for object-type lookups, not a
 * person's name. Callers doing a person-identity lookup should omit it —
 * see brain/BrainOrchestrator.ts's call site for exactly that split.
 *
 * LEARNING (step 4 -> step 3 feedback): when AI resolves an object with
 * reasonable confidence, its visual features are remembered as a new
 * CONCEPTUAL candidate — a future sighting that looks similar can then
 * be recognized in step 3 without needing AI again. Persisted to the
 * database (repositories/memory.repository.ts's conceptual.learn(),
 * across the objects/object_features/conceptual_memories tables) as
 * well as kept in-memory, and reloaded on every server startup by
 * memory/MemoryPersistence.ts — so a learned concept survives a
 * restart, unlike before this was wired up.
 */
export class MemoryManager {
  constructor(
    public staticMemory = new StaticMemory(),
    public dynamicMemory = new DynamicMemory(),
    public conceptualMemory = new ConceptualMemory()
  ) {}

  /** `useAI: false` = search saved memory only (what the dashboard's Memory lookup does): never calls the AI, and says "not found" if nothing is saved. The robot's brain keeps the default (true). */
  async lookup(query: string, features?: VisualFeatures, opts: { useAI?: boolean } = {}): Promise<MemoryLookupResult> {
    const trace: TraceStep[] = [];
    const q = query.trim();
    const done = (source: MemorySource | "NONE", confidence: number, data: unknown, learnedConcept = false, matches: MatchInfo[] = [], basis = "", foundBy = ""): MemoryLookupResult =>
      ({ source, confidence, found: source !== "NONE" && source !== "AI", foundBy, data, trace, learnedConcept, inMemory: source !== "AI" && source !== "NONE", basis, matches });
    const origin = (recs: { source?: string }[]) => {
      const set = new Set(recs.map((r) => (r.source ?? "").toUpperCase()));
      return set.has("AI") && set.size === 1 ? "learned earlier from the AI, then verified" : set.has("AI") ? "some taught by an admin, some learned earlier from the AI" : "taught by an admin";
    };
    const fields = (m: MatchInfo[]) => [...new Set(m.flatMap((x) => x.matchedIn))].join(" / ");

    const staticResult = staticMemoryLookup(this.staticMemory, query);
    if (staticResult.sufficient) {
      trace.push({ layer: "STATIC", outcome: "hit", note: `${staticResult.results.length} record(s)` });
      const matches = explainMatches("STATIC", staticResult.results, q);
      return done("STATIC", 1, staticResult.results, false, matches,
        `Found in Static memory: "${q}" is in the ${fields(matches)} of ${matches.length} permanent fact${matches.length === 1 ? "" : "s"}.`, "Static memory (permanent facts)");
    }
    trace.push({ layer: "STATIC", outcome: "miss", note: "not found" });

    const dynamicResults = this.dynamicMemory.searchVerified(query);
    if (dynamicResults.length > 0) {
      trace.push({ layer: "DYNAMIC", outcome: "hit", note: `${dynamicResults.length} verified record(s)` });
      const matches = explainMatches("DYNAMIC", dynamicResults, q);
      return done("DYNAMIC", 0.85, dynamicResults, false, matches,
        `Not in Static memory. Found in Dynamic memory: "${q}" is in the ${fields(matches)} of ${matches.length} verified fact${matches.length === 1 ? "" : "s"} (${origin(dynamicResults)}).`, `Dynamic memory (${origin(dynamicResults)})`);
    }
    const unverified = this.dynamicMemory.searchAll(query).filter((r) => r.verificationStatus !== "VERIFIED");
    trace.push({
      layer: "DYNAMIC",
      outcome: "miss",
      note: unverified.length ? `${unverified.length} match(es) exist but are not VERIFIED yet (${unverified.map((r) => r.verificationStatus).join(", ")})` : "not found",
    });

    if (features) {
      const conceptual = this.conceptualMemory.compare(features);
      if (conceptual.sufficient) {
        trace.push({ layer: "CONCEPTUAL", outcome: "hit", note: `matched "${conceptual.best!.candidateName}" (score ${conceptual.best!.totalScore.toFixed(2)})` });
        return done("CONCEPTUAL", conceptual.best!.confidence, conceptual, false, [],
          `Nothing saved by name. Found in Conceptual memory: it looks like the remembered concept "${conceptual.best!.candidateName}" (similarity score ${conceptual.best!.totalScore.toFixed(2)}).`, "Conceptual memory (matched by appearance)");
      }
      trace.push({
        layer: "CONCEPTUAL",
        outcome: "miss",
        note: conceptual.best ? `best "${conceptual.best.candidateName}" scored ${conceptual.best.totalScore.toFixed(2)}, not enough` : "nothing to compare with",
      });
    } else {
      trace.push({ layer: "CONCEPTUAL", outcome: "skipped", note: "no visual description to compare" });
    }

    if (opts.useAI === false) {
      const note = unverified.length ? ` ${unverified.length} saved fact${unverified.length === 1 ? " mentions" : "s mention"} it but ${unverified.length === 1 ? "is" : "are"} not verified yet, so ${unverified.length === 1 ? "it isn't" : "they aren't"} counted.` : "";
      trace.push({ layer: "AI", outcome: "skipped", note: "not used: memory lookup only" });
      return done("NONE", 0, null, false, explainMatches("DYNAMIC", unverified, q), `Not found in memory. "${q}" is not in ${features ? "Static, Dynamic or Conceptual" : "Static or Dynamic"} memory.${note}`);
    }
    // Last resort — never called unnecessarily.
    const aiResult = await aiFallback(query);
    trace.push(aiResult.success
      ? { layer: "AI", outcome: "hit", note: "answered by the AI fallback (candidate information, not verified)" }
      : { layer: "AI", outcome: "miss", note: aiResult.error ?? "AI not configured or unavailable" });

    let learnedConcept = false;
    if (features && aiResult.success && aiResult.confidence >= AI_LEARN_CONFIDENCE_THRESHOLD) {
      // In-memory first, so it's usable on the very next lookup this same
      // process without waiting on a database round trip.
      this.conceptualMemory.addCandidate({ id: randomUUID(), name: query, features });
      learnedConcept = true;
      // Persisted in the background — lookup() runs inside the per-frame brain cycle
      // (see brain/BrainOrchestrator.ts), so this deliberately does NOT block the cycle on a
      // database write. A failure just means this concept won't survive a restart (logged, not
      // thrown); the in-memory candidate still works for this server's uptime either way.
      memoryRepository.conceptual.learn(query, features, aiResult.confidence).catch((err) => {
        logger.warn("Failed to persist a newly-learned concept to the database (kept in-memory for this session only)", {
          query,
          error: (err as Error).message,
        });
      });
    }

    return done("AI", aiResult.confidence, aiResult, learnedConcept, explainMatches("DYNAMIC", unverified, q),
      aiResult.success ? `Not in memory. Answered live by the AI (not saved, not verified).` : `Not in memory, and the AI could not answer (${aiResult.error ?? "unavailable"}).`);
  }
}

export const memoryManager = new MemoryManager();
