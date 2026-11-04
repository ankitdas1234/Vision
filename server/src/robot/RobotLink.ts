import type { Server as HTTPServer, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { env } from "../config/env";
import { logger } from "../logging/Logger";
import { pendingCommandQueue } from "../commands/PendingCommandQueue";
import { takePendingSpeech, speechEvents } from "../audio/PendingSpeechCache";
import { cameraService } from "../camera/CameraService";
import { getAttentionControllerFor } from "../attention/AttentionController";
import { ingestHeartbeat } from "./heartbeat";

/**
 * ROBOT LINK — one persistent, bidirectional WebSocket between the server
 * brain and each ESP32 (path: /api/robot-ws).
 *
 * Why this exists: the HTTP-only design made the firmware open a fresh TLS
 * connection (~0.5–1.5 s on an ESP32) for every poll, upload and heartbeat,
 * and the brain could only ever *wait to be asked*. With this link:
 *
 *   server -> robot  (pushed the instant something happens, no polling)
 *     {"t":"cmd","id","type","params"}            a command to run now
 *     {"t":"speech","format","sampleRateHz","bytes"} + binary PCM16 chunks
 *     {"t":"tick","ts","intervalMs","force"}      1 Hz brain heartbeat: current
 *                                                 capture cadence + "capture now"
 *     {"t":"brain",...}                           result of every processed frame
 *     {"t":"pong"}
 *
 *   robot -> server
 *     binary frame            raw JPEG (no base64, no JSON wrapper, ~25% smaller)
 *     {"t":"hb", ...}         heartbeat/telemetry (same body as POST /api/heartbeat)
 *     {"t":"ack","id"}        command received
 *     {"t":"ping"}
 *
 * The HTTP endpoints all still exist: the firmware falls back to them while
 * this link is down, and nothing queued is lost (commands stay in
 * PendingCommandQueue until a transport delivers them).
 */

const WS_PATH = "/api/robot-ws";
const TICK_INTERVAL_MS = 1000;
const PING_INTERVAL_MS = 10_000;
const SPEECH_CHUNK_BYTES = 4096;
const MAX_FRAME_BYTES = 4 * 1024 * 1024;

interface Client {
  ws: WebSocket;
  robotId: string;
  connectedAt: number;
  lastMessageAt: number;
  alive: boolean;
  processingFrame: boolean;
  droppedFrames: number;
}

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export class RobotLink {
  private wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES, perMessageDeflate: false });
  private clients = new Map<string, Client>();
  private tickTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;

  isConnected(robotId: string): boolean {
    return this.clients.get(robotId)?.ws.readyState === WebSocket.OPEN;
  }

  /** What the dashboard shows about the live link (null = no WebSocket for this robot). */
  info(robotId: string): { connectedForMs: number; lastMessageAgoMs: number; droppedFrames: number } | null {
    const c = this.clients.get(robotId);
    if (!c || c.ws.readyState !== WebSocket.OPEN) return null;
    const now = Date.now();
    return { connectedForMs: now - c.connectedAt, lastMessageAgoMs: now - c.lastMessageAt, droppedFrames: c.droppedFrames };
  }

  attach(httpServer: HTTPServer) {
    httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== WS_PATH) return; // Socket.IO (dashboard) handles its own upgrades

      // ROBOT_MODE=simulation: the brain is wired to the virtual robot, so a
      // real board must not be able to attach to the same command stream.
      if (env.ROBOT_MODE === "simulation") {
        socket.write("HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\nServer is in ROBOT_MODE=simulation\r\n");
        socket.destroy();
        return;
      }

      // Header first (never lands in access logs); query param is a fallback
      // for WebSocket client libraries that can't set headers.
      const header = req.headers["x-robot-secret"];
      const secret = typeof header === "string" ? header : url.searchParams.get("secret") ?? "";
      if (!secretsMatch(secret, env.ROBOT_AUTH_SECRET)) {
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }

      const robotId = url.searchParams.get("robotId") || "vision-001";
      this.wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws, robotId, req));
    });

    // Event-driven push: no polling anywhere on the server side.
    pendingCommandQueue.events.on("enqueue", (robotId: string) => this.flushCommands(robotId));
    speechEvents.on("speech", (robotId: string) => this.flushSpeech(robotId));

    this.tickTimer = setInterval(() => this.tickAll(), TICK_INTERVAL_MS);
    this.pingTimer = setInterval(() => this.pingAll(), PING_INTERVAL_MS);
    this.tickTimer.unref();
    this.pingTimer.unref();
  }

  shutdown() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    for (const c of this.clients.values()) c.ws.close();
    this.wss.close();
  }

  // ---------------------------------------------------------------- outbound

  private sendJson(client: Client, msg: Record<string, unknown>): boolean {
    if (client.ws.readyState !== WebSocket.OPEN) return false;
    client.ws.send(JSON.stringify(msg));
    return true;
  }

  /** Sends every queued command for a robot, in order, if its link is up.
   * If the link is down they simply stay queued for the HTTP fallback. */
  flushCommands(robotId: string) {
    const client = this.clients.get(robotId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;
    for (const cmd of pendingCommandQueue.drain(robotId)) {
      this.sendJson(client, { t: "cmd", id: cmd.commandId, type: cmd.type, params: cmd.params });
    }
    // An AUDIO_SPEAK command's audio is cached just before it is queued.
    this.flushSpeech(robotId);
  }

  /** Streams cached speech/music as raw PCM16 binary chunks (no base64, no
   * giant single message — the ESP32 can play each chunk as it arrives). */
  flushSpeech(robotId: string) {
    const client = this.clients.get(robotId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;
    const speech = takePendingSpeech(robotId);
    if (!speech) return;
    if (speech.format !== "pcm16") {
      logger.warn("Speech not streamed over robot link: not pcm16 (server-side transcode must have failed)", { robotId, format: speech.format });
      return;
    }
    const pcm = Buffer.from(speech.audioBase64, "base64");
    this.sendJson(client, { t: "speech", format: "pcm16", sampleRateHz: speech.sampleRateHz, bytes: pcm.length });
    for (let off = 0; off < pcm.length; off += SPEECH_CHUNK_BYTES) {
      client.ws.send(pcm.subarray(off, off + SPEECH_CHUNK_BYTES), { binary: true });
    }
    this.sendJson(client, { t: "speech_end" });
  }

  private tickAll() {
    for (const client of this.clients.values()) {
      const controller = getAttentionControllerFor(client.robotId);
      this.sendJson(client, {
        t: "tick",
        ts: Date.now(),
        intervalMs: controller.snapshot().recommendedIntervalMs,
        force: controller.consumeForceCaptureRequest(),
      });
    }
  }

  private pingAll() {
    for (const client of this.clients.values()) {
      if (!client.alive) {
        logger.warn("Robot link missed a ping — dropping dead connection", { robotId: client.robotId });
        client.ws.terminate();
        continue;
      }
      client.alive = false;
      client.ws.ping();
    }
  }

  // ----------------------------------------------------------------- inbound

  private onConnection(ws: WebSocket, robotId: string, req: IncomingMessage) {
    // A reconnect replaces the stale socket instead of leaking it.
    this.clients.get(robotId)?.ws.terminate();

    const now = Date.now();
    const client: Client = { ws, robotId, connectedAt: now, lastMessageAt: now, alive: true, processingFrame: false, droppedFrames: 0 };
    this.clients.set(robotId, client);
    logger.info("Robot link connected", { robotId, ip: req.socket.remoteAddress });

    ws.on("pong", () => { client.alive = true; });
    ws.on("message", (data: RawData, isBinary: boolean) => {
      client.alive = true;
      client.lastMessageAt = Date.now();
      if (isBinary) void this.onFrame(client, toBuffer(data));
      else this.onText(client, toBuffer(data).toString("utf8"), req);
    });
    ws.on("close", () => {
      if (this.clients.get(robotId) === client) this.clients.delete(robotId);
      logger.info("Robot link closed", { robotId });
    });
    ws.on("error", (err) => logger.warn("Robot link error", { robotId, error: err.message }));

    // Anything queued while the robot was offline goes out immediately.
    this.flushCommands(robotId);
  }

  private onText(client: Client, text: string, req: IncomingMessage) {
    let msg: any;
    try { msg = JSON.parse(text); } catch { return; }

    switch (msg?.t) {
      case "hb":
        ingestHeartbeat({ ...msg, robotId: msg.robotId ?? client.robotId }, req.socket.remoteAddress ?? null);
        this.sendJson(client, { t: "hb_ack", ts: Date.now() });
        break;
      case "ping":
        this.sendJson(client, { t: "pong", ts: Date.now() });
        break;
      case "ack":
        logger.debug("Robot acked command", { robotId: client.robotId, id: msg.id });
        break;
    }
  }

  /** One frame at a time per robot: if the brain is still busy with the
   * previous frame, the new one is dropped (stale by the time it'd run
   * anyway) and the robot is told to ease off instead of building a backlog. */
  private async onFrame(client: Client, jpeg: Buffer) {
    if (client.processingFrame) {
      client.droppedFrames++;
      this.sendJson(client, { t: "brain", busy: true, dropped: client.droppedFrames });
      return;
    }
    client.processingFrame = true;
    const started = Date.now();
    try {
      const result = await cameraService.capture(jpeg, client.robotId);
      const controller = getAttentionControllerFor(client.robotId);
      this.sendJson(client, {
        t: "brain",
        discarded: result.discarded,
        discardReason: result.discardReason,
        motion: result.motion?.present ?? false,
        intervalMs: controller.snapshot().recommendedIntervalMs,
        processMs: Date.now() - started,
      });
    } catch (err) {
      logger.warn("Frame processing failed on robot link", { robotId: client.robotId, error: (err as Error).message });
      this.sendJson(client, { t: "brain", error: true });
    } finally {
      client.processingFrame = false;
    }
  }
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data as ArrayBuffer);
}

export const robotLink = new RobotLink();
