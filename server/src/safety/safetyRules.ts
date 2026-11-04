import { HARDWARE_COMMANDS } from "../packages/commands";
import type { CommandType } from "../packages/types";

export function requiresSafetyCheck(type: CommandType) {
  return HARDWARE_COMMANDS.has(type);
}
