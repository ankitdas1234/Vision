import { waitForHeadSettled } from "../attention/HeadController";
import { commandRegistry } from "../commands/CommandRegistry";
import { taskManager } from "../tasks/TaskManager";
import { proposeGoal, type ExplorationGoal } from "../decisions/GoalProposer";
import { logger } from "../logging/Logger";

/**
 * EXPLORATION CONTROLLER
 * -----------------------
 * MentalIntelligence.evaluate() already computes `explorationActive` from
 * real idle-time/safety/conversation state (see mental/MentalIntelligence.ts
 * and curiosity/ExplorationTrigger.ts) — that part was already real. What
 * was missing: nothing consumed that flag to actually do anything. This is
 * that missing piece.
 *
 * Called once per BrainOrchestrator cycle with the current
 * `explorationActive` value. Owns the full lifecycle:
 *   - false -> true (just went idle): starts an EXPLORATION task, proposes
 *     the first goal immediately.
 *   - true -> true (still exploring): proposes a new goal only every
 *     GOAL_INTERVAL_MS — NOT every cycle, so behavior looks like it's
 *     actually pursuing something rather than flip-flopping every frame.
 *   - true -> false (person detected / conversation started / anything
 *     unsafe — see ExplorationTrigger's hard vetoes): cancels the task and
 *     issues a safe-stop immediately. This is a hard preemption, not a
 *     suggestion — the very next cycle's normal DecisionMaker path (which
 *     already prioritizes personDetected above everything) takes over.
 *
 * Every goal is translated into ordinary commands dispatched through the
 * exact same commandRegistry.dispatch -> SafetyManager -> ultrasonic-gating
 * path as any manually-issued command (see performance/DanceRunner.ts and
 * people/PersonSearchRunner.ts for the same pattern) — exploration cannot
 * do anything a manually-issued command couldn't already do.
 */

const GOAL_INTERVAL_MS = 25_000;
const MAX_GOALS_PER_SESSION = 40; // ~15-20 min of continuous exploring at the interval above — a safety bound against a runaway session, not a real-world limit anyone should expect to hit
const OBSERVATION_WINDOW_MS = 5 * 60 * 1000; // recent-objects context stays "warm" for 5 minutes, so it isn't empty on the very first tick just because nothing is in frame at that exact instant
const MAX_TRACKED_LABELS = 20;

interface ExplorationState {
  taskId: string;
  currentGoal: ExplorationGoal | null;
  goalsProposedThisSession: number;
  lastGoalProposedAt: number;
}

interface ObservationRecord {
  label: string;
  seenAt: number;
}

const stateByRobot = new Map<string, ExplorationState>();

/** Recently-detected real object labels per robot (see
 * perception/objectDetectionModel.ts — genuine COCO-80 labels, not
 * placeholders), fed into GoalProposer's context so its choices reflect
 * what Vision has actually been seeing rather than nothing at all.
 * Recorded every cycle regardless of whether exploration is active, so
 * the context is already warm the moment exploration actually starts —
 * same per-robot rolling-window pattern already used by
 * perception/quality/temporalDeduplication.ts and
 * perception/multiFrameIdentity.ts. */
const recentObservationsByRobot = new Map<string, ObservationRecord[]>();

/** Call once per BrainOrchestrator cycle — cheap, in-memory only — with
 * whatever real object labels were detected this cycle (may be empty).
 * Independent of explorationActive on purpose: this keeps a running
 * picture of the environment building up the whole time Vision is
 * awake, not just during exploration itself. */
export function recordObservation(robotId: string, objectLabels: string[]): void {
  const now = Date.now();
  const existing = (recentObservationsByRobot.get(robotId) ?? []).filter((r) => now - r.seenAt <= OBSERVATION_WINDOW_MS);
  for (const label of objectLabels) {
    existing.push({ label, seenAt: now });
  }
  recentObservationsByRobot.set(robotId, existing.slice(-MAX_TRACKED_LABELS));
}

function recentContextFor(robotId: string): { recentMemorySummary: string; hasUnknownObjectsNearby: boolean } {
  const now = Date.now();
  const records = (recentObservationsByRobot.get(robotId) ?? []).filter((r) => now - r.seenAt <= OBSERVATION_WINDOW_MS);
  if (records.length === 0) {
    return { recentMemorySummary: "", hasUnknownObjectsNearby: false };
  }
  const uniqueLabels = [...new Set(records.map((r) => r.label))];
  return {
    recentMemorySummary: `Recently visible objects: ${uniqueLabels.join(", ")}.`,
    hasUnknownObjectsNearby: uniqueLabels.length > 0,
  };
}

export interface ExplorationTickResult {
  active: boolean;
  currentGoal: ExplorationGoal | null;
}

async function dispatch(robotId: string, type: string, params: Record<string, unknown> = {}) {
  return commandRegistry.dispatch({ type: type as never, params, source: "SYSTEM", robotId, isAdmin: true });
}

/** Translates a proposed goal into real, already-existing commands. No new
 * hardware behavior is invented here — just sequencing of gait/eye
 * commands that already exist and are already safety-checked. */
/** How long the head rests at each stop of a scan so the camera can capture a frame. */
const SCAN_DWELL_MS = 400;

async function executeGoal(robotId: string, goal: ExplorationGoal): Promise<void> {
  switch (goal) {
    case "SCAN_AREA":
      // Sweep the head (camera + ultrasonic ride on it) to 30°, then 150°, then
      // back to 90°/forward. A head command "completes" instantly on the server
      // while the real head eases there at HEAD_MAX_DEG_PER_SEC, so each stop
      // waits for arrival plus a short dwell — otherwise the second target would
      // overwrite the first and the head would never actually look at 30°.
      await dispatch(robotId, "EYE_SET", { angle: 30 });
      await waitForHeadSettled();
      await new Promise((r) => setTimeout(r, SCAN_DWELL_MS));
      await dispatch(robotId, "EYE_SET", { angle: 150 });
      await waitForHeadSettled();
      await new Promise((r) => setTimeout(r, SCAN_DWELL_MS));
      await dispatch(robotId, "EYE_CENTER");
      break;
    case "INVESTIGATE_NEAREST_UNKNOWN_OBJECT":
      // No bearing-to-object steering exists in this codebase (that would
      // require real spatial localization this robot doesn't have) — the
      // honest approximation is a short, cautious creep forward with eyes
      // centered, gated by the same ultrasonic safety check as any other
      // forward movement.
      await dispatch(robotId, "EYE_CENTER");
      await waitForHeadSettled(); // forward-facing before the creep (the registry also guarantees this)
      await dispatch(robotId, "WALK_FORWARD", { durationMs: 800 });
      await dispatch(robotId, "WALK_STOP");
      break;
    case "WANDER": {
      await dispatch(robotId, "WALK_FORWARD", { durationMs: 1200 });
      const turnLeft = Math.random() < 0.5;
      await dispatch(robotId, turnLeft ? "TURN_LEFT" : "TURN_RIGHT", { durationMs: 400 });
      await dispatch(robotId, "WALK_STOP");
      break;
    }
    case "RETURN_AND_REST":
      await dispatch(robotId, "WALK_STOP");
      await dispatch(robotId, "SERVOS_SAFE");
      break;
  }
}

async function startExploring(robotId: string): Promise<ExplorationTickResult> {
  const task = taskManager.create({ robotId, taskType: "EXPLORATION", description: "Autonomous exploration while alone" });
  const state: ExplorationState = { taskId: task.id, currentGoal: null, goalsProposedThisSession: 0, lastGoalProposedAt: 0 };
  stateByRobot.set(robotId, state);
  taskManager.updateStatus(task.id, "RUNNING");
  logger.info("Exploration started (no one around, safe to move)", { robotId, taskId: task.id });
  return advanceGoal(robotId, state);
}

async function advanceGoal(robotId: string, state: ExplorationState): Promise<ExplorationTickResult> {
  if (state.goalsProposedThisSession >= MAX_GOALS_PER_SESSION) {
    // Not a failure — just a sane upper bound so a misconfigured/very-long
    // idle period doesn't wander indefinitely without ever re-checking in
    // with a human. Rests and waits for the next natural trigger.
    await stopExploring(robotId, "Reached this session's exploration limit");
    return { active: false, currentGoal: null };
  }

  // GoalProposer is designed to never throw (every failure mode inside
  // it degrades to a safe fallback goal — see decisions/GoalProposer.ts),
  // but this call is wrapped anyway rather than trusting that contract
  // blindly: a bug in it, or in whatever it calls, shouldn't be able to
  // take down exploration's own error handling along with it. Falls back
  // to the same safe default GoalProposer itself would have used.
  let proposal: Awaited<ReturnType<typeof proposeGoal>>;
  try {
    proposal = await proposeGoal({
      ...recentContextFor(robotId),
      goalsProposedThisSession: state.goalsProposedThisSession,
    });
  } catch (err) {
    logger.warn("Goal proposal threw unexpectedly (should be unreachable — GoalProposer is meant to always resolve), using safe fallback", { robotId, error: (err as Error).message });
    proposal = { goal: "WANDER", reason: "Goal proposal failed unexpectedly; using default exploration behavior.", fromModel: false };
  }

  state.currentGoal = proposal.goal;
  state.goalsProposedThisSession++;
  state.lastGoalProposedAt = Date.now();
  logger.debug("Exploration goal chosen", { robotId, goal: proposal.goal, reason: proposal.reason, fromModel: proposal.fromModel });

  try {
    await executeGoal(robotId, proposal.goal);
  } catch (err) {
    logger.warn("Exploration goal execution failed (non-fatal, will try again next interval)", { robotId, goal: proposal.goal, error: (err as Error).message });
  }

  return { active: true, currentGoal: proposal.goal };
}

async function stopExploring(robotId: string, reason: string): Promise<void> {
  const state = stateByRobot.get(robotId);
  if (!state) return;
  stateByRobot.delete(robotId);

  try {
    await dispatch(robotId, "WALK_STOP");
    await dispatch(robotId, "SERVOS_SAFE");
  } catch (err) {
    logger.warn("Failed to issue safe-stop while ending exploration (non-fatal)", { robotId, error: (err as Error).message });
  }

  taskManager.updateStatus(state.taskId, "COMPLETED", { result: { goalsProposed: state.goalsProposedThisSession, reason } });
  logger.info("Exploration ended", { robotId, reason, goalsProposed: state.goalsProposedThisSession });
}

/**
 * Call once per BrainOrchestrator cycle with the current
 * `explorationActive` value from mentalIntelligence.evaluate(). Safe to
 * call every cycle regardless of state — internally rate-limits actual
 * goal proposals to GOAL_INTERVAL_MS.
 */
export async function tick(robotId: string, explorationActive: boolean): Promise<ExplorationTickResult> {
  const state = stateByRobot.get(robotId);

  if (!explorationActive) {
    if (state) await stopExploring(robotId, "Exploration condition no longer met (person present, conversation started, or unsafe)");
    return { active: false, currentGoal: null };
  }

  if (!state) {
    return startExploring(robotId);
  }

  if (Date.now() - state.lastGoalProposedAt < GOAL_INTERVAL_MS) {
    return { active: true, currentGoal: state.currentGoal };
  }

  return advanceGoal(robotId, state);
}

/** Test-only: clears all in-memory exploration state. */
export function __resetExplorationStateForTests(): void {
  stateByRobot.clear();
  recentObservationsByRobot.clear();
}
