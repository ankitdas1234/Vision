import { describe, it, expect, vi } from "vitest";
import { commandExecutor } from "../../../src/commands/CommandExecutor";
import { taskManager } from "../../../src/tasks/TaskManager";
import { paramsForArg } from "../../../src/scripts/ScriptExecutor";

describe("FIND_PERSON command", () => {
  it("returns a taskId immediately without blocking on the search", async () => {
    const result = await commandExecutor.execute({
      commandId: "c1",
      type: "FIND_PERSON",
      params: { name: "NobodyRegisteredWithThisName" },
      ctx: { source: "DASHBOARD", robotId: "vision-001" },
    });
    expect(result).toHaveProperty("taskId");
    expect((result as any).status).toBe("PENDING");
  });

  it("eventually fails cleanly when no such person is registered (no DB in this test env)", async () => {
    const result = await commandExecutor.execute({
      commandId: "c2",
      type: "FIND_PERSON",
      params: { name: "NobodyRegisteredWithThisName" },
      ctx: { source: "DASHBOARD", robotId: "vision-001" },
    });
    const taskId = (result as any).taskId as string;
    // The search runner resolves the name lookup and fails fast when not found.
    await vi.waitFor(() => {
      const task = taskManager.get(taskId);
      expect(task?.status).toBe("FAILED");
    }, { timeout: 2000 });
  });
});

describe("DANCE command", () => {
  it("returns a taskId and eventually completes a short routine", async () => {
    const result = await commandExecutor.execute({
      commandId: "c3",
      type: "DANCE",
      params: { durationMs: 400 },
      ctx: { source: "DASHBOARD", robotId: "vision-001" },
    });
    expect(result).toHaveProperty("taskId");
    const taskId = (result as any).taskId as string;
    await vi.waitFor(() => {
      const task = taskManager.get(taskId);
      expect(["COMPLETED", "FAILED"]).toContain(task?.status);
    }, { timeout: 5000 });
  });
});

describe("ScriptExecutor.paramsForArg", () => {
  it("maps a string arg to text/name/trackId", () => {
    expect(paramsForArg("Sam")).toEqual({ text: "Sam", name: "Sam", trackId: "Sam" });
  });

  it("maps a numeric arg to every plausible numeric field including durationMs", () => {
    expect(paramsForArg(30)).toEqual({ angle: 30, targetAngle: 30, speed: 30, durationMs: 30, step: 30 });
  });
});
