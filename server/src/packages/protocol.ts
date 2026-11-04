// ============================================================
// VISION PROTOCOL — wire format between Render server <-> ESP32-CAM
// Transport: HTTPS (request/response) + WebSocket (push).
// ============================================================
import type { CommandType, CommandResult, TelemetrySnapshot } from "./types";

export interface RobotHeartbeat {
  robotId: string;
  firmwareVersion: string;
  uptimeSeconds: number;
  wifiRssi: number;
  freeHeap: number;
  cameraStatus: "OK" | "ERROR" | "UNKNOWN";
  pca9685Status: "OK" | "ERROR" | "UNKNOWN";
  servoStatus: Record<number, "OK" | "ERROR">;
  trackingState: string;
  gaitState: string;
  mockMode: boolean;
}

/** Server -> ESP32-CAM. A single physical command dispatched over HTTPS/WS. */
export interface RobotCommandEnvelope {
  commandId: string;
  type: CommandType;
  params: Record<string, unknown>;
  issuedAt: string;
  timeoutMs: number;
}

/** ESP32-CAM -> Server acknowledgement/result for a dispatched command. */
export interface RobotCommandAck {
  commandId: string;
  received: boolean;
  result?: CommandResult;
}

export interface CameraUploadMeta {
  robotId: string;
  capturedAt: string;
  width: number;
  height: number;
  checksum: string;
}

export function isTelemetrySnapshot(x: unknown): x is TelemetrySnapshot {
  return !!x && typeof x === "object" && "robotId" in (x as object);
}
