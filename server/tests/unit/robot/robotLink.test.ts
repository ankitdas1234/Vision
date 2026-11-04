import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import WebSocket from "ws";

vi.mock("../../../src/camera/CameraService", () => ({
  cameraService: {
    capture: vi.fn(async () => ({ discarded: false, discardReason: null, motion: { present: true } })),
  },
}));
vi.mock("../../../src/config/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/config/env")>();
  // Mutable so one test can flip to simulation. Hardware is the mode where the link is open.
  return { env: { ...actual.env, ROBOT_MODE: "hardware" as "hardware" | "simulation" } };
});
vi.mock("../../../src/robot/heartbeat", () => ({ ingestHeartbeat: vi.fn() }));

import { RobotLink } from "../../../src/robot/RobotLink";
import { pendingCommandQueue } from "../../../src/commands/PendingCommandQueue";
import { setPendingSpeech } from "../../../src/audio/PendingSpeechCache";
import { ingestHeartbeat } from "../../../src/robot/heartbeat";
import { env } from "../../../src/config/env";

let server: Server;
let link: RobotLink;
let port: number;

type Inbox = { data: Buffer; isBinary: boolean }[];
const inboxes = new WeakMap<WebSocket, Inbox>();

// Messages are buffered from the instant the socket is created, because the
// server legitimately flushes queued commands the moment the link opens.
function connect(robotId: string, secret = env.ROBOT_AUTH_SECRET): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/robot-ws?robotId=${robotId}`, { headers: { "x-robot-secret": secret } });
    const inbox: Inbox = [];
    inboxes.set(ws, inbox);
    ws.on("message", (data, isBinary) => inbox.push({ data: data as Buffer, isBinary }));
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
    ws.once("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
  });
}

async function nextJson(ws: WebSocket, type: string, timeoutMs = 3000) {
  const inbox = inboxes.get(ws)!;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    while (inbox.length) {
      const m = inbox.shift()!;
      if (m.isBinary) continue;
      const j = JSON.parse(m.data.toString());
      if (j.t === type) return j;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timed out waiting for "${type}"`);
}

beforeAll(async () => {
  server = createServer();
  link = new RobotLink();
  link.attach(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  link.shutdown();
  server.close();
});

describe("RobotLink (persistent ESP32 WebSocket)", () => {
  it("rejects a connection with the wrong robot secret", async () => {
    await expect(connect("r-bad", "nope")).rejects.toThrow(/401/);
  });

  it("refuses robots entirely while ROBOT_MODE=simulation", async () => {
    (env as any).ROBOT_MODE = "simulation";
    try {
      await expect(connect("r-sim")).rejects.toThrow(/409/);
    } finally {
      (env as any).ROBOT_MODE = "hardware";
    }
  });

  it("pushes a command the instant it is enqueued (no polling)", async () => {
    const ws = await connect("r-push");
    const got = nextJson(ws, "cmd");
    pendingCommandQueue.enqueue("r-push", "cmd-1", "WALK_FORWARD", { durationMs: 500 });
    const msg = await got;
    expect(msg).toMatchObject({ t: "cmd", id: "cmd-1", type: "WALK_FORWARD", params: { durationMs: 500 } });
    expect(pendingCommandQueue.pendingCount("r-push")).toBe(0); // delivered, not left queued
    ws.close();
  });

  it("keeps commands queued while offline and flushes them on connect", async () => {
    pendingCommandQueue.enqueue("r-late", "cmd-2", "EYE_CENTER", {});
    expect(pendingCommandQueue.pendingCount("r-late")).toBe(1);
    const ws = await connect("r-late");
    const msg = await nextJson(ws, "cmd");
    expect(msg.id).toBe("cmd-2");
    ws.close();
  });

  it("streams speech as raw PCM16 binary chunks between speech and speech_end", async () => {
    const ws = await connect("r-speech");
    const pcm = Buffer.alloc(10_000, 7);
    setPendingSpeech("r-speech", { audioBase64: pcm.toString("base64"), mimeType: "audio/pcm", format: "pcm16", sampleRateHz: 16000 });
    const header = await nextJson(ws, "speech");
    expect(header).toMatchObject({ format: "pcm16", sampleRateHz: 16000, bytes: 10_000 });
    // everything still buffered up to speech_end, in arrival order
    const inbox = inboxes.get(ws)!;
    const received: Buffer[] = [];
    const deadline = Date.now() + 3000;
    let ended = false;
    while (!ended && Date.now() < deadline) {
      while (inbox.length && !ended) {
        const m = inbox.shift()!;
        if (m.isBinary) received.push(m.data);
        else if (JSON.parse(m.data.toString()).t === "speech_end") ended = true;
      }
      if (!ended) await new Promise((r) => setTimeout(r, 10));
    }
    expect(ended).toBe(true);
    expect(Buffer.concat(received).equals(pcm)).toBe(true);
    expect(received.every((c) => c.length <= 4096)).toBe(true);
    ws.close();
  });

  it("processes a binary JPEG frame and answers with the brain result + next cadence", async () => {
    const ws = await connect("r-frame");
    const reply = nextJson(ws, "brain");
    ws.send(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { binary: true });
    const msg = await reply;
    expect(msg).toMatchObject({ t: "brain", discarded: false, motion: true });
    expect(typeof msg.intervalMs).toBe("number");
    ws.close();
  });

  it("ingests heartbeats sent over the link and acks them", async () => {
    const ws = await connect("r-hb");
    const ack = nextJson(ws, "hb_ack");
    ws.send(JSON.stringify({ t: "hb", mockMode: false, wifiRssi: -50 }));
    await ack;
    expect(ingestHeartbeat).toHaveBeenCalledWith(expect.objectContaining({ wifiRssi: -50, robotId: "r-hb" }), expect.anything());
    ws.close();
  });

  it("sends a 1 Hz brain tick so the robot always hears from the server", async () => {
    const ws = await connect("r-tick");
    const tick = await nextJson(ws, "tick");
    expect(tick.intervalMs).toBeGreaterThan(0);
    ws.close();
  });
});
