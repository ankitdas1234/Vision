import { compiler } from "../compiler/Compiler";
import { scriptExecutor } from "./ScriptExecutor";

export class ScriptService {
  compile(source: string) { return compiler.compile(source); }

  async compileAndExecute(source: string, robotId: string, isAdmin: boolean) {
    const compiled = compiler.compile(source);
    if (!compiled.success || !compiled.ir) return { compiled, executionResults: [] };
    const executionResults = await scriptExecutor.execute(compiled.ir, robotId, isAdmin);
    return { compiled, executionResults };
  }
}

export const scriptService = new ScriptService();
