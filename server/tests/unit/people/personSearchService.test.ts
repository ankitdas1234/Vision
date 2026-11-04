import { describe, it, expect, beforeEach, vi } from "vitest";
import { personSearchService } from "../../../src/people/PersonSearchService";
import { taskManager } from "../../../src/tasks/TaskManager";

describe("PersonSearchService", () => {
  const robotId = "vision-search-test";

  beforeEach(() => {
    personSearchService.clear(robotId);
  });

  it("has no active mission by default", () => {
    expect(personSearchService.getActiveMission(robotId)).toBeNull();
  });

  it("starts a SEARCHING mission", () => {
    const task = taskManager.create({ robotId, taskType: "FIND_PERSON" });
    const mission = personSearchService.start({ taskId: task.id, robotId, targetPersonId: "p1", targetName: "Sam" });
    expect(mission.status).toBe("SEARCHING");
    expect(personSearchService.getActiveMission(robotId)?.targetPersonId).toBe("p1");
  });

  it("reports TARGET_FOUND when the recognized person matches the target", () => {
    const task = taskManager.create({ robotId, taskType: "FIND_PERSON" });
    personSearchService.start({ taskId: task.id, robotId, targetPersonId: "p1", targetName: "Sam" });
    const sighting = personSearchService.reportSighting(robotId, { personId: "p1", name: "Sam", category: "FAMILY", confidence: 0.95 }, true);
    expect(sighting?.event).toBe("TARGET_FOUND");
    expect(personSearchService.getActiveMission(robotId)?.status).toBe("FOUND");
  });

  it("does not report a match for a different person", () => {
    const task = taskManager.create({ robotId, taskType: "FIND_PERSON" });
    personSearchService.start({ taskId: task.id, robotId, targetPersonId: "p1", targetName: "Sam" });
    const sighting = personSearchService.reportSighting(robotId, { personId: "p2", name: "Alex", category: "FAMILY", confidence: 0.9 }, true);
    expect(sighting?.event).not.toBe("TARGET_FOUND");
  });

  it("suggests asking a bystander when someone else approaches while searching", () => {
    const task = taskManager.create({ robotId, taskType: "FIND_PERSON" });
    personSearchService.start({ taskId: task.id, robotId, targetPersonId: "p1", targetName: "Sam", requestedByPersonId: "requester-1" });
    const sighting = personSearchService.reportSighting(robotId, { personId: "p2", name: "Alex", category: "FAMILY", confidence: 0.9 }, true);
    expect(sighting?.event).toBe("ASK_BYSTANDER");
  });

  it("does not ask the requester themselves as a bystander", () => {
    const task = taskManager.create({ robotId, taskType: "FIND_PERSON" });
    personSearchService.start({ taskId: task.id, robotId, targetPersonId: "p1", targetName: "Sam", requestedByPersonId: "requester-1" });
    const sighting = personSearchService.reportSighting(robotId, { personId: "requester-1", name: "Requester", category: "FAMILY", confidence: 0.9 }, true);
    expect(sighting).toBeNull();
  });

  it("does not ask about someone far away / not approaching", () => {
    const task = taskManager.create({ robotId, taskType: "FIND_PERSON" });
    personSearchService.start({ taskId: task.id, robotId, targetPersonId: "p1", targetName: "Sam" });
    const sighting = personSearchService.reportSighting(robotId, { personId: "p2", name: "Alex", category: "FAMILY", confidence: 0.9 }, false);
    expect(sighting).toBeNull();
  });

  it("clears once the mission's backing task is cancelled", () => {
    const task = taskManager.create({ robotId, taskType: "FIND_PERSON" });
    personSearchService.start({ taskId: task.id, robotId, targetPersonId: "p1", targetName: "Sam" });
    taskManager.cancel(task.id);
    expect(personSearchService.getActiveMission(robotId)).toBeNull();
  });

  it("completes and clears cleanly", () => {
    const task = taskManager.create({ robotId, taskType: "FIND_PERSON" });
    personSearchService.start({ taskId: task.id, robotId, targetPersonId: "p1", targetName: "Sam" });
    personSearchService.complete(robotId, "COMPLETED");
    expect(personSearchService.getActiveMission(robotId)).toBeNull();
  });
});
