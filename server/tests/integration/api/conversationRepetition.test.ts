import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

/** The transcript is whatever the caller base64-encoded — this test is
 * about what Vision does with a transcript, not about STT. */
vi.mock("../../../src/audio/AudioService", () => ({
  audioService: {
    processAudio: async (buffer: Buffer) => ({ transcript: buffer.toString("utf8"), confidence: 1 }),
    getState: () => "IDLE",
  },
}));

const spoken: string[] = [];
vi.mock("../../../src/commands/CommandRegistry", () => ({
  commandRegistry: {
    dispatch: async (input: { type: string; params?: { text?: string } }) => {
      if (input.type === "AUDIO_SPEAK" && input.params?.text) spoken.push(input.params.text);
      return { type: input.type, status: "OK" };
    },
    getLastCommand: () => null,
  },
}));

const gesturesPlayed: string[] = [];
vi.mock("../../../src/reactions/GestureExecutor", () => ({
  playGesture: async (_robotId: string, gesture: string) => {
    gesturesPlayed.push(gesture);
    return true;
  },
}));

vi.mock("../../../src/repositories/speechEvents.repository", () => ({
  speechEventsRepository: {
    record: async () => undefined,
    interruptionCount: async () => 0,
  },
}));

vi.mock("../../../src/repositories/robot.repository", () => ({
  robotRepository: { findByCode: async () => null },
}));

const { conversationRouter } = await import("../../../src/routes/conversation.routes");
const { resetRepetition, FREE_REPEATS } = await import("../../../src/audio/RepetitionTracker");
const { clearAnnoyance, isAnnoyed } = await import("../../../src/mental/Annoyance");

const ROBOT_CODE = "vision-001";
const SECRET = process.env.ROBOT_AUTH_SECRET ?? "dev-insecure-robot-secret";

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use("/api", conversationRouter);
const server: Server = app.listen(0);
const port = (server.address() as { port: number }).port;

afterAll(() => server.close());

async function say(text: string, personId = "person-A") {
  const res = await fetch(`http://127.0.0.1:${port}/api/audio/conversation-turn`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-robot-secret": SECRET },
    body: JSON.stringify({
      robotCode: ROBOT_CODE,
      segments: [{ audioBase64: Buffer.from(text, "utf8").toString("base64"), speakerTag: "spk_0", personId }],
    }),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

describe("repeated questions over the real conversation route", () => {
  beforeEach(() => {
    spoken.length = 0;
    gesturesPlayed.length = 0;
    resetRepetition();
    clearAnnoyance();
  });

  it("answers the same question patiently the first few times", async () => {
    for (let i = 0; i < FREE_REPEATS; i++) {
      const body = await say("what time is it?");
      expect(body.repeatedQuestion).toBeUndefined();
    }
    expect(spoken).toEqual([]); // nothing snappy said
  });

  it("pushes back, gestures, and stays annoyed once it goes past that", async () => {
    for (let i = 0; i < FREE_REPEATS; i++) await say("what time is it?");
    const body = await say("what time is it?");

    expect(body.acted).toBe(true);
    expect(body.repeatedQuestion).toMatchObject({ count: FREE_REPEATS + 1, level: 1 });
    expect(spoken.at(-1)).toMatch(/already answered/i);
    expect(gesturesPlayed).toContain("ANNOYED_TURN_AWAY");
    // The mood outlives the one reply, so the brain loop expresses it too.
    expect(isAnnoyed(ROBOT_CODE)).toBe(true);
  });

  it("gets sharper as it keeps happening", async () => {
    for (let i = 0; i < FREE_REPEATS + 1; i++) await say("what time is it?");
    const sharper = (await say("what time is it?")).repeatedQuestion as { level: number };
    expect(sharper.level).toBe(2);
    expect(spoken.at(-1)).toMatch(/stop asking/i);

    await say("what time is it?");
    const refusing = (await say("what time is it?")).repeatedQuestion as { level: number };
    expect(refusing.level).toBe(3);
    expect(spoken.at(-1)).toMatch(/not answering that again/i);
  });

  it("never gets annoyed at a repeated command — it just didn't work the first time", async () => {
    for (let i = 0; i < FREE_REPEATS + 4; i++) {
      const body = await say("stop");
      expect(body.repeatedQuestion).toBeUndefined();
      expect(body.intent).toMatchObject({ type: "MOVEMENT_COMMAND" });
    }
    expect(isAnnoyed(ROBOT_CODE)).toBe(false);
  });

  it("tracks each person separately", async () => {
    for (let i = 0; i < FREE_REPEATS + 1; i++) await say("what time is it?", "person-A");
    const other = await say("what time is it?", "person-B");
    expect(other.repeatedQuestion).toBeUndefined();
  });

  it("treats a rephrasing as the same question", async () => {
    await say("what is your name");
    await say("Vision, what's your name?");
    await say("so what's your name again");
    await say("hey, what is your name please");
    const body = await say("what's your name?");
    expect(body.repeatedQuestion).toMatchObject({ count: FREE_REPEATS + 1 });
  });
});
