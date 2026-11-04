import { COMMAND_PARAM_SCHEMAS, ADMIN_ONLY_COMMANDS } from "../packages/commands";
import type { CommandType, CommandSource } from "../packages/types";

export class CommandValidationError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

export interface ValidationContext { source: CommandSource; isAdmin: boolean }

export function validateCommand(type: CommandType, params: unknown, ctx: ValidationContext) {
  const schema = COMMAND_PARAM_SCHEMAS[type];
  if (!schema) throw new CommandValidationError("UNKNOWN_COMMAND", `Unknown command type ${type}`);

  const parsed = schema.safeParse(params ?? {});
  if (!parsed.success) {
    throw new CommandValidationError("SCHEMA_VALIDATION_FAILED", parsed.error.message);
  }

  if (ADMIN_ONLY_COMMANDS.has(type) && !ctx.isAdmin) {
    throw new CommandValidationError("PERMISSION_DENIED", `${type} requires ADMIN permission`);
  }

  // AI and Vision Script sources can never directly issue ADMIN-only system commands.
  if (ADMIN_ONLY_COMMANDS.has(type) && (ctx.source === "AI" || ctx.source === "PI_SCRIPT")) {
    throw new CommandValidationError("PERMISSION_DENIED", `${type} cannot be issued by ${ctx.source}`);
  }

  return parsed.data;
}
