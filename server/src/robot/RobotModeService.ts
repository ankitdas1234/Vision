import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env";
import { logger } from "../logging/Logger";
import { simulatedRobot } from "./SimulatedRobot";

export type RobotMode = "simulation" | "hardware";
export const isRobotMode = (v: unknown): v is RobotMode => v === "simulation" || v === "hardware";

/**
 * Which end of the command pipeline the brain and compiler are wired to, chosen from the DASHBOARD (Robot page).
 *
 * - The ROBOT_MODE environment value is now only the first value, used when nothing has been chosen yet.
 * - A choice made on the dashboard is remembered in a small file (data/robot-mode.json) and wins on the next start.
 *   On a host with a temporary disk (for example Render's free plan) that file is lost on redeploy, and the server
 *   falls back to ROBOT_MODE / "simulation".
 * - Switching only starts or stops the in-process virtual robot and flips the mode every other part of the server already reads.
 *   It does not touch the real-robot link code: in hardware mode that code behaves exactly as before.
 */
class RobotModeService {
  /** Read each time so tests (and hosts) can point it somewhere else with ROBOT_MODE_FILE. */
  private get file() { return process.env.ROBOT_MODE_FILE ?? path.join(process.cwd(), "data", "robot-mode.json"); }

  /** Called once at start-up: apply a remembered choice (if any) on top of the environment default. */
  load(): RobotMode {
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, "utf8")) as { mode?: unknown };
      if (isRobotMode(saved.mode)) this.apply(saved.mode);
    } catch { /* nothing saved yet */ }
    return this.get();
  }

  get(): RobotMode { return env.ROBOT_MODE; }

  /** Switch mode now. Returns the mode that is active afterwards. */
  set(next: RobotMode): RobotMode {
    if (next === env.ROBOT_MODE) return next;
    this.apply(next);
    this.save(next);
    logger.info("Robot mode changed from the dashboard", { robotMode: next });
    return next;
  }

  private apply(mode: RobotMode) {
    (env as { ROBOT_MODE: RobotMode }).ROBOT_MODE = mode;
    (env as { MOCK_MODE: boolean }).MOCK_MODE = mode === "simulation";
    if (mode === "simulation") simulatedRobot.start();
    else simulatedRobot.stop();
  }

  private save(mode: RobotMode) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify({ mode, savedAt: new Date().toISOString() }));
    } catch (err) { logger.warn("Could not remember the robot mode", { err: String(err) }); }
  }
}

export const robotModeService = new RobotModeService();
