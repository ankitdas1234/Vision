import { EventEmitter } from "node:events";
import type { CommandType } from "../packages/types";

/**
 * COMMAND DELIVERY QUEUE
 * ----------------------
 * Found while wiring up embodied gestures: `CommandRegistry.dispatch()`
 * validates a command, updates the server's own software model of the
 * robot (ServoManager's tracked angle, etc.), and returns `COMPLETED` —
 * but nothing ever sent that command over the network. Firmware's
 * `protocol/CommandTypes.h` `parseCommand()` and `CommandProtocol::dispatch()`
 * were fully implemented and ready to receive commands, just never called
 * from anywhere. Every EYE_SET, AUDIO_SPEAK, WALK_FORWARD, dance frame,
 * and search-mission gait step dispatched so far only ever updated
 * server-side bookkeeping.
 *
 * This queue is the fix: `CommandRegistry` enqueues here after a command
 * passes validation/safety/control-mode checks (see packages/commands.ts
 * `PHYSICALLY_DELIVERABLE_COMMANDS` for which types qualify), and firmware
 * drains it via `GET /api/commands/pending` on the same poll cadence it
 * already uses for the capture schedule.
 *
 * This is an eventual-consistency, fire-and-poll model, not a confirmed
 * synchronous round trip — the server doesn't wait to hear back that a
 * command physically executed before reporting COMPLETED. That matches
 * every other robot-facing piece of this codebase (heartbeat, camera
 * schedule) and is the honest, achievable version of "the robot does
 * this" for hardware the server has no persistent connection to.
 */
export interface QueuedCommand {
  commandId: string;
  type: CommandType;
  params: Record<string, unknown>;
  queuedAt: string;
}

/** If a robot is offline for a while, don't let its queue grow without
 * bound — keep only the most recent commands so it doesn't wake up to a
 * long backlog of stale movement instructions. */
const MAX_QUEUE_LENGTH = 20;

class PendingCommandQueue {
  /** Emits "enqueue" (robotId) the instant a command is queued, so a live
   * transport (robot/RobotLink.ts WebSocket) can push it immediately
   * instead of waiting for the robot's next poll. */
  readonly events = new EventEmitter();
  private queues = new Map<string, QueuedCommand[]>();

  enqueue(robotId: string, commandId: string, type: CommandType, params: Record<string, unknown>) {
    const queue = this.queues.get(robotId) ?? [];
    queue.push({ commandId, type, params, queuedAt: new Date().toISOString() });
    if (queue.length > MAX_QUEUE_LENGTH) queue.splice(0, queue.length - MAX_QUEUE_LENGTH);
    this.queues.set(robotId, queue);
    this.events.emit("enqueue", robotId);
  }

  /** Removes and returns everything queued for a robot — one-shot per
   * call, same principle as AttentionController's force-capture flag, so
   * polling drains rather than re-reading the same commands repeatedly. */
  drain(robotId: string): QueuedCommand[] {
    const queue = this.queues.get(robotId) ?? [];
    this.queues.set(robotId, []);
    return queue;
  }

  pendingCount(robotId: string): number {
    return this.queues.get(robotId)?.length ?? 0;
  }
}

export const pendingCommandQueue = new PendingCommandQueue();
