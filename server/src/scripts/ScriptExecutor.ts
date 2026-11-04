import { commandRegistry } from "../commands/CommandRegistry";
import type { IRProgram } from "../compiler/ir/IR";
import type { CommandResult } from "../packages/types";
import { logger } from "../logging/Logger";

/** Builds the command-specific params object for a single IR arg — a string
 * arg (e.g. AUDIO_SPEAK "Hello", FIND_PERSON "Sam", DANCE "energetic") maps
 * to every plausible string param name (`text`/`name`/`trackId`); a numeric
 * arg maps to every plausible numeric param name (including DANCE's
 * `durationMs`) so the same IR shape works across commands — CommandValidator's
 * per-command Zod schema strips whatever field name doesn't apply. */
export function paramsForArg(arg: number | string | undefined): Record<string, unknown> {
  if (arg === undefined) return {};
  if (typeof arg === "string") return { text: arg, name: arg, trackId: arg };
  return { angle: arg, targetAngle: arg, speed: arg, durationMs: arg, step: arg };
}

export interface ScriptExecutionStep {
  sourceLine: number;
  sourceColumn: number;
  /** For an EXEC step, the full CommandRegistry dispatch result. For a
   * LOG step (from PRINT), there's no CommandResult to report since it
   * never went through CommandRegistry at all — just the message that
   * was logged. */
  result: CommandResult | { kind: "LOG"; message: string };
}

function isSuccessful(step: ScriptExecutionStep): boolean {
  return "kind" in step.result ? true : step.result.success;
}

/** Executes compiled IR by routing every EXEC instruction through the
 * CommandRegistry — never bypassing it. LOG (from PRINT — see
 * compiler/parser/Parser.ts) is the one instruction type that
 * deliberately never touches CommandRegistry at all: it has no hardware
 * effect, it just writes to the server log, so a script author can see
 * what a script actually computed without dispatching a real robot
 * command just to produce output. */
export class ScriptExecutor {
  async execute(program: IRProgram, robotId: string, isAdmin: boolean): Promise<ScriptExecutionStep[]> {
    const results: ScriptExecutionStep[] = [];
    for (const instr of program.instructions) {
      if (instr.op === "SLEEP") {
        await new Promise((r) => setTimeout(r, instr.ms));
        continue;
      }
      if (instr.op === "LOG") {
        logger.info(`[script:${robotId}] ${instr.message}`, { robotId, line: instr.line });
        results.push({ sourceLine: instr.line, sourceColumn: instr.column, result: { kind: "LOG", message: instr.message } });
        continue;
      }
      const dispatchResult = await commandRegistry.dispatch({
        type: instr.command,
        params: paramsForArg(instr.arg),
        source: "PI_SCRIPT",
        robotId,
        isAdmin,
      });
      const step: ScriptExecutionStep = { sourceLine: instr.line, sourceColumn: instr.column, result: dispatchResult };
      results.push(step);
      if (!isSuccessful(step)) break;
    }
    return results;
  }
}

export const scriptExecutor = new ScriptExecutor();
