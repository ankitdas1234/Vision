import { EventEmitter } from "node:events";
import type { PipelineResult } from "./pipeline";

export interface SimulationProgram extends PipelineResult {
  /** Increases on every push, so a viewer can tell a re-send of the same script from no change. */
  seq: number;
  sourceName: string;
  /** The script text the dashboard sent (shown as "Script Code" in the Compiler view). */
  source: string;
  /** True when the sender pressed Run (play it now) rather than just Compile (load it, wait for Play). */
  autoplay: boolean;
  updatedAt: string;
}

/**
 * The last script the dashboard's Compiler page sent, with what every compiler stage produced, for
 * the simulator's Compiler view to draw and play. Written only through POST /api/simulation/program,
 * which compiles the source on the server (the simulator never accepts hand-made IR). A script that
 * fails to compile is kept too, so the view can show which stage stopped it. In memory, simulation-only,
 * never executed here — playback happens in the browser on the simulator's own virtual body.
 */
class SimulationProgramService extends EventEmitter {
  private current: SimulationProgram | null = null;
  private seq = 0;

  get(): SimulationProgram | null {
    return this.current;
  }

  set(sourceName: string, source: string, pipeline: PipelineResult, autoplay = false): SimulationProgram {
    this.current = { ...pipeline, seq: ++this.seq, sourceName, source, autoplay: autoplay && pipeline.ok, updatedAt: new Date().toISOString() };
    this.emit("program", this.current);
    return this.current;
  }

  /** Test helper. */
  reset() {
    this.current = null;
    this.seq = 0;
  }
}

export const simulationProgram = new SimulationProgramService();
