import { EventEmitter } from "node:events";
import { readdirSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { env } from "../config/env";
import { logger } from "../logging/Logger";
import { pendingCommandQueue } from "../commands/PendingCommandQueue";
import { takePendingSpeech, speechEvents } from "../audio/PendingSpeechCache";
import { cameraService } from "../camera/CameraService";
import { getAttentionControllerFor } from "../attention/AttentionController";
import { ingestHeartbeat } from "./heartbeat";
import { HEAD_MAX_DEG_PER_SEC } from "../servos/ServoConfiguration";
import { ultrasonicController } from "../ultrasonic/UltrasonicController";
import type { CommandType } from "../packages/types";

/**
 * SIMULATED ROBOT — a virtual ESP32 for ROBOT_MODE=simulation.
 *
 * It sits at the exact same point in the pipeline as the real robot link
 * (robot/RobotLink.ts): it consumes commands from PendingCommandQueue, plays
 * speech, sends heartbeats + ultrasonic readings, and feeds camera frames to
 * the brain. Everything upstream — BrainOrchestrator, the Vision Script
 * compiler, the dashboard, the REST API — goes through CommandRegistry and
 * can't tell whether the thing at the end is this or a real board. That is
 * the whole point of the ROBOT_MODE switch: same brain, same compiler, same
 * safety checks, different end of the wire.
 *
 * Simulated camera: if SIM_FRAMES_DIR points at a folder of .jpg/.png
 * images, they are cycled through at the brain's recommended capture
 * cadence (so you can drop in photos of a person and watch the brain react).
 * With no folder it sends no frames.
 *
 * Physics + visual front end: the simulator also integrates a simple body
 * model (two continuous leg servos -> forward speed + turn rate; the head
 * servo eases toward its target like the firmware) and emits "state" /
 * "speech" events. routes/simulation.routes.ts streams them to the 3D client
 * in /simulation, which is a pure renderer of this state.
 *
 * Pose convention (the 3D client uses the same one):
 *   headingDeg  0 = facing +z, increases when turning RIGHT (clockwise from above)
 *   forward vector = (-sin(heading), +cos(heading)) in (x, z), x/z in metres
 */

const HEARTBEAT_MS = 1000;
const PHYSICS_MS = 50;
const IDLE_STATE_EMIT_MS = 500;
/** Walking speed at 100% on both legs, metres/second (a small desktop robot). */
export const MAX_SPEED_MPS = 0.15;
/** Turn rate with the legs at 100% in opposite directions, degrees/second. */
export const MAX_TURN_DEG_PER_S = 90;
export { HEAD_MAX_DEG_PER_SEC };
const CLEAR_DISTANCE_MM = 2000; // "nothing in front" — well above the 600 mm safe threshold

export interface SimulatedRobotState {
  /** Commanded head target, 0-180 (90 = straight ahead). */
  headAngle: number;
  /** Where the head physically is right now (eased toward headAngle). */
  headPhysicalAngle: number;
  /** Body pose from integrating the leg servos. */
  pose: { x: number; z: number; headingDeg: number };
  leftLeg: { direction: "FORWARD" | "REVERSE" | "STOP"; speed: number };
  rightLeg: { direction: "FORWARD" | "REVERSE" | "STOP"; speed: number };
  ultrasonicMm: number;
  commandsReceived: number;
  lastCommand: { type: string; params: unknown; at: string } | null;
  framesSent: number;
  speechPlayed: number;
  lastSpeechSeconds: number | null;
  emergencyStopped: boolean;
}

type Leg = SimulatedRobotState["leftLeg"];
const STOPPED: Leg = { direction: "STOP", speed: 0 };

export class SimulatedRobot extends EventEmitter {
  private robotId = "vision-001";
  private running = false;
  private hbTimer: NodeJS.Timeout | null = null;
  private frameTimer: NodeJS.Timeout | null = null;
  private walkTimer: NodeJS.Timeout | null = null;
  private frames: string[] = [];
  private frameIndex = 0;
  private onEnqueue = (id: string) => { if (id === this.robotId) this.drain(); };
  private onSpeech = (id: string) => { if (id === this.robotId) this.playSpeech(); };

  private physicsTimer: NodeJS.Timeout | null = null;
  private lastPhysicsMs = 0;
  private lastEmitMs = 0;
  private dirty = true;

  state: SimulatedRobotState = {
    headAngle: 90,
    headPhysicalAngle: 90,
    pose: { x: 0, z: 0, headingDeg: 0 },
    leftLeg: { ...STOPPED },
    rightLeg: { ...STOPPED },
    ultrasonicMm: CLEAR_DISTANCE_MM,
    commandsReceived: 0,
    lastCommand: null,
    framesSent: 0,
    speechPlayed: 0,
    lastSpeechSeconds: null,
    emergencyStopped: false,
  };

  isRunning() { return this.running; }

  start(robotId = "vision-001") {
    if (this.running) return;
    this.robotId = robotId;
    this.running = true;
    this.frames = this.loadFrames();

    pendingCommandQueue.events.on("enqueue", this.onEnqueue);
    speechEvents.on("speech", this.onSpeech);

    this.hbTimer = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
    this.hbTimer.unref();
    this.lastPhysicsMs = Date.now();
    this.physicsTimer = setInterval(() => this.step(Date.now()), PHYSICS_MS);
    this.physicsTimer.unref();
    this.heartbeat();
    this.scheduleFrame(500);
    this.drain(); // anything queued before we started

    logger.info("Simulated robot started (ROBOT_MODE=simulation)", { robotId, frameImages: this.frames.length });
  }

  stop() {
    this.running = false;
    pendingCommandQueue.events.off("enqueue", this.onEnqueue);
    speechEvents.off("speech", this.onSpeech);
    if (this.hbTimer) clearInterval(this.hbTimer);
    if (this.frameTimer) clearTimeout(this.frameTimer);
    if (this.walkTimer) clearTimeout(this.walkTimer);
    if (this.physicsTimer) clearInterval(this.physicsTimer);
    this.hbTimer = this.frameTimer = this.walkTimer = this.physicsTimer = null;
  }

  /** Everything a renderer needs, in one object. */
  snapshot() {
    return {
      mode: "simulation" as const,
      headAngle: this.state.headAngle,
      headPhysicalAngle: Number(this.state.headPhysicalAngle.toFixed(2)),
      pose: { ...this.state.pose },
      leftLeg: { ...this.state.leftLeg },
      rightLeg: { ...this.state.rightLeg },
      ultrasonicMm: this.state.ultrasonicMm,
      emergencyStopped: this.state.emergencyStopped,
      lastCommand: this.state.lastCommand,
    };
  }

  /**
   * One physics step (public so tests can drive time deterministically).
   * Legs -> body motion; head eases toward its target at HEAD_MAX_DEG_PER_SEC.
   */
  step(nowMs: number) {
    const dt = Math.min(0.25, Math.max(0, (nowMs - this.lastPhysicsMs) / 1000)); // a stalled timer must not teleport the robot
    this.lastPhysicsMs = nowMs;
    if (dt === 0) return;

    // Same rule the real firmware enforces on-device: an unsafe ultrasonic
    // state stops the legs without waiting for the server (see firmware main.cpp).
    const legsActive = this.state.leftLeg.direction !== "STOP" || this.state.rightLeg.direction !== "STOP";
    if (legsActive && !ultrasonicController.isMovementSafe()) {
      this.setLegs("STOP", 0);
      this.autoStop();
      this.dirty = true;
    }

    const signed = (leg: Leg) => (leg.direction === "FORWARD" ? 1 : leg.direction === "REVERSE" ? -1 : 0) * (leg.speed / 100);
    const l = signed(this.state.leftLeg);
    const r = signed(this.state.rightLeg);
    const forward = (l + r) / 2;
    const turnRight = (l - r) / 2; // left leg forward + right leg back = turning right

    let moved = false;
    if (forward !== 0 || turnRight !== 0) {
      const p = this.state.pose;
      p.headingDeg = ((p.headingDeg + turnRight * MAX_TURN_DEG_PER_S * dt) % 360 + 360) % 360;
      const th = (p.headingDeg * Math.PI) / 180;
      const v = forward * MAX_SPEED_MPS * dt;
      p.x += -Math.sin(th) * v;
      p.z += Math.cos(th) * v;
      moved = true;
    }

    const diff = this.state.headAngle - this.state.headPhysicalAngle;
    if (Math.abs(diff) > 0.01) {
      const stepDeg = Math.min(Math.abs(diff), HEAD_MAX_DEG_PER_SEC * dt);
      this.state.headPhysicalAngle += Math.sign(diff) * stepDeg;
      moved = true;
    }

    if (moved) this.dirty = true;
    if (this.dirty || nowMs - this.lastEmitMs >= IDLE_STATE_EMIT_MS) this.emitState(nowMs);
  }

  private emitState(nowMs = Date.now()) {
    this.dirty = false;
    this.lastEmitMs = nowMs;
    this.emit("state", this.snapshot());
  }

  /** Lets the dashboard / tests simulate an obstacle in front of the sensor. */
  setUltrasonicMm(mm: number) {
    this.state.ultrasonicMm = Math.max(0, Math.min(4500, Math.round(mm)));
    this.dirty = true;
    this.heartbeat(); // push it to the brain right away instead of waiting up to 1 s
  }

  // ------------------------------------------------------------- commands

  /** Public so tests can step the simulator deterministically. */
  drain() {
    for (const cmd of pendingCommandQueue.drain(this.robotId)) this.apply(cmd.type, cmd.params);
    this.playSpeech();
  }

  private setLegs(dir: Leg["direction"], speed: number, which: "both" | "left" | "right" = "both", opposite = false) {
    const other: Leg["direction"] = dir === "FORWARD" ? "REVERSE" : dir === "REVERSE" ? "FORWARD" : "STOP";
    if (which !== "right") this.state.leftLeg = { direction: dir, speed };
    if (which !== "left") this.state.rightLeg = { direction: opposite ? other : dir, speed };
  }

  private autoStop(durationMs?: number) {
    if (this.walkTimer) clearTimeout(this.walkTimer);
    this.walkTimer = null;
    if (durationMs && durationMs > 0) {
      this.walkTimer = setTimeout(() => { this.setLegs("STOP", 0); }, durationMs);
      this.walkTimer.unref();
    }
  }

  private apply(type: CommandType, params: Record<string, unknown>) {
    this.state.commandsReceived++;
    this.state.lastCommand = { type, params, at: new Date().toISOString() };
    this.dirty = true;
    this.emit("command", { type, params }); // every command, individually (the 20 Hz "state" stream can coalesce quick ones)
    const num = (v: unknown, d: number) => (typeof v === "number" ? v : d);
    const clampHead = (a: number) => Math.max(0, Math.min(180, a));

    switch (type) {
      // --- head (CH0) ---
      case "EYE_CENTER": this.state.headAngle = 90; break;
      case "EYE_SET": this.state.headAngle = clampHead(num(params.angle, 90)); break;
      case "EYE_LEFT": this.state.headAngle = clampHead(this.state.headAngle - num(params.step, 10)); break;
      case "EYE_RIGHT": this.state.headAngle = clampHead(this.state.headAngle + num(params.step, 10)); break;
      case "EYE_TRACK_PERSON":
        if (typeof params.targetAngle === "number") this.state.headAngle = clampHead(params.targetAngle);
        break;

      // --- legs (CH1 left, CH2 right) ---
      case "LEFT_LEG_FORWARD": this.setLegs("FORWARD", num(params.speed, 0), "left"); break;
      case "LEFT_LEG_REVERSE": this.setLegs("REVERSE", num(params.speed, 0), "left"); break;
      case "LEFT_LEG_ROTATE": {
        const sp = num(params.speed, 0);
        this.setLegs(sp > 0 ? "FORWARD" : sp < 0 ? "REVERSE" : "STOP", Math.abs(sp), "left");
        break;
      }
      case "LEFT_LEG_STOP": this.setLegs("STOP", 0, "left"); break;
      case "RIGHT_LEG_FORWARD": this.setLegs("FORWARD", num(params.speed, 0), "right"); break;
      case "RIGHT_LEG_REVERSE": this.setLegs("REVERSE", num(params.speed, 0), "right"); break;
      case "RIGHT_LEG_ROTATE": {
        const sp = num(params.speed, 0);
        this.setLegs(sp > 0 ? "FORWARD" : sp < 0 ? "REVERSE" : "STOP", Math.abs(sp), "right");
        break;
      }
      case "RIGHT_LEG_STOP": this.setLegs("STOP", 0, "right"); break;

      // --- gaits ---
      case "WALK_FORWARD": this.setLegs("FORWARD", 60); this.autoStop(num(params.durationMs, 0)); break;
      case "WALK_BACKWARD": this.setLegs("REVERSE", 60); this.autoStop(num(params.durationMs, 0)); break;
      case "TURN_LEFT": this.setLegs("REVERSE", 60, "both", true); this.autoStop(num(params.durationMs, 0)); break;
      case "TURN_RIGHT": this.setLegs("FORWARD", 60, "both", true); this.autoStop(num(params.durationMs, 0)); break;
      case "WALK_STOP": this.setLegs("STOP", 0); this.autoStop(); break;

      // --- safety ---
      case "EMERGENCY_STOP": this.setLegs("STOP", 0); this.autoStop(); this.state.headAngle = 90; this.state.headPhysicalAngle = 90; this.state.emergencyStopped = true; break;
      case "EMERGENCY_CLEAR": this.state.emergencyStopped = false; break;
      case "SERVOS_SAFE": this.setLegs("STOP", 0); this.autoStop(); this.state.headAngle = 90; break;

      // --- voice: the 3D client speaks the text (browser speech synthesis) ---
      case "AUDIO_SPEAK":
        if (typeof params.text === "string" && params.text) this.emit("speech", { text: params.text });
        break;

      default:
        break; // other audio/ultrasonic commands have no body to move
    }
  }

  // ------------------------------------------------------------ speech

  private playSpeech() {
    const speech = takePendingSpeech(this.robotId);
    if (!speech) return;
    const bytes = Buffer.byteLength(speech.audioBase64, "base64");
    this.state.speechPlayed++;
    this.state.lastSpeechSeconds = speech.format === "pcm16" ? Number((bytes / (speech.sampleRateHz * 2)).toFixed(2)) : null;
    logger.info("Simulated robot 'played' speech", { robotId: this.robotId, format: speech.format, seconds: this.state.lastSpeechSeconds });
  }

  // --------------------------------------------------------- heartbeat

  private heartbeat() {
    ingestHeartbeat(
      { mockMode: true, robotCode: this.robotId, firmwareVersion: "simulator", ultrasonicRawDistanceMm: this.state.ultrasonicMm },
      "127.0.0.1",
    );
  }

  // ------------------------------------------------------------ camera

  private loadFrames(): string[] {
    const dir = env.SIM_FRAMES_DIR;
    if (!dir) return [];
    try {
      return readdirSync(dir)
        .filter((f) => [".jpg", ".jpeg", ".png"].includes(extname(f).toLowerCase()))
        .sort()
        .map((f) => join(dir, f));
    } catch (err) {
      logger.warn("SIM_FRAMES_DIR could not be read — simulated camera will send no frames", { dir, error: (err as Error).message });
      return [];
    }
  }

  private scheduleFrame(delayMs: number) {
    if (!this.running) return;
    this.frameTimer = setTimeout(async () => {
      let next = 2000;
      try {
        const controller = getAttentionControllerFor(this.robotId);
        next = controller.snapshot().recommendedIntervalMs;
        if (this.frames.length > 0) {
          const file = this.frames[this.frameIndex++ % this.frames.length];
          await cameraService.capture(readFileSync(file), this.robotId);
          this.state.framesSent++;
        }
      } catch (err) {
        logger.warn("Simulated camera frame failed", { error: (err as Error).message });
      }
      this.scheduleFrame(next);
    }, delayMs);
    this.frameTimer.unref();
  }
}

export const simulatedRobot = new SimulatedRobot();
