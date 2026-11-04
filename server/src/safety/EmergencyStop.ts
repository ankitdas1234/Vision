import { ServoManager } from "../servos/ServoManager";
import { GaitController } from "../gait/GaitController";
import type { SafetyEvent } from "./safetyTypes";

/**
 * Highest-priority subsystem. Does NOT depend on AI, memory, or the brain.
 * Stops rotation servos, cancels gait, and puts positional servos into a safe state.
 */
export class EmergencyStop {
  constructor(private servos: ServoManager, private gait: GaitController) {}

  trigger(robotId: string, reason: string): SafetyEvent {
    this.gait.stop();
    this.servos.allSafe();
    return {
      id: crypto.randomUUID(),
      robotId,
      eventType: "EMERGENCY_STOP",
      severity: "CRITICAL",
      description: reason,
      actionTaken: "All continuous servos stopped, positional servos set safe, gait cancelled.",
      resolved: false,
      createdAt: new Date().toISOString(),
    };
  }
}
