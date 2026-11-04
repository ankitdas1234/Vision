import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/music/PlaySongService", () => ({
  startPlayRequest: vi.fn(),
}));
vi.mock("../../../src/repositories/people.repository", () => ({
  peopleRepository: { update: vi.fn() },
}));
vi.mock("../../../src/repositories/personFaces.repository", () => ({
  personFacesRepository: { deleteAllForPerson: vi.fn() },
}));
// CommandExecutor.ts imports brainOrchestrator, which transitively pulls
// in the face/object-recognition chain (native TensorFlow binding via
// @vladmandic/human) — unrelated to what these tests actually check (the
// three new command handlers), and blocked by this sandbox's network
// whitelist the same way documented elsewhere in this codebase. Mocked
// so these tests get real pass/fail signal instead of failing to load.
vi.mock("../../../src/brain/BrainOrchestrator", () => ({
  brainOrchestrator: { runCycle: vi.fn() },
}));

import { commandExecutor } from "../../../src/commands/CommandExecutor";
import { startPlayRequest } from "../../../src/music/PlaySongService";
import { peopleRepository } from "../../../src/repositories/people.repository";
import { personFacesRepository } from "../../../src/repositories/personFaces.repository";

describe("PLAY_SONG_REQUEST command", () => {
  it("calls startPlayRequest with the robot, person, and requested text, and returns the play request id", async () => {
    vi.mocked(startPlayRequest).mockResolvedValue({ id: "req-1", status: "SEARCHING" } as never);

    const result = await commandExecutor.execute({
      commandId: "c1",
      type: "PLAY_SONG_REQUEST",
      params: { text: "some jazz", personId: "person-1" },
      ctx: { source: "DASHBOARD", robotId: "vision-001" },
    });

    expect(startPlayRequest).toHaveBeenCalledWith("vision-001", "person-1", "some jazz");
    expect(result).toEqual({ playRequestId: "req-1", status: "SEARCHING" });
  });

  it("falls back to the dispatching context's personId when none is given explicitly", async () => {
    vi.mocked(startPlayRequest).mockResolvedValue({ id: "req-2", status: "SEARCHING" } as never);

    await commandExecutor.execute({
      commandId: "c2",
      type: "PLAY_SONG_REQUEST",
      params: { text: "some jazz" },
      ctx: { source: "DASHBOARD", robotId: "vision-001", personId: "person-from-ctx" },
    });

    expect(startPlayRequest).toHaveBeenCalledWith("vision-001", "person-from-ctx", "some jazz");
  });
});

describe("SET_DANCE_PREFERENCE command", () => {
  it("updates the person's autonomousDanceEnabled flag", async () => {
    const result = await commandExecutor.execute({
      commandId: "c3",
      type: "SET_DANCE_PREFERENCE",
      params: { personId: "person-1", enabled: false },
      ctx: { source: "DASHBOARD", robotId: "vision-001" },
    });

    expect(peopleRepository.update).toHaveBeenCalledWith("person-1", { autonomousDanceEnabled: false });
    expect(result).toEqual({ personId: "person-1", autonomousDanceEnabled: false });
  });
});

describe("RESET_PERSON_FACE command", () => {
  it("clears every registered face for the person and reports how many were removed", async () => {
    vi.mocked(personFacesRepository.deleteAllForPerson).mockResolvedValue(3);

    const result = await commandExecutor.execute({
      commandId: "c4",
      type: "RESET_PERSON_FACE",
      params: { personId: "person-1" },
      ctx: { source: "DASHBOARD", robotId: "vision-001" },
    });

    expect(personFacesRepository.deleteAllForPerson).toHaveBeenCalledWith("person-1");
    expect(result).toEqual({ personId: "person-1", deletedCount: 3 });
  });
});
