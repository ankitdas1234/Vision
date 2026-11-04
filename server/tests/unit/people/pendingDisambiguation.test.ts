import { describe, it, expect, vi, beforeEach } from "vitest";
import { startDisambiguation, getPendingDisambiguation, isTimedOut, resolveDisambiguation, clearDisambiguation } from "../../../src/people/PendingDisambiguation";

describe("PendingDisambiguation", () => {
  const robotId = "vision-disambig-test";

  beforeEach(() => {
    clearDisambiguation(robotId);
    vi.useRealTimers();
  });

  it("has nothing pending by default", () => {
    expect(getPendingDisambiguation(robotId)).toBeNull();
  });

  it("tracks a started disambiguation with no resolution yet", () => {
    startDisambiguation(robotId, { taskId: "t1", targetName: "Sam", candidateIds: ["p1", "p2"], requestedByPersonId: null });
    const pending = getPendingDisambiguation(robotId);
    expect(pending?.targetName).toBe("Sam");
    expect(pending?.candidateIds).toEqual(["p1", "p2"]);
    expect(pending?.resolvedPersonId).toBeNull();
  });

  it("records a resolution once the camera matches a candidate", () => {
    startDisambiguation(robotId, { taskId: "t1", targetName: "Sam", candidateIds: ["p1", "p2"], requestedByPersonId: null });
    resolveDisambiguation(robotId, "p2");
    expect(getPendingDisambiguation(robotId)?.resolvedPersonId).toBe("p2");
  });

  it("is not timed out immediately after starting", () => {
    startDisambiguation(robotId, { taskId: "t1", targetName: "Sam", candidateIds: ["p1"], requestedByPersonId: null });
    expect(isTimedOut(getPendingDisambiguation(robotId)!)).toBe(false);
  });

  it("reports timed out once the window has elapsed", () => {
    vi.useFakeTimers();
    startDisambiguation(robotId, { taskId: "t1", targetName: "Sam", candidateIds: ["p1"], requestedByPersonId: null });
    vi.advanceTimersByTime(61_000);
    expect(isTimedOut(getPendingDisambiguation(robotId)!)).toBe(true);
    vi.useRealTimers();
  });

  it("clears cleanly", () => {
    startDisambiguation(robotId, { taskId: "t1", targetName: "Sam", candidateIds: ["p1"], requestedByPersonId: null });
    clearDisambiguation(robotId);
    expect(getPendingDisambiguation(robotId)).toBeNull();
  });
});
