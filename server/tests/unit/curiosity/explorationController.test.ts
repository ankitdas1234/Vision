import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/decisions/GoalProposer", () => ({
  proposeGoal: vi.fn(),
  EXPLORATION_GOALS: ["SCAN_AREA", "INVESTIGATE_NEAREST_UNKNOWN_OBJECT", "WANDER", "RETURN_AND_REST"],
}));

// ExplorationController's real dependency, CommandRegistry, transitively
// pulls in the face/object-recognition chain (native TensorFlow binding
// via @vladmandic/human/face-api), which needs a binary this sandbox's
// network whitelist can't fetch — completely unrelated to what these
// tests are actually checking (the goal-proposal lifecycle and real
// observation-context wiring). Mocked so these tests get real pass/fail
// signal in this environment instead of failing to even load.
vi.mock("../../../src/commands/CommandRegistry", () => ({
  commandRegistry: { dispatch: vi.fn().mockResolvedValue({ success: true }) },
}));

import { proposeGoal } from "../../../src/decisions/GoalProposer";
import { tick, recordObservation, __resetExplorationStateForTests } from "../../../src/curiosity/ExplorationController";
import { taskManager } from "../../../src/tasks/TaskManager";

const mockProposeGoal = vi.mocked(proposeGoal);

describe("ExplorationController.tick", () => {
  it("does nothing and reports inactive when explorationActive is false and nothing was running", async () => {
    __resetExplorationStateForTests();
    mockProposeGoal.mockReset();
    const result = await tick("robot-a", false);
    expect(result.active).toBe(false);
    expect(result.currentGoal).toBeNull();
  });

  it("starts exploring and proposes a first goal when explorationActive flips true", async () => {
    __resetExplorationStateForTests();
    mockProposeGoal.mockReset();
    mockProposeGoal.mockResolvedValue({ goal: "SCAN_AREA", reason: "test", fromModel: false });

    const result = await tick("robot-b", true);
    expect(result.active).toBe(true);
    expect(result.currentGoal).toBe("SCAN_AREA");
    expect(mockProposeGoal).toHaveBeenCalledTimes(1);
  });

  it("creates a real EXPLORATION task when starting", async () => {
    __resetExplorationStateForTests();
    mockProposeGoal.mockReset();
    mockProposeGoal.mockResolvedValue({ goal: "WANDER", reason: "test", fromModel: false });

    await tick("robot-c", true);
    const tasks = taskManager.list().filter((t) => t.robotId === "robot-c" && t.taskType === "EXPLORATION");
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks[tasks.length - 1].status).toBe("RUNNING");
  });

  it("does not propose a new goal on every tick — rate-limited", async () => {
    __resetExplorationStateForTests();
    mockProposeGoal.mockReset();
    mockProposeGoal.mockResolvedValue({ goal: "SCAN_AREA", reason: "test", fromModel: false });

    await tick("robot-d", true); // starts, 1 call
    await tick("robot-d", true); // still active, too soon for another proposal
    await tick("robot-d", true);

    expect(mockProposeGoal).toHaveBeenCalledTimes(1);
  });

  it("stops immediately (marks inactive) when explorationActive flips back to false", async () => {
    __resetExplorationStateForTests();
    mockProposeGoal.mockReset();
    mockProposeGoal.mockResolvedValue({ goal: "WANDER", reason: "test", fromModel: false });

    await tick("robot-e", true);
    const result = await tick("robot-e", false);

    expect(result.active).toBe(false);
    expect(result.currentGoal).toBeNull();
  });

  it("marks the EXPLORATION task COMPLETED (not left dangling) when stopped", async () => {
    __resetExplorationStateForTests();
    mockProposeGoal.mockReset();
    mockProposeGoal.mockResolvedValue({ goal: "WANDER", reason: "test", fromModel: false });

    await tick("robot-f", true);
    await tick("robot-f", false);

    const tasks = taskManager.list().filter((t) => t.robotId === "robot-f" && t.taskType === "EXPLORATION");
    expect(tasks[tasks.length - 1].status).toBe("COMPLETED");
  });

  it("degrades gracefully (does not throw) if goal proposal itself fails", async () => {
    __resetExplorationStateForTests();
    mockProposeGoal.mockReset();
    mockProposeGoal.mockImplementation(async () => {
      throw new Error("proposal failed");
    });

    await expect(tick("robot-g", true)).resolves.not.toThrow();
  });
});

describe("ExplorationController — real observation context", () => {
  it("passes empty context to the goal proposer when nothing has been observed", async () => {
    __resetExplorationStateForTests();
    mockProposeGoal.mockReset();
    mockProposeGoal.mockResolvedValue({ goal: "WANDER", reason: "test", fromModel: false });

    await tick("robot-h", true);

    expect(mockProposeGoal).toHaveBeenCalledWith(expect.objectContaining({ recentMemorySummary: "", hasUnknownObjectsNearby: false }));
  });

  it("feeds real recorded object labels into the goal proposer's context", async () => {
    __resetExplorationStateForTests();
    mockProposeGoal.mockReset();
    mockProposeGoal.mockResolvedValue({ goal: "SCAN_AREA", reason: "test", fromModel: false });

    recordObservation("robot-i", ["chair", "backpack"]);
    await tick("robot-i", true);

    expect(mockProposeGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        recentMemorySummary: expect.stringContaining("chair"),
        hasUnknownObjectsNearby: true,
      }),
    );
  });

  it("deduplicates repeated labels in the context summary", async () => {
    __resetExplorationStateForTests();
    mockProposeGoal.mockReset();
    mockProposeGoal.mockResolvedValue({ goal: "SCAN_AREA", reason: "test", fromModel: false });

    recordObservation("robot-j", ["chair", "chair", "chair"]);
    await tick("robot-j", true);

    const callArg = mockProposeGoal.mock.calls[0][0];
    const chairMentions = (callArg.recentMemorySummary.match(/chair/g) ?? []).length;
    expect(chairMentions).toBe(1);
  });

  it("keeps observation context independent per robot", async () => {
    __resetExplorationStateForTests();
    mockProposeGoal.mockReset();
    mockProposeGoal.mockResolvedValue({ goal: "WANDER", reason: "test", fromModel: false });

    recordObservation("robot-k1", ["lamp"]);
    await tick("robot-k2", true); // a different robot that never observed anything

    expect(mockProposeGoal).toHaveBeenCalledWith(expect.objectContaining({ recentMemorySummary: "", hasUnknownObjectsNearby: false }));
  });

  it("recording an empty label list does not create false context", async () => {
    __resetExplorationStateForTests();
    mockProposeGoal.mockReset();
    mockProposeGoal.mockResolvedValue({ goal: "WANDER", reason: "test", fromModel: false });

    recordObservation("robot-l", []);
    await tick("robot-l", true);

    expect(mockProposeGoal).toHaveBeenCalledWith(expect.objectContaining({ hasUnknownObjectsNearby: false }));
  });
});
