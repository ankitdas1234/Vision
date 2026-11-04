import { env } from "../config/env";
import { ROBOT_HARDWARE } from "../config/robot";
import { servoManager } from "../servos/ServoManager";
import { HEAD_CHANNEL, LEG_CHANNELS } from "../servos/ServoConfiguration";
import { ultrasonicService } from "../ultrasonic/UltrasonicService";
import { robotConnection } from "./RobotConnection";
import { robotLink } from "./RobotLink";
import { simulatedRobot } from "./SimulatedRobot";

/** A heartbeat older than this means the robot is gone (same threshold RobotConnection uses). */
const HEARTBEAT_FRESH_MS = 15_000;

export type Transport = "simulator" | "websocket" | "http" | "none";

type Leg = { direction: "FORWARD" | "REVERSE" | "STOP"; speed: number };

export interface RobotLinkStatus {
  /** ROBOT_MODE — which end of the command pipeline the brain and compiler are wired to. */
  mode: "simulation" | "hardware";
  /** How commands/frames actually travel right now. */
  transport: Transport;
  /** Is a robot (real or virtual) reachable by any transport? */
  connected: boolean;
  /** One plain-English sentence for the dashboard. */
  summary: string;
  lastHeartbeatAgoMs: number | null;
  /** The persistent ESP32 WebSocket, if it is up (always null in simulation). */
  websocket: { connectedForMs: number; lastMessageAgoMs: number; droppedFrames: number } | null;
  /** What the body is doing. `simulator` = the virtual robot's real state; `server-model` =
   * what the server last COMMANDED (the firmware doesn't report servo positions back). */
  body: {
    source: "simulator" | "server-model";
    headAngle: number;
    headPhysicalAngle: number | null;
    leftLeg: Leg;
    rightLeg: Leg;
    ultrasonicMm: number | null;
    emergencyStopped: boolean | null;
  } | null;
}

export function getRobotLinkStatus(): RobotLinkStatus {
  const lastHeartbeatAgoMs = robotConnection.lastHeartbeatAgoMs();

  if (env.ROBOT_MODE === "simulation") {
    const running = simulatedRobot.isRunning();
    const s = simulatedRobot.snapshot();
    return {
      mode: "simulation",
      transport: running ? "simulator" : "none",
      connected: running,
      summary: running ? "Virtual robot running inside the server — no ESP32 needed." : "The virtual robot is not running.",
      lastHeartbeatAgoMs,
      websocket: null,
      body: running
        ? { source: "simulator", headAngle: s.headAngle, headPhysicalAngle: s.headPhysicalAngle, leftLeg: s.leftLeg, rightLeg: s.rightLeg, ultrasonicMm: s.ultrasonicMm, emergencyStopped: s.emergencyStopped }
        : null,
    };
  }

  const websocket = robotLink.info(ROBOT_HARDWARE.robotCode);
  const heartbeatFresh = lastHeartbeatAgoMs !== null && lastHeartbeatAgoMs < HEARTBEAT_FRESH_MS;
  const transport: Transport = websocket ? "websocket" : heartbeatFresh ? "http" : "none";

  const snap = servoManager.snapshot();
  const head = snap.positional.find((p) => p.channel === HEAD_CHANNEL);
  const leg = (ch: number): Leg => {
    const c = snap.continuous.find((x) => x.channel === ch) as { direction?: Leg["direction"]; speed?: number } | undefined;
    return { direction: c?.direction ?? "STOP", speed: c?.speed ?? 0 };
  };
  const lastReading = ultrasonicService.getLast(); // NOT read(): that fabricates a fake reading when there is none

  return {
    mode: "hardware",
    transport,
    connected: transport !== "none",
    summary:
      transport === "websocket" ? "ESP32 connected over the live WebSocket link."
      : transport === "http" ? "ESP32 reachable only by HTTP polling — the WebSocket link is down, so commands are slower."
      : "No ESP32 connected — no heartbeat in the last 15 seconds.",
    lastHeartbeatAgoMs,
    websocket,
    // Nothing reachable: don't show head/leg values as if a robot were acting on them.
    body: transport === "none" ? null : {
      source: "server-model",
      headAngle: head?.angle ?? 90,
      headPhysicalAngle: null,
      leftLeg: leg(LEG_CHANNELS.left),
      rightLeg: leg(LEG_CHANNELS.right),
      ultrasonicMm: lastReading ? Math.round(lastReading.filteredDistanceMm) : null,
      emergencyStopped: null,
    },
  };
}
