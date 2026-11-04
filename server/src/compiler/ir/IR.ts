import type { CommandType } from "../../packages/types";

export type IRInstruction =
  | { op: "EXEC"; command: CommandType; arg?: number | string; line: number; column: number }
  | { op: "SLEEP"; ms: number; line: number; column: number }
  | { op: "LOG"; message: string; line: number; column: number };

export interface IRProgram { instructions: IRInstruction[] }
