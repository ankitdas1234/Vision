import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

vi.mock("../../../src/audio/AudioService", () => ({
  audioService: {
    processAudio: async (buffer: Buffer) => ({ transcript: buffer.toString("utf8"), confidence: 1 }),
    getState: () => "IDLE",
  },
}));

const dispatched: Array<{ type: string; source: string; isAdmin: boolean }> = [];
vi.mock("../../../src/commands/CommandRegistry", () => ({
  commandRegistry: {
    dispatch: async (input: { type: string; source: string; isAdmin: boolean }) => {
      dispatched.push({ type: input.type, source: input.source, isAdmin: input.isAdmin });
      return { type: input.type, status: "OK", success: true };
    },
    getLastCommand: () => null,
  },
}));

vi.mock("../../../src/reactions/GestureExecutor", () => ({ playGesture: async () => true }));vi.mock("../../../src/repositories/speechEvents.repository", () => ({
  speechEventsRepository: { record: async () => undefined, interruptionCount: async () => 0 },
}));
vi.mock("../../../src/repositories/robot.repository", () => ({ robotRepository: { findByCode: async () => null } }));

const { conversationRouter } = await import("../../../src/routes/conversation.routes");
const { resetRepetition } = await import("../../../src/audio/RepetitionTracker");
const { resetAdminPresence, noteAdminFaceConfirmed } = await import("../../../src/people/AdminPresence");
const { resetPendingConfirmations } = await import("../../../src/people/PendingEmergencyStopConfirmation");
const { controlMode } = await import("../../../src/control/ControlMode");

const ROBOT_CODE = "vision-001";
const SECRET = process.env.ROBOT_AUTH_SECRET ?? "dev-insecure-robot-secret";

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use("/api", conversationRouter);
const server: Server = app.listen(0);
const port = (server.address() as { port: number }).port;
afterAll(() => server.close());

async function say(text: string, opts: { isAdmin?: boolean; personId?: string } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}/api/audio/conversation-turn`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-robot-secret": SECRET },
    body: JSON.stringify({
      robotCode: ROBOT_CODE,
      segments: [{
        audioBase64: Buffer.from(text, "utf8").toString("base64"),
        speakerTag: "spk_0", personId: opts.personId ?? "person-A", isAdmin: opts.isAdmin ?? false,
      }],
    }),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

describe("emergency stop is admin-only, verified by voice or face", () => {
  beforeEach(() => {
    dispatched.length = 0;
    resetRepetition();
    resetAdminPresence();
    resetPendingConfirmations();
  });

  it("checks first instead of refusing outright for a plain guest saying 'emergency stop'", async () => {
    const body = await say("emergency stop", { isAdmin: false });
    expect(body.acted).toBe(false);
    // No EMERGENCY_STOP fires — but Vision does turn to actively look,
    // rather than just standing there refusing. See
    // people/PendingEmergencyStopConfirmation.ts / GaitController.
    expect(dispatched).toEqual([{ type: "TURN_RIGHT", source: "SYSTEM", isAdmin: true }]);
    expect((body.replies as Array<{ text: string }>).at(-1)?.text).toMatch(/need to check you're an admin/i);
  });

  it("skips the physical turn in Manual Mode — never fights a human's own driving", async () => {
    const spy = vi.spyOn(controlMode, "isManualModeEnabled").mockResolvedValue(true);
    const body = await say("emergency stop", { isAdmin: false });
    expect(body.acted).toBe(false);
    expect(dispatched).toEqual([]); // no TURN_RIGHT — Manual Mode has priority
    spy.mockRestore();
  });

  it("opens a confirmation window when it can't verify at that instant", async () => {
    const { isConfirmationPending } = await import("../../../src/people/PendingEmergencyStopConfirmation");
    expect(isConfirmationPending(ROBOT_CODE)).toBe(false);
    await say("emergency stop", { isAdmin: false });
    expect(isConfirmationPending(ROBOT_CODE)).toBe(true);
  });

  it("does not leave a stray confirmation window open after a request that succeeded outright", async () => {
    const { isConfirmationPending } = await import("../../../src/people/PendingEmergencyStopConfirmation");
    await say("emergency stop", { isAdmin: true });
    expect(isConfirmationPending(ROBOT_CODE)).toBe(false);
  });

  it("carries out the stop for a voice-verified admin", async () => {
    const body = await say("emergency stop", { isAdmin: true });
    expect(body.acted).toBe(true);
    expect(dispatched).toEqual([{ type: "EMERGENCY_STOP", source: "ADMIN", isAdmin: true }]);
  });

  it("carries out the stop on a plain guest's voice if the camera recently confirmed an admin's face", async () => {
    noteAdminFaceConfirmed(ROBOT_CODE);
    const body = await say("emergency stop", { isAdmin: false });
    expect(body.acted).toBe(true);
    expect(dispatched).toEqual([{ type: "EMERGENCY_STOP", source: "ADMIN", isAdmin: true }]);
  });

  it("does not let a stale voice confirmation from an earlier, unrelated turn authorize a different speaker's request", async () => {
    await say("hello there", { isAdmin: true, personId: "person-ADMIN" }); // refreshes voice presence generally
    dispatched.length = 0;
    const body = await say("emergency stop", { isAdmin: false, personId: "person-GUEST" });
    expect(body.acted).toBe(false);
    // Refused, but still turns to actively check — same as any other
    // unverified request; the stale voice confirmation just doesn't
    // shortcut past that check.
    expect(dispatched).toEqual([{ type: "TURN_RIGHT", source: "SYSTEM", isAdmin: true }]);
  });

  it("an ordinary 'stop' still just walks-stops for anyone — unaffected", async () => {
    const body = await say("stop", { isAdmin: false });
    expect(body.intent).toMatchObject({ type: "MOVEMENT_COMMAND" });
    expect(dispatched.some((d) => d.type === "WALK_STOP")).toBe(true);
  });

  it("takes priority over a pending name-introduction flow", async () => {
    const { askForName, clearPendingIntroduction } = await import("../../../src/people/Introductions");
    askForName(ROBOT_CODE, "person-A"); // Vision just asked "what's your name?"
    const body = await say("emergency stop", { isAdmin: true });
    expect(body.acted).toBe(true);
    expect(dispatched[0]?.type).toBe("EMERGENCY_STOP");
    clearPendingIntroduction(ROBOT_CODE);
  });
});
