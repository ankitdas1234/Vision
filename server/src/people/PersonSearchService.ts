import { taskManager } from "../tasks/TaskManager";
import type { RecognitionResult } from "../perception/personRecognition";

/**
 * PERSON SEARCH MISSION
 * ---------------------
 * "Vision, find Sam" starts one of these. It's deliberately a thin state
 * machine — the actual wandering/searching behavior lives in
 * tasks/PersonSearchRunner.ts, and recognition already happens every brain
 * cycle regardless (see BrainOrchestrator.ts). This class just answers
 * "is a mission active for this robot, and did we just see the target?" —
 * a single source of truth both the runner (driving movement) and
 * BrainOrchestrator (reporting sightings, deferring head control) consult.
 *
 * One active mission per robot at a time, matching the hardware: a robot
 * can't reasonably conduct two searches on two different people at once
 * with one body and one pair of "eyes".
 */
export type SearchStatus = "SEARCHING" | "FOUND" | "ESCORTING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface SearchMission {
  taskId: string;
  robotId: string;
  targetPersonId: string;
  targetName: string;
  requestedByPersonId: string | null;
  status: SearchStatus;
  startedAt: string;
  foundAt: string | null;
  completedAt: string | null;
}

export type SightingEvent = { event: "TARGET_FOUND"; mission: SearchMission } | { event: "ASK_BYSTANDER"; mission: SearchMission } | null;

class PersonSearchService {
  private missionsByRobot = new Map<string, SearchMission>();

  start(input: { taskId: string; robotId: string; targetPersonId: string; targetName: string; requestedByPersonId?: string | null }): SearchMission {
    const mission: SearchMission = {
      taskId: input.taskId,
      robotId: input.robotId,
      targetPersonId: input.targetPersonId,
      targetName: input.targetName,
      requestedByPersonId: input.requestedByPersonId ?? null,
      status: "SEARCHING",
      startedAt: new Date().toISOString(),
      foundAt: null,
      completedAt: null,
    };
    this.missionsByRobot.set(input.robotId, mission);
    return mission;
  }

  /** Active = exists and hasn't reached a terminal state. Also treats the
   * mission as no-longer-active if its backing task was cancelled through
   * the normal POST /api/tasks/:id/cancel path — that's the single
   * authoritative "stop" signal (see tasks/PersonSearchRunner.ts). */
  getActiveMission(robotId: string): SearchMission | null {
    const mission = this.missionsByRobot.get(robotId);
    if (!mission) return null;
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(mission.status)) return null;
    if (taskManager.get(mission.taskId)?.status === "CANCELLED") {
      mission.status = "CANCELLED";
      return null;
    }
    return mission;
  }

  /** Called every brain cycle a person is detected while a mission is
   * SEARCHING. Never itself dispatches a command — just reports what
   * happened so the runner (which owns pacing/movement) can act on it. */
  reportSighting(robotId: string, recognition: RecognitionResult, isApproaching: boolean): SightingEvent {
    const mission = this.getActiveMission(robotId);
    if (!mission || mission.status !== "SEARCHING") return null;

    if (recognition.personId && recognition.personId === mission.targetPersonId) {
      mission.status = "FOUND";
      mission.foundAt = new Date().toISOString();
      return { event: "TARGET_FOUND", mission };
    }

    // Someone else, close enough to actually ask — worth a "have you seen
    // them?" (see the runner for what asking actually means and its limits).
    if (isApproaching && recognition.personId && recognition.personId !== mission.requestedByPersonId) {
      return { event: "ASK_BYSTANDER", mission };
    }
    return null;
  }

  setStatus(robotId: string, status: SearchStatus) {
    const mission = this.missionsByRobot.get(robotId);
    if (mission) mission.status = status;
  }

  complete(robotId: string, status: "COMPLETED" | "FAILED") {
    const mission = this.missionsByRobot.get(robotId);
    if (!mission) return;
    mission.status = status;
    mission.completedAt = new Date().toISOString();
  }

  clear(robotId: string) {
    this.missionsByRobot.delete(robotId);
  }
}

export const personSearchService = new PersonSearchService();
