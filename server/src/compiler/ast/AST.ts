import type { Statement } from "./nodes";

export interface ProgramAST {
  kind: "PROGRAM";
  body: Statement[];
}
