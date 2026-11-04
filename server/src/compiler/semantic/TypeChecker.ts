import { COMMAND_TYPES } from "../../packages/types";

const KNOWN_COMMANDS = new Set<string>(COMMAND_TYPES);

export function isKnownCommand(name: string): boolean {
  return KNOWN_COMMANDS.has(name);
}
