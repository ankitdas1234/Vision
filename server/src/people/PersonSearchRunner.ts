import { commandRegistry } from "../commands/CommandRegistry";
import { taskManager } from "../tasks/TaskManager";
import { peopleRepository } from "../repositories/people.repository";
import { personSearchService } from "./PersonSearchService";
import { startDisambiguation, getPendingDisambiguation, isTimedOut, clearDisambiguation } from "./PendingDisambiguation";
import { markBystanderAsked } from "./PendingBystanderQuestion";
import { buildReturnPath, type PatrolStep } from "./DeadReckoning";
import { logger } from "../logging/Logger";
import type { people } from "../database/schema";

type Person = typeof people.$inferSelect;

/**
 * PERSON SEARCH — the behavior behind "Vision, find Sam".
 *
 * Honest about what this is and isn't: there's no map, no localization,
 * and no pathfinding anywhere in this codebase. "Go find them" here means
 * a bounded wander-and-scan patrol (alternating short walks and turns,
 * exactly like BrainOrchestrator's own obstacle-safe gait calls) combined
 * with the recognition pipeline that already runs every brain cycle.
 * "Bring them back" retraces the patrol via basic open-loop dead
 * reckoning (see people/DeadReckoning.ts) — genuinely better than a fixed
 * guess, but still not real navigation: no encoder feedback means small
 * errors accumulate over a long search. Documented in docs/people.md
 * "Known limitations" — good enough for a small home, not a substitute
 * for real localization.
 *
 * All movement here dispatches with `source: "SYSTEM"`, matching how
 * BrainOrchestrator's own autonomous head/gait commands work — a human
 * *starting* a search doesn't require Manual Mode (this isn't a raw
 * joystick command), but once running, the mission's own movement is
 * still safety-checked exactly like any other command (SafetyManager,
 * emergency stop, ultrasonic obstacle checks all still apply — see
 * GaitController.run and SafetyManager.check).
 */

const SEARCH_TIMEOUT_MS = 3 * 60 * 1000;
const STEP_MS = 3500;
const PAUSE_BETWEEN_STEPS_MS = 400;
const DISAMBIGUATION_POLL_MS = 500;

async function speak(robotId: string, text: string) {
  await commandRegistry.dispatch({ type: "AUDIO_SPEAK", params: { text }, source: "SYSTEM", robotId, isAdmin: true });
}

async function walkForward(robotId: string, durationMs: number) {
  await commandRegistry.dispatch({ type: "WALK_FORWARD", params: { durationMs }, source: "SYSTEM", robotId, isAdmin: true });
}

async function walkBackward(robotId: string, durationMs: number) {
  await commandRegistry.dispatch({ type: "WALK_BACKWARD", params: { durationMs }, source: "SYSTEM", robotId, isAdmin: true });
}

async function turnLeft(robotId: string, durationMs: number) {
  await commandRegistry.dispatch({ type: "TURN_LEFT", params: { durationMs }, source: "SYSTEM", robotId, isAdmin: true });
}

async function turnRight(robotId: string, durationMs: number) {
  await commandRegistry.dispatch({ type: "TURN_RIGHT", params: { durationMs }, source: "SYSTEM", robotId, isAdmin: true });
}

/**
 * Waits for BrainOrchestrator to resolve a pending disambiguation from the
 * robot's own camera (see PendingDisambiguation.ts for the full flow: a
 * held-up photo bypasses the usual motion gate and gets matched against
 * just the candidates in question). Also treated as "stop waiting" if the
 * disambiguation record disappears (cleared elsewhere) or the backing task
 * gets cancelled — same authoritative-cancel-signal pattern used in the
 * patrol loop below.
 */
async function waitForDisambiguation(robotId: string, taskId: string): Promise<string | null> {
  while (true) {
    if (taskManager.get(taskId)?.status === "CANCELLED") return null;
    const pending = getPendingDisambiguation(robotId);
    if (!pending) return null;
    if (pending.resolvedPersonId) return pending.resolvedPersonId;
    if (isTimedOut(pending)) return null;
    await new Promise((r) => setTimeout(r, DISAMBIGUATION_POLL_MS));
  }
}

/**
 * A name is not a unique identifier — a household can easily have two
 * people with the same first name. Resolves which specific person "find
 * Sam" means, asking the robot's own camera to settle it when there's
 * more than one candidate (see the AMBIGUOUS branch in runPersonSearch
 * below) rather than guessing — sending the robot to bother/escort the
 * wrong person is worse than asking a follow-up question.
 */
type ResolveResult = { outcome: "NONE" } | { outcome: "AMBIGUOUS"; candidates: Person[] } | { outcome: "RESOLVED"; person: Person };

async function findCandidates(name: string): Promise<ResolveResult> {
  const matches = await peopleRepository.findAllByName(name);
  if (matches.length === 0) return { outcome: "NONE" };
  if (matches.length === 1) return { outcome: "RESOLVED", person: matches[0] };
  return { outcome: "AMBIGUOUS", candidates: matches };
}

export async function runPersonSearch(taskId: string, robotId: string, name: string, requestedByPersonId?: string | null) {
  taskManager.updateStatus(taskId, "RUNNING");

  const resolution = await findCandidates(name).catch(() => ({ outcome: "NONE" as const }));

  if (resolution.outcome === "NONE") {
    taskManager.updateStatus(taskId, "FAILED", { error: `No one named "${name}" is registered` });
    await speak(robotId, `I don't know anyone named ${name} yet.`);
    return;
  }

  let target: Person;
  if (resolution.outcome === "AMBIGUOUS") {
    // Vision Script/a name alone can't carry a photo (see
    // docs/vision-script.md) — so instead of failing, Vision asks out
    // loud and waits for whoever's asking to hold a photo up to its own
    // camera. BrainOrchestrator does the actual matching on the next
    // usable frame; see PendingDisambiguation.ts for the full mechanism.
    await speak(robotId, `There are a few people named ${name} — can you show me a photo of who you mean?`);
    startDisambiguation(robotId, {
      taskId,
      targetName: name,
      candidateIds: resolution.candidates.map((c) => c.id),
      requestedByPersonId: requestedByPersonId ?? null,
    });

    const resolvedId = await waitForDisambiguation(robotId, taskId);
    clearDisambiguation(robotId);

    if (!resolvedId) {
      if (taskManager.get(taskId)?.status === "CANCELLED") return; // already reported, nothing more to say
      taskManager.updateStatus(taskId, "FAILED", { error: `Timed out waiting for a photo to identify which "${name}" was meant` });
      await speak(robotId, "I didn't see a clear photo in time — ask me again when you're ready.");
      return;
    }

    const resolvedPerson = await peopleRepository.findById(resolvedId).catch(() => null);
    if (!resolvedPerson) {
      taskManager.updateStatus(taskId, "FAILED", { error: "Resolved person no longer exists" });
      return;
    }
    target = resolvedPerson;
    await speak(robotId, `Got it — looking for ${target.name ?? name}.`);
  } else {
    target = resolution.person;
  }

  const mission = personSearchService.start({ taskId, robotId, targetPersonId: target.id, targetName: target.name ?? name, requestedByPersonId });
  if (resolution.outcome !== "AMBIGUOUS") {
    await speak(robotId, `Looking for ${mission.targetName}...`);
  }

  const startedAt = Date.now();
  const patrolLog: PatrolStep[] = [];
  while (Date.now() - startedAt < SEARCH_TIMEOUT_MS) {
    const active = personSearchService.getActiveMission(robotId);
    if (!active) break; // cancelled, or reached a terminal state some other way
    if (active.status !== "SEARCHING") break;

    // Alternate walking and turning — a simple patrol, not a planned route.
    // Every step is recorded so it can be retraced on the way back — see
    // people/DeadReckoning.ts.
    const stepIsWalk = Math.random() < 0.6;
    if (stepIsWalk) {
      await walkForward(robotId, STEP_MS);
      patrolLog.push({ type: "WALK_FORWARD", durationMs: STEP_MS });
    } else {
      await turnLeft(robotId, STEP_MS);
      patrolLog.push({ type: "TURN_LEFT", durationMs: STEP_MS });
    }
    await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_STEPS_MS));
  }

  const finalState = personSearchService.getActiveMission(robotId);
  if (!finalState) {
    // Cancelled mid-search.
    taskManager.updateStatus(taskId, "CANCELLED");
    await speak(robotId, "Okay, I'll stop looking.");
    personSearchService.clear(robotId);
    return;
  }

  if (finalState.status === "FOUND") {
    await speak(robotId, `There you are, ${finalState.targetName}! Someone's looking for you — come with me!`);
    personSearchService.setStatus(robotId, "ESCORTING");

    // Real dead-reckoning retrace of the recorded patrol — reverse order,
    // each step inverted (walk forward -> walk backward, turn left ->
    // turn right). See people/DeadReckoning.ts for exactly why this is a
    // genuine improvement over a fixed guess but still not real
    // navigation (no encoder feedback to correct for drift).
    const returnPath = buildReturnPath(patrolLog);
    for (const step of returnPath) {
      if (step.type === "WALK_BACKWARD") await walkBackward(robotId, step.durationMs);
      else await turnRight(robotId, step.durationMs);
      await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_STEPS_MS));
    }

    await speak(robotId, "Here they are!");
    personSearchService.complete(robotId, "COMPLETED");
    taskManager.updateStatus(taskId, "COMPLETED", { result: { found: true, personId: finalState.targetPersonId, returnSteps: returnPath.length } });
  } else {
    await speak(robotId, `I couldn't find ${finalState.targetName} — I'll keep an eye out.`);
    personSearchService.complete(robotId, "FAILED");
    taskManager.updateStatus(taskId, "FAILED", { error: "Search timed out" });
  }

  personSearchService.clear(robotId);
}

/** Called by BrainOrchestrator when a bystander (not the target) is
 * encountered mid-search. Vision asks out loud and marks a pending
 * bystander question (people/PendingBystanderQuestion.ts) so the next
 * conversation turn is interpreted as their answer — see
 * people/BystanderResponses.ts and routes/conversation.routes.ts.
 * Deliberately fire-and-forget and never throws into the caller. */
export async function askBystanderAboutTarget(robotId: string, taskId: string, targetName: string) {
  try {
    await speak(robotId, `Excuse me — have you seen ${targetName}?`);
    markBystanderAsked(robotId, taskId, targetName);
  } catch (err) {
    logger.debug("Could not ask bystander during person search (non-fatal)", { error: (err as Error).message });
  }
}
