export type { CommandType } from "../packages/types";
import type { CommandType, CommandSource, CommandResult } from "../packages/types";

export interface CommandContext {
  source: CommandSource;
  userId?: string;
  robotId: string;
  /** The person (see `people` table) this command is being carried out on
   * behalf of, when known — e.g. who asked Vision to go find someone. */
  personId?: string;
}

export interface CommandHandlerArgs<T = Record<string, unknown>> {
  commandId: string;
  type: CommandType;
  params: T;
  ctx: CommandContext;
}

export type CommandHandler = (args: CommandHandlerArgs) => Promise<CommandResult["result"]>;
