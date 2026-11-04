import { describe, it, expect, vi, beforeEach } from "vitest";
import { askAboutMemory, getPendingMemoryReview, clearPendingMemoryReview, hasPendingMemoryReview } from "../../../src/people/PendingMemoryReview";

describe("PendingMemoryReview", () => {
  const robotId = "vision-memory-review-test";
  const memory = { id: "mem-1", personId: "person-1", content: "prefers quiet music" };

  beforeEach(() => {
    clearPendingMemoryReview(robotId);
    vi.useRealTimers();
  });

  it("has nothing pending by default", () => {
    expect(getPendingMemoryReview(robotId)).toBeNull();
    expect(hasPendingMemoryReview(robotId)).toBe(false);
  });

  it("tracks a memory that was just asked about", () => {
    askAboutMemory(robotId, memory);
    const pending = getPendingMemoryReview(robotId);
    expect(pending?.memoryId).toBe("mem-1");
    expect(pending?.personId).toBe("person-1");
    expect(pending?.content).toBe("prefers quiet music");
    expect(hasPendingMemoryReview(robotId)).toBe(true);
  });

  it("clears after being answered", () => {
    askAboutMemory(robotId, memory);
    clearPendingMemoryReview(robotId);
    expect(getPendingMemoryReview(robotId)).toBeNull();
  });

  it("expires after the timeout window (45s)", () => {
    vi.useFakeTimers();
    askAboutMemory(robotId, memory);
    vi.advanceTimersByTime(46_000);
    expect(getPendingMemoryReview(robotId)).toBeNull();
    vi.useRealTimers();
  });

  it("does not expire just under the timeout window", () => {
    vi.useFakeTimers();
    askAboutMemory(robotId, memory);
    vi.advanceTimersByTime(44_000);
    expect(getPendingMemoryReview(robotId)).not.toBeNull();
    vi.useRealTimers();
  });

  it("keeps different robots independent", () => {
    askAboutMemory(robotId, memory);
    expect(getPendingMemoryReview("some-other-robot")).toBeNull();
  });

  it("a second askAboutMemory replaces the first pending question for that robot", () => {
    askAboutMemory(robotId, memory);
    askAboutMemory(robotId, { id: "mem-2", personId: "person-2", content: "likes tea" });
    const pending = getPendingMemoryReview(robotId);
    expect(pending?.memoryId).toBe("mem-2");
  });
});
