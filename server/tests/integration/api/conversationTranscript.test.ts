import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

// STT must NOT be touched when a transcript is supplied (browser speech recognition / typed text).
const stt = vi.fn(async () => { throw new Error("STT should not run for pre-transcribed segments"); });
vi.mock("../../../src/audio/AudioService", () => ({ audioService: { processAudio: stt, getState: () => "IDLE" } }));

const dispatched: { type: string; params?: unknown; source?: string; isAdmin?: boolean }[] = [];
vi.mock("../../../src/commands/CommandRegistry", () => ({
  commandRegistry: {
    dispatch: async (input: { type: string }) => { dispatched.push(input as never); return { type: input.type, status: "OK" }; },
    getLastCommand: () => null,
  },
}));
vi.mock("../../../src/reactions/GestureExecutor", () => ({ playGesture: async () => true }));
vi.mock("../../../src/repositories/speechEvents.repository", () => ({ speechEventsRepository: { record: async () => undefined, interruptionCount: async () => 0 } }));
vi.mock("../../../src/repositories/robot.repository", () => ({ robotRepository: { findByCode: async () => null } }));

const { conversationRouter } = await import("../../../src/routes/conversation.routes");

const SECRET = process.env.ROBOT_AUTH_SECRET ?? "dev-insecure-robot-secret";
const app = express();
app.use(express.json());
app.use("/api", conversationRouter);
const server: Server = app.listen(0);
const port = (server.address() as { port: number }).port;
afterAll(() => server.close());

async function turn(segments: unknown[]) {
  const res = await fetch(`http://127.0.0.1:${port}/api/audio/conversation-turn`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-robot-secret": SECRET },
    body: JSON.stringify({ robotCode: "vision-001", segments }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

describe("conversation turn with pre-transcribed text (3D simulator / typed input)", () => {
  beforeEach(() => { dispatched.length = 0; stt.mockClear(); });

  it("runs the real movement-intent pipeline from a transcript, without speech-to-text", async () => {
    const { status, body } = await turn([{ transcript: "turn left" }]);
    expect(status).toBe(200);
    expect(stt).not.toHaveBeenCalled();
    expect(body.acted).toBe(true);
    expect(body.transcript).toBe("turn left");
    expect(dispatched.map((d) => d.type)).toEqual(["TURN_LEFT"]);
    expect(dispatched[0].source).toBe("AI");
  });

  it("an emergency-stop phrase from a non-admin is NOT executed (same admin rules as voice)", async () => {
    const { body } = await turn([{ transcript: "Vision emergency stop", isAdmin: false }]);
    expect(dispatched.find((d) => d.type === "EMERGENCY_STOP")).toBeUndefined();
    expect(body.acted).toBe(false);
  });

  it("an emergency-stop from an identified admin who addresses Vision IS executed", async () => {
    const { body } = await turn([{ transcript: "Vision emergency stop", isAdmin: true }]);
    expect(body.acted).toBe(true);
    expect(dispatched.find((d) => d.type === "EMERGENCY_STOP")).toBeTruthy();
  });

  it("rejects a segment that has neither audio nor a transcript", async () => {
    const { status, body } = await turn([{ speakerTag: "x" }]);
    expect(status).toBe(400);
    expect(body.code).toBe("NO_AUDIO");
  });

  it("raw audio still goes through STT exactly as before", async () => {
    stt.mockImplementationOnce(async () => ({ transcript: "stop", confidence: 1 }) as never);
    const { body } = await turn([{ audioBase64: Buffer.from("x").toString("base64") }]);
    expect(stt).toHaveBeenCalledTimes(1);
    expect(body.transcript).toBe("stop");
  });
});
