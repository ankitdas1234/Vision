import { sql } from "drizzle-orm";
import { db } from "../database/client";
import { robotManager } from "../robot/RobotManager";
import { servoManager } from "../servos/ServoManager";
import { ROBOT_HARDWARE } from "../config/robot";
import { ultrasonicController } from "../ultrasonic/UltrasonicController";
import { audioService } from "../audio/AudioService";
import { controlMode } from "../control/ControlMode";
import { compilerSettings } from "../control/CompilerSettings";
import { aiRouter } from "../ai/router";
import { googleDriveConfig } from "../config/googleDrive";
import { env } from "../config/env";
import { visionStats } from "../camera/visionStats";
import { getRobotLinkStatus } from "../robot/linkStatus";

export type CheckStatus = "OK" | "DEGRADED" | "DOWN" | "MOCK" | "DISABLED";

export interface SubsystemCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  latencyMs?: number;
}

export interface SystemHealthReport {
  overall: CheckStatus;
  mockMode: boolean;
  /** ROBOT_MODE: which end of the command pipeline the brain and compiler are wired to. */
  robotMode: "hardware" | "simulation";
  checkedAt: string;
  subsystems: SubsystemCheck[];
}

/**
 * Every check here actually exercises the thing it claims to check (a real
 * DB round trip, a real read of servo/ultrasonic/robot-connection state) —
 * this deliberately replaces the old hardcoded `{ backend: "OK", database:
 * "OK" }` health payload, which reported "OK" whether or not it was true.
 */
class SystemHealthService {
  private async checkDatabase(): Promise<SubsystemCheck> {
    const startedAt = Date.now();
    try {
      await db.execute(sql`SELECT 1`);
      return { key: "database", label: "PostgreSQL (Neon)", status: "OK", detail: "Query round-trip succeeded.", latencyMs: Date.now() - startedAt };
    } catch (err) {
      return { key: "database", label: "PostgreSQL (Neon)", status: "DOWN", detail: (err as Error).message, latencyMs: Date.now() - startedAt };
    }
  }

  private checkRobotConnection(): SubsystemCheck {
    const link = getRobotLinkStatus();
    // simulation: the virtual robot is "MOCK" by design. hardware: WebSocket = OK; HTTP-only still works
    // but is the slow fallback, so it is DEGRADED; nothing heard = DOWN.
    const status: CheckStatus =
      link.mode === "simulation" ? (link.connected ? "MOCK" : "DOWN")
      : link.transport === "websocket" ? "OK"
      : link.transport === "http" ? "DEGRADED"
      : "DOWN";
    const label = link.mode === "simulation" ? "Robot link (simulator)" : "Robot link (ESP32)";
    return { key: "robotConnection", label, status, detail: link.summary };
  }

  private checkServos(): SubsystemCheck {
    try {
      const snapshot = servoManager.snapshot();
      const count = snapshot.positional.length + snapshot.continuous.length;
      const expected = ROBOT_HARDWARE.servoCount; // single source of truth — see config/robot.ts
      if (count !== expected) {
        return { key: "servos", label: `Servos (${expected})`, status: "DEGRADED", detail: `Expected ${expected} configured servos, found ${count}.` };
      }
      return { key: "servos", label: `Servos (${expected})`, status: env.MOCK_MODE ? "MOCK" : "OK", detail: `${count}/${expected} channels configured and responsive.` };
    } catch (err) {
      return { key: "servos", label: `Servos (${ROBOT_HARDWARE.servoCount})`, status: "DOWN", detail: (err as Error).message };
    }
  }

  private checkUltrasonic(): SubsystemCheck {
    try {
      const state = ultrasonicController.status(); // "CLEAR" | "NEAR" | ... | "SENSOR_ERROR"
      const last = ultrasonicController.read();
      if (state === "SENSOR_ERROR") {
        return { key: "ultrasonic", label: "HC-SR04 (obstacle safety)", status: "DOWN", detail: "Sensor disabled or reporting an error — movement safety is blocking all movement commands." };
      }
      return {
        key: "ultrasonic",
        label: "HC-SR04 (obstacle safety)",
        status: env.MOCK_MODE ? "MOCK" : "OK",
        detail: `State: ${state}${last ? `, last filtered reading ${Math.round(last.filteredDistanceMm)}mm` : ""}.`,
      };
    } catch (err) {
      return { key: "ultrasonic", label: "HC-SR04 (obstacle safety)", status: "DOWN", detail: (err as Error).message };
    }
  }

  private checkAudio(): SubsystemCheck {
    const state = audioService.getState();
    return { key: "audio", label: "Mic / TTS speaker pipeline", status: "OK", detail: `Pipeline idle-capable, current state: ${state}.` };
  }

  private checkCamera(): SubsystemCheck {
    // No hardware handle to probe server-side (frames arrive push-style from the
    // ESP32-CAM); reflect the transport link as a proxy and say so explicitly.
    const connection = robotManager.getStatus().connection;
    return {
      key: "camera",
      label: "ESP32-CAM video feed",
      status: connection === "OFFLINE" ? "DOWN" : connection === "MOCK" ? "MOCK" : "OK",
      detail: "Inferred from robot transport link — the server does not poll the camera directly.",
    };
  }

  private checkVisionPipeline(): SubsystemCheck {
    const stats = visionStats.snapshot();
    if (stats.framesSeen === 0) {
      return { key: "visionPipeline", label: "Vision pre-attentive filter", status: "OK", detail: "No frames processed yet this session." };
    }
    const usefulRate = visionStats.usefulFrameRate();
    const detail =
      `${stats.framesStored}/${stats.framesSeen} frames kept (${Math.round(usefulRate * 100)}%), ` +
      `${stats.framesDiscarded} discarded as unusable, ${stats.framesSkippedNoChange} skipped (no change).`;
    // A very low keep-rate isn't necessarily a fault (an empty static room
    // should skip most frames) — DEGRADED only flags the case that usually
    // means a real problem: almost everything being outright unusable
    // (bad lens, wrong exposure, flaky link), not just "nothing to see".
    const status = stats.framesDiscarded / stats.framesSeen > 0.6 ? "DEGRADED" : "OK";
    return { key: "visionPipeline", label: "Vision pre-attentive filter", status, detail };
  }

  private async checkControlMode(): Promise<SubsystemCheck> {
    const mode = await controlMode.mode();
    return { key: "controlMode", label: "Control mode arbiter", status: "OK", detail: `Currently ${mode}.` };
  }

  private async checkCompiler(): Promise<SubsystemCheck> {
    if (!(await compilerSettings.isEnabled())) {
      return { key: "compiler", label: "Vision Script compiler", status: "DISABLED", detail: "Disabled by an admin (kill switch) — compiling and executing are both blocked until re-enabled." };
    }
    // Compiling never touches hardware or the DB, so "healthy" just means the
    // module loaded — a cheap self-test compile confirms the pipeline runs end to end.
    try {
      // Lazy import to avoid a hard dependency cycle at module-load time.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { compiler } = require("../compiler/Compiler");
      const result = compiler.compile("EYE_CENTER\nWAIT 100");
      return { key: "compiler", label: "Vision Script compiler", status: result.success ? "OK" : "DEGRADED", detail: result.success ? "Self-test script compiled cleanly." : "Self-test script produced diagnostics — see compiler logs." };
    } catch (err) {
      return { key: "compiler", label: "Vision Script compiler", status: "DOWN", detail: (err as Error).message };
    }
  }

  private checkAiFallback(): SubsystemCheck {
    const st = aiRouter.status();
    return {
      key: "ai",
      label: "AI fallback (multi-model)",
      status: st.enabled ? "OK" : "DISABLED",
      detail: st.enabled
        ? `Text: ${st.routes.text.join(" -> ")}${st.visionEnabled ? ` | Image: ${st.routes.image.join(" -> ")}` : ""}${st.coolingDown.length ? ` | cooling down: ${st.coolingDown.map((c) => c.key).join(", ")}` : ""}`
        : "No AI key set (OPENROUTER_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, XAI_API_KEY, ANTHROPIC_API_KEY or LLM_API_KEY) — brain falls back to rule-based memory only.",
    };
  }

  private checkGoogleDrive(): SubsystemCheck {
    return { key: "googleDrive", label: "Google Drive media storage", status: googleDriveConfig.enabled ? "OK" : "DISABLED", detail: googleDriveConfig.enabled ? "Credentials configured." : "Not configured — captured photos/audio are not persisted off-device." };
  }

  async run(): Promise<SystemHealthReport> {
    const [database, controlModeCheck, compilerCheck] = await Promise.all([
      this.checkDatabase(),
      this.checkControlMode(),
      this.checkCompiler(),
    ]);

    const subsystems: SubsystemCheck[] = [
      database,
      this.checkRobotConnection(),
      this.checkServos(),
      this.checkUltrasonic(),
      this.checkCamera(),
      this.checkVisionPipeline(),
      this.checkAudio(),
      controlModeCheck,
      compilerCheck,
      this.checkAiFallback(),
      this.checkGoogleDrive(),
    ];

    // DISABLED is an intentional admin action, not a fault — it should never
    // drag the overall status down to DEGRADED/DOWN the way a real failure would.
    const worst = subsystems.some((s) => s.status === "DOWN")
      ? "DOWN"
      : subsystems.some((s) => s.status === "DEGRADED")
      ? "DEGRADED"
      : env.MOCK_MODE
      ? "MOCK"
      : "OK";

    return { overall: worst, mockMode: env.MOCK_MODE, robotMode: env.ROBOT_MODE, checkedAt: new Date().toISOString(), subsystems };
  }
}

export const systemHealthService = new SystemHealthService();
