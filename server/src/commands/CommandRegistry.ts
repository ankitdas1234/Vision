import { validateCommand } from "./CommandValidator";
import { safetyManager } from "../safety/SafetyManager";
import { commandExecutor } from "./CommandExecutor";
import { isHeadForward, waitForHeadSettled } from "../attention/HeadController";
import { pendingCommandQueue } from "./PendingCommandQueue";
import { mentalIntelligence } from "../mental/MentalIntelligence";
import { controlMode, ControlModeError } from "../control/ControlMode";
import { restrictionService, RestrictionError } from "../restrictions/RestrictionService";
import { MANUAL_GATED_COMMANDS, MOVEMENT_COMMANDS, PHYSICALLY_DELIVERABLE_COMMANDS } from "../packages/commands";
import type { CommandType, CommandResult, CommandSource } from "../packages/types";

export interface DispatchInput {
  type: CommandType;
  params: unknown;
  source: CommandSource;
  robotId: string;
  isAdmin: boolean;
  userId?: string;
  /** The tracked person (see `people` table) this command is being carried out on
   * behalf of — e.g. a voice command from a visitor standing in front of the
   * robot. Lets an admin restriction be scoped to "don't do that for THAT
   * person" rather than blocking the command for everyone. */
  personId?: string;
}

interface LastCommandRecord {
  type: CommandType;
  personId?: string;
  at: string;
}

/**
 * SINGLE centralized entry point for every command in the system.
 * Dashboard, Vision Script, AI, and internal system code must all go through here.
 * Pipeline: schema validation -> authorization -> safety -> control-mode -> execution.
 */
export class CommandRegistry {
  // Per-robot memory of the last dispatched command, purely so a spoken
  // "Vision, don't do that" can resolve "that" without full NLP coreference.
  // In-memory only (not persisted) — a fresh deploy just means the very
  // first veto after restart needs the command named explicitly instead.
  private lastCommand = new Map<string, LastCommandRecord>();

  getLastCommand(robotId: string): LastCommandRecord | null {
    return this.lastCommand.get(robotId) ?? null;
  }

  async dispatch(input: DispatchInput): Promise<CommandResult> {
    const commandId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    // A real person actively operating the dashboard counts as human interaction —
    // resets the 10-minute idle/exploration timer. Autonomous SYSTEM/AI/PI_SCRIPT
    // dispatches (e.g. tracking) do not, so exploration can still kick in during them.
    if (input.source === "DASHBOARD") mentalIntelligence.noteHumanInteraction();

    try {
      const params = validateCommand(input.type, input.params, { source: input.source, isAdmin: input.isAdmin });

      // Admin veto check — runs before safety/control-mode so a restricted
      // command is rejected the same way regardless of who's asking.
      // ADMIN-sourced dispatches (e.g. the admin lifting their own restriction
      // via a fresh command) are still subject to it on purpose: to actually
      // move again, the restriction has to be lifted first (see RestrictionService.lift),
      // not silently bypassed by re-issuing the command as ADMIN.
      const restriction = await restrictionService.check(input.type, input.personId ?? null);
      if (restriction) {
        throw new RestrictionError(
          `${input.type} is currently restricted by an admin${restriction.reason ? ` ("${restriction.reason}")` : ""}. An admin must lift the restriction before this can run again.`
        );
      }

      // The ultrasonic sensor rides on the head, so it only describes the path
      // ahead while the head faces forward (docs/ultrasonic.md). Like a person
      // looking where they're going: before driving the legs, bring the head
      // forward and wait for it to get there. Without this, "walk forward"
      // would be refused whenever the brain happened to be looking sideways,
      // and a "centre the head, then walk" sequence would send the walk while
      // the real head was still turning (the firmware rightly rejects that).
      if (MOVEMENT_COMMANDS.has(input.type)) {
        if (!isHeadForward()) {
          await this.dispatch({ type: "EYE_CENTER", params: {}, source: "SYSTEM", robotId: input.robotId, isAdmin: true });
        }
        await waitForHeadSettled();
      }

      safetyManager.check(input.type);

      // A human (dashboard or a Vision Script) may only actively MOVE the
      // robot while Manual Mode is on. In the default AUTONOMOUS state the
      // brain drives — see docs/control-mode.md. STOP/CENTER/SAFE commands
      // (including EMERGENCY_STOP/SERVOS_SAFE) are excluded from
      // MANUAL_GATED_COMMANDS and always work, in either mode.
      const isHumanSource = input.source === "DASHBOARD" || input.source === "PI_SCRIPT";
      if (isHumanSource && MANUAL_GATED_COMMANDS.has(input.type) && !(await controlMode.isManualModeEnabled())) {
        throw new ControlModeError(
          `${input.type} rejected: Vision is in AUTONOMOUS mode — the brain is currently in control. Enable Manual Mode to send direct commands.`
        );
      }

      // Deliver to the robot BEFORE running the server-side model of the
      // command. Previously this ran after `execute()` resolved, and for
      // WALK_*/TURN_*/EYE_* that promise only resolves once the server has
      // *simulated the whole movement* — so the real robot received e.g. a
      // 1000 ms walk a full second late. All gates above (validation,
      // restrictions, safety, control mode) have already passed, so it is
      // safe to send now. If the server-side execution then fails, a stop is
      // sent so the robot can't be left running on a command that errored.
      const deliverable = PHYSICALLY_DELIVERABLE_COMMANDS.has(input.type);
      if (deliverable) {
        pendingCommandQueue.enqueue(input.robotId, commandId, input.type, params as Record<string, unknown>);
      }

      let result;
      try {
        result = await commandExecutor.execute({
          commandId,
          type: input.type,
          params,
          ctx: { source: input.source, userId: input.userId, robotId: input.robotId, personId: input.personId },
        });
      } catch (execErr) {
        if (deliverable && MOVEMENT_COMMANDS.has(input.type)) {
          pendingCommandQueue.enqueue(input.robotId, crypto.randomUUID(), "WALK_STOP", {});
        }
        throw execErr;
      }

      this.lastCommand.set(input.robotId, { type: input.type, personId: input.personId, at: startedAt });

      return {
        success: true,
        commandId,
        type: input.type,
        status: "COMPLETED",
        startedAt,
        completedAt: new Date().toISOString(),
        result: result ?? {},
        error: null,
      };
    } catch (err) {
      const e = err as { code?: string; message: string };
      return {
        success: false,
        commandId,
        type: input.type,
        status: "REJECTED",
        startedAt,
        completedAt: new Date().toISOString(),
        error: { code: e.code ?? "COMMAND_FAILED", message: e.message },
      };
    }
  }
}

export const commandRegistry = new CommandRegistry();
