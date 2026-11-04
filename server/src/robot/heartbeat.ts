import { robotConnection } from "./RobotConnection";
import { robotRepository } from "../repositories/robot.repository";
import { ultrasonicController } from "../ultrasonic/UltrasonicController";
import { telemetryService } from "../telemetry/TelemetryService";

/**
 * Shared heartbeat ingestion — used by BOTH the HTTP POST /api/heartbeat
 * route and the persistent WebSocket link (robot/RobotLink.ts), so the two
 * transports can never drift apart.
 */
export function ingestHeartbeat(body: any, ipAddress: string | null): void {
  robotConnection.markHeartbeat(!!body?.mockMode);

  // The robot's very first heartbeat is what brings it into existence in the
  // database. Never block the ack on this — a DB hiccup must not make the
  // robot think it's offline.
  const robotCode = typeof body?.robotCode === "string" ? body.robotCode : typeof body?.robotId === "string" ? body.robotId : "vision-001";
  robotRepository
    .upsertHeartbeat(robotCode, {
      firmwareVersion: body?.firmwareVersion ?? null,
      hardwareVersion: body?.hardwareVersion ?? null,
      ipAddress,
    })
    .catch(() => {});

  if (typeof body?.ultrasonicRawDistanceMm === "number") {
    ultrasonicController.ingest(body.ultrasonicRawDistanceMm);
  }

  telemetryService.record(body);
}
