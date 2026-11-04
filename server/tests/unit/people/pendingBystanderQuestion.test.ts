import { describe, it, expect, vi, beforeEach } from "vitest";
import { markBystanderAsked, getPendingBystanderQuestion, clearPendingBystanderQuestion } from "../../../src/people/PendingBystanderQuestion";

describe("PendingBystanderQuestion", () => {
  const robotId = "vision-bystander-test";

  beforeEach(() => {
    clearPendingBystanderQuestion(robotId);
    vi.useRealTimers();
  });

  it("has nothing pending by default", () => {
    expect(getPendingBystanderQuestion(robotId)).toBeNull();
  });

  it("tracks a question that was just asked", () => {
    markBystanderAsked(robotId, "task-1", "Sam");
    const pending = getPendingBystanderQuestion(robotId);
    expect(pending?.taskId).toBe("task-1");
    expect(pending?.targetName).toBe("Sam");
  });

  it("clears after being answered", () => {
    markBystanderAsked(robotId, "task-1", "Sam");
    clearPendingBystanderQuestion(robotId);
    expect(getPendingBystanderQuestion(robotId)).toBeNull();
  });

  it("expires after the timeout window", () => {
    vi.useFakeTimers();
    markBystanderAsked(robotId, "task-1", "Sam");
    vi.advanceTimersByTime(31_000);
    expect(getPendingBystanderQuestion(robotId)).toBeNull();
    vi.useRealTimers();
  });

  it("keeps different robots independent", () => {
    markBystanderAsked(robotId, "task-1", "Sam");
    expect(getPendingBystanderQuestion("some-other-robot")).toBeNull();
  });
});
