import { EventEmitter } from "node:events";

export const SIM_MODES = ["compiler", "autonomous"] as const;
export type SimMode = (typeof SIM_MODES)[number];

export const isSimMode = (v: unknown): v is SimMode => typeof v === "string" && (SIM_MODES as readonly string[]).includes(v);

/**
 * Which experience the SIMULATOR shows: the Compiler view (Vision Script -> IR -> 3D playback)
 * or the Autonomous view (the robot's simulated mind).
 *
 * This is a UI choice for the simulator and the dashboard's Simulation page — nothing more.
 * It is deliberately NOT ControlMode (that arbitrates who may move the real robot), it is not
 * stored in the database, and nothing in the command pipeline reads it. It lives in memory and
 * resets to "compiler" on restart. Routes that expose it are simulation-only (409 in hardware).
 */
class SimulationModeService extends EventEmitter {
  private current: SimMode = "compiler";

  get(): SimMode {
    return this.current;
  }

  set(next: SimMode): SimMode {
    if (next !== this.current) {
      this.current = next;
      this.emit("mode", { mode: next });
    }
    return this.current;
  }

  /** Test helper. */
  reset() {
    this.current = "compiler";
  }
}

export const simulationMode = new SimulationModeService();
