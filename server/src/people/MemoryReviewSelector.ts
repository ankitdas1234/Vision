import { memoryRepository } from "../repositories/memory.repository";
import { peopleRepository } from "../repositories/people.repository";

/**
 * MEMORY REVIEW SELECTOR
 * ----------------------
 * Two separate jobs:
 *   1. Throttling — same idea as people/GreetingThrottle.ts, but global
 *      per robot rather than per person, since this isn't "have I said
 *      hi to THIS person yet" but "have I recently asked the admin
 *      about ANY fact". Without this, every brain cycle the admin's
 *      face is CONFIRMED in frame would try to ask again.
 *   2. Picking the next fact worth asking about, and phrasing the
 *      actual question Vision says out loud.
 */

const REVIEW_COOLDOWN_MS = 10 * 60 * 1000; // ask about at most one fact every 10 minutes
const lastOfferedAtMsByRobot = new Map<string, number>();

export function shouldOfferMemoryReview(robotId: string): boolean {
  const last = lastOfferedAtMsByRobot.get(robotId);
  return !last || Date.now() - last > REVIEW_COOLDOWN_MS;
}

export function recordMemoryReviewOffered(robotId: string) {
  lastOfferedAtMsByRobot.set(robotId, Date.now());
}

export interface MemoryReviewCandidate {
  memory: { id: string; personId: string; content: string };
  question: string;
}

/** Oldest still-flagged fact first (see memory.repository.ts's
 * dynamic.nextNeedingReview) — resolves the person's name for a natural
 * question, falling back to a generic phrasing for someone Vision
 * hasn't been told a name for yet. Returns null when there's nothing
 * that needs asking about right now, which is the common case. */
export async function pickMemoryReviewCandidate(): Promise<MemoryReviewCandidate | null> {
  const memory = await memoryRepository.dynamic.nextNeedingReview();
  if (!memory || !memory.personId) return null;

  const person = await peopleRepository.findById(memory.personId);
  const who = person?.name ? `about ${person.name}` : "about someone I met";

  // Deliberately plain, spoken-out-loud phrasing rather than reading the
  // memory's own `title` field verbatim — titles are written to be
  // scanned on a dashboard row, not spoken naturally.
  const question = `Quick thing — I picked up something ${who}: ${memory.content}. Did I get that right?`;

  return { memory: { id: memory.id, personId: memory.personId, content: memory.content }, question };
}
