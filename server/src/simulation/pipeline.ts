import { Lexer } from "../compiler/lexer/Lexer";
import { TokenType } from "../compiler/lexer/TokenType";
import { LexError } from "../compiler/lexer/LexError";
import { Parser } from "../compiler/parser/Parser";
import { ParseError } from "../compiler/parser/ParseError";
import { analyze, type Diagnostic } from "../compiler/semantic/SemanticAnalyzer";
import { generateIR } from "../compiler/ir/IRGenerator";
import { CompileLimitError } from "../compiler/ir/CompileLimitError";
import type { IRInstruction } from "../compiler/ir/IR";
import type { ProgramAST } from "../compiler/ast/AST";
import type { Statement } from "../compiler/ast/nodes";

/**
 * Compiles a Vision Script with the REAL compiler stages, one by one (exactly what
 * Compiler.compile does), and keeps what each stage produced so the simulator's Compiler
 * view can draw the pipeline: Script -> Lexer -> Parser -> Semantic -> IR -> Simulation.
 * Simulation-only; nothing here executes anything.
 */
export type StageName = "lexer" | "parser" | "semantic" | "ir";
export interface StageInfo { name: StageName; status: "ok" | "failed" | "skipped"; detail: string }
export interface Check { question: string; ok: boolean; answer: string }
export interface PipelineResult {
  ok: boolean;
  stages: StageInfo[];
  tokens: { type: string; value: string; line: number }[];
  tree: string[];
  checks: Check[];
  diagnostics: Diagnostic[];
  instructions: IRInstruction[];
}

const MAX_TOKENS_SHOWN = 300;

function toDiagnostic(err: unknown): Diagnostic {
  if (err instanceof LexError) return { line: err.line, column: err.column, code: "LEX_ERROR", message: err.message, severity: "error" };
  if (err instanceof ParseError) return { line: err.line, column: err.column, code: "PARSE_ERROR", message: err.message, severity: "error" };
  if (err instanceof CompileLimitError) return { line: err.line, column: err.column, code: "COMPILE_LIMIT_EXCEEDED", message: err.message, severity: "error" };
  return { line: 0, column: 0, code: "COMPILE_ERROR", message: err instanceof Error ? err.message : String(err), severity: "error" };
}

function val(v: any): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "object") {
    if (v.kind === "VARIABLE_REF") return v.name.startsWith("$") ? v.name : `$${v.name}`;
    if (v.kind === "EXPRESSION") return [val(v.first), ...v.rest.map((r: any) => `${r.op} ${val(r.value)}`)].join(" ");
  }
  return typeof v === "string" ? JSON.stringify(v) : String(v);
}

function describe(stmt: Statement): { label: string; children: Statement[] } {
  const s = stmt as any;
  switch (s.kind) {
    case "COMMAND": return { label: s.arg !== undefined ? `${s.name} ${val(s.arg)}` : s.name, children: [] };
    case "WAIT": return { label: `WAIT ${val(s.ms)}`, children: [] };
    case "SET": return { label: `SET $${s.name} ${val(s.value)}`, children: [] };
    case "RANDOM": return { label: `RANDOM $${s.name} ${val(s.min)} ${val(s.max)}`, children: [] };
    case "PRINT": return { label: `PRINT ${val(s.value)}`, children: [] };
    case "REPEAT": return { label: `REPEAT (${val(s.count)} times${s.asName ? ` AS $${s.asName}` : ""})`, children: s.body ?? [] };
    case "IF": return { label: `IF ${val(s.left)} ${s.op} ${val(s.right)}`, children: [...(s.thenBody ?? []), ...(s.elseBody ?? [])] };
    default: return { label: String(s.kind), children: [] };
  }
}

function treeLines(body: Statement[], prefix = ""): string[] {
  const out: string[] = [];
  body.forEach((st, i) => {
    const last = i === body.length - 1;
    const d = describe(st);
    out.push(`${prefix}${last ? "└── " : "├── "}${d.label}`);
    if (d.children.length) out.push(...treeLines(d.children, prefix + (last ? "    " : "│   ")));
  });
  return out;
}

function walk(body: Statement[], fn: (s: Statement) => void) {
  for (const st of body) { fn(st); walk(describe(st).children, fn); }
}

/** The questions the semantic stage really asks of THIS script, answered from its real diagnostics. */
function buildChecks(ast: ProgramAST, diagnostics: Diagnostic[]): Check[] {
  const errs = diagnostics.filter((d) => d.severity === "error");
  const commands: string[] = [];
  let hasWait = false, hasRepeat = false, usesVars = false;
  walk(ast.body, (s: any) => {
    if (s.kind === "COMMAND" && !commands.includes(s.name)) commands.push(s.name);
    if (s.kind === "WAIT") hasWait = true;
    if (s.kind === "REPEAT") hasRepeat = true;
    if (s.kind === "SET" || s.kind === "RANDOM" || s.kind === "REPEAT") usesVars = true;
  });
  const checks: Check[] = [];
  for (const name of commands.slice(0, 5)) {
    const bad = errs.some((d) => d.code === "UNKNOWN_COMMAND" && d.message.includes(`'${name}'`));
    checks.push({ question: `Is ${name} a real command?`, ok: !bad, answer: bad ? "Error" : "Yes" });
  }
  if (commands.length > 5) checks.push({ question: `…and ${commands.length - 5} more commands`, ok: !errs.some((d) => d.code === "UNKNOWN_COMMAND"), answer: errs.some((d) => d.code === "UNKNOWN_COMMAND") ? "Error" : "Yes" });
  if (hasWait) {
    const bad = errs.some((d) => d.code === "WAIT_OUT_OF_RANGE" || (/WAIT/.test(d.message) && d.code !== "UNKNOWN_COMMAND"));
    checks.push({ question: "Is the number after WAIT okay?", ok: !bad, answer: bad ? "Error" : "Yes" });
  }
  if (usesVars) {
    const bad = errs.some((d) => d.code === "UNDECLARED_VARIABLE");
    checks.push({ question: "Did you use a variable that doesn't exist?", ok: !bad, answer: bad ? "Error" : "No" });
  }
  if (hasRepeat) {
    const bad = errs.some((d) => d.code === "REPEAT_COUNT_OUT_OF_RANGE" || /REPEAT/.test(d.message));
    checks.push({ question: "Is the REPEAT number too big?", ok: !bad, answer: bad ? "Error" : "No" });
  }
  return checks;
}

export function compilePipeline(source: string): PipelineResult {
  const stages: StageInfo[] = (["lexer", "parser", "semantic", "ir"] as StageName[]).map((name) => ({ name, status: "skipped" as const, detail: "" }));
  const result: PipelineResult = { ok: false, stages, tokens: [], tree: [], checks: [], diagnostics: [], instructions: [] };
  const fail = (i: number, err: unknown) => {
    const d = toDiagnostic(err);
    stages[i].status = "failed";
    stages[i].detail = d.message;
    result.diagnostics = [d];
    return result;
  };

  let tokens: ReturnType<Lexer["tokenize"]>;
  try {
    tokens = new Lexer().tokenize(source);
  } catch (err) { return fail(0, err); }
  const words = tokens.filter((t) => t.type !== TokenType.EOF);
  result.tokens = words.slice(0, MAX_TOKENS_SHOWN).map((t) => ({ type: t.type, value: t.value, line: t.line }));
  stages[0] = { name: "lexer", status: "ok", detail: `${words.filter((t) => t.type !== TokenType.NEWLINE).length} tokens` };

  let ast: ProgramAST;
  try {
    ast = new Parser(tokens).parseProgram();
  } catch (err) { return fail(1, err); }
  let count = 0; walk(ast.body, () => count++);
  stages[1] = { name: "parser", status: "ok", detail: `${count} statements` };
  result.tree = ["PROGRAM", ...treeLines(ast.body)];

  let diagnostics: Diagnostic[];
  try {
    diagnostics = analyze(ast);
  } catch (err) { return fail(2, err); }
  result.diagnostics = diagnostics;
  result.checks = buildChecks(ast, diagnostics);
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length) {
    stages[2] = { name: "semantic", status: "failed", detail: `${errors.length} error${errors.length === 1 ? "" : "s"}` };
    return result;
  }
  stages[2] = { name: "semantic", status: "ok", detail: "all checks passed" };

  try {
    result.instructions = generateIR(ast).instructions;
  } catch (err) { return fail(3, err); }
  stages[3] = { name: "ir", status: "ok", detail: `${result.instructions.length} instructions` };
  result.ok = true;
  return result;
}
