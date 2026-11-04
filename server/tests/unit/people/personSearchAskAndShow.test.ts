import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPeople } = vi.hoisted(() => ({
  mockPeople: { findAllByName: vi.fn(), findById: vi.fn() },
}));

vi.mock("../../../src/repositories/people.repository", () => ({ peopleRepository: mockPeople }));
vi.mock("../../../src/people/PersonSearchService", () => ({
  personSearchService: {
    start: vi.fn(() => ({ targetName: "Sam" })),
    getActiveMission: vi.fn(() => null), // ends the patrol loop immediately once started
    setStatus: vi.fn(),
    complete: vi.fn(),
    clear: vi.fn(),
  },
}));
vi.mock("../../../src/commands/CommandRegistry", () => ({
  commandRegistry: { dispatch: vi.fn(async () => ({ success: true })) },
}));

import { runPersonSearch } from "../../../src/people/PersonSearchRunner";
import { getPendingDisambiguation, resolveDisambiguation, clearDisambiguation } from "../../../src/people/PendingDisambiguation";
import { taskManager } from "../../../src/tasks/TaskManager";
import { commandRegistry } from "../../../src/commands/CommandRegistry";
import { personSearchService } from "../../../src/people/PersonSearchService";

describe("runPersonSearch — ask out loud, resolve from the camera", () => {
  const robotId = "vision-ask-show-test";

  beforeEach(() => {
    vi.clearAllMocks();
    clearDisambiguation(robotId);
  });

  it("asks out loud and starts a pending disambiguation when the name is ambiguous", async () => {
    mockPeople.findAllByName.mockResolvedValue([{ id: "p1", name: "Sam" }, { id: "p2", name: "Sam" }]);
    const task = taskManager.create({ robotId, taskType: "FIND_PERSON" });

    // Don't await to completion — just watch the immediate ask + pending state,
    // then cancel so the wait loop exits promptly instead of hitting the real timeout.
    const promise = runPersonSearch(task.id, robotId, "Sam");
    await new Promise((r) => setTimeout(r, 20));

    expect(commandRegistry.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "AUDIO_SPEAK", params: expect.objectContaining({ text: expect.stringMatching(/show me a photo/i) }) }),
    );
    expect(getPendingDisambiguation(robotId)?.candidateIds).toEqual(["p1", "p2"]);

    taskManager.cancel(task.id);
    await promise;
  });

  it("proceeds with the search once the camera resolves which person was meant", async () => {
    mockPeople.findAllByName.mockResolvedValue([{ id: "p1", name: "Sam" }, { id: "p2", name: "Sam" }]);
    mockPeople.findById.mockResolvedValue({ id: "p2", name: "Sam" });
    const task = taskManager.create({ robotId, taskType: "FIND_PERSON" });

    const promise = runPersonSearch(task.id, robotId, "Sam");
    await new Promise((r) => setTimeout(r, 20));

    // Simulate BrainOrchestrator's camera-side match resolving it.
    resolveDisambiguation(robotId, "p2");
    await promise;

    expect(personSearchService.start).toHaveBeenCalledWith(expect.objectContaining({ targetPersonId: "p2" }));
    expect(commandRegistry.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "AUDIO_SPEAK", params: expect.objectContaining({ text: expect.stringMatching(/got it/i) }) }),
    );
  });

  it("fails clearly if no photo is shown before the timeout", async () => {
    vi.useFakeTimers();
    mockPeople.findAllByName.mockResolvedValue([{ id: "p1", name: "Sam" }, { id: "p2", name: "Sam" }]);
    const task = taskManager.create({ robotId, taskType: "FIND_PERSON" });

    const promise = runPersonSearch(task.id, robotId, "Sam");
    await vi.advanceTimersByTimeAsync(61_000);
    await promise;

    expect(taskManager.get(task.id)?.status).toBe("FAILED");
    expect(taskManager.get(task.id)?.error).toMatch(/timed out/i);
    vi.useRealTimers();
  });
});
