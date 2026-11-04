import { Lexer } from "./lexer/Lexer";
import { LexError } from "./lexer/LexError";
import { Parser } from "./parser/Parser";
import { ParseError } from "./parser/ParseError";
import { analyze, type Diagnostic } from "./semantic/SemanticAnalyzer";
import { generateIR } from "./ir/IRGenerator";
import { CompileLimitError } from "./ir/CompileLimitError";
import type { IRProgram } from "./ir/IR";
import type { ProgramAST } from "./ast/AST";

export interface CompileResult {
  success: boolean;
  ast?: ProgramAST;
  ir?: IRProgram;
  diagnostics: Diagnostic[];
}

/**
 * Vision Script compiler pipeline: Source -> Lexer -> Parser -> AST ->
 * Semantic Analysis -> IR. IR is later fed through the Command Registry
 * for validation + execution (never executed directly).
 */
export class Compiler {
  compile(source: string): CompileResult {
    try {
      const tokens = new Lexer().tokenize(source);
      const ast = new Parser(tokens).parseProgram();
      const diagnostics = analyze(ast);
      if (diagnostics.some((d) => d.severity === "error")) {
        return { success: false, ast, diagnostics };
      }
      const ir = generateIR(ast);
      return { success: true, ast, ir, diagnostics };
    } catch (err) {
      return { success: false, diagnostics: [toDiagnostic(err)] };
    }
  }
}

/** LexError/ParseError/CompileLimitError carry a real line+column already;
 * anything else (a defensive catch-all for a bug elsewhere in the
 * pipeline) is reported at line 0 rather than silently swallowed, since a
 * compiler that fails without saying why is worse than one that fails
 * loudly. */
function toDiagnostic(err: unknown): Diagnostic {
  if (err instanceof LexError) {
    return { line: err.line, column: err.column, code: "LEX_ERROR", message: err.message, severity: "error" };
  }
  if (err instanceof ParseError) {
    return { line: err.line, column: err.column, code: "PARSE_ERROR", message: err.message, severity: "error" };
  }
  if (err instanceof CompileLimitError) {
    return { line: err.line, column: err.column, code: "COMPILE_LIMIT_EXCEEDED", message: err.message, severity: "error" };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { line: 0, column: 0, code: "COMPILE_ERROR", message, severity: "error" };
}

export const compiler = new Compiler();
