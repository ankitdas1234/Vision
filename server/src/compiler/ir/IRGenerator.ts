import type { ProgramAST } from "../ast/AST";
import type { Statement, ArgValue, VariableRef, Expression } from "../ast/nodes";
import type { IRProgram, IRInstruction } from "./IR";
import type { CommandType } from "../../packages/types";
import { CompileLimitError } from "./CompileLimitError";
import { MAX_REPEAT_COUNT, MAX_TOTAL_INSTRUCTIONS } from "../limits";

type VarValue = number | string;
type Scope = Map<string, VarValue>;

/**
 * Turns the AST into a flat instruction list, fully resolved: every
 * REPEAT is unrolled into its real, repeated instructions, every IF is
 * resolved down to just whichever branch was actually taken, every
 * arithmetic expression is folded to a single value, RANDOM is rolled
 * to a concrete number, and every variable reference is substituted
 * with its actual value. This is the step that keeps the rest of the
 * pipeline (ScriptExecutor) completely unaware any of that language
 * machinery ever existed — it just sees a flat list of the same
 * EXEC/SLEEP/LOG instructions it always has, each still carrying the
 * source line/column of the statement that produced it.
 *
 * Enforces MAX_TOTAL_INSTRUCTIONS across the whole unrolled program —
 * SemanticAnalyzer can validate a single REPEAT's own count against
 * MAX_REPEAT_COUNT, but only this stage, which actually walks the
 * unrolled tree, can know the true total size (nested loops multiply).
 * Also re-validates any loop-varying (DYNAMIC in SemanticAnalyzer's
 * terms) value now that its concrete per-iteration value is finally
 * known: WAIT/REPEAT ranges, division by zero, IF's comparison itself.
 */
export function generateIR(ast: ProgramAST): IRProgram {
  const instructions: IRInstruction[] = [];

  function resolve(arg: ArgValue, scopes: Scope[]): VarValue {
    if (typeof arg === "number" || typeof arg === "string") return arg;
    const name = (arg as VariableRef).name;
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (scopes[i].has(name)) return scopes[i].get(name)!;
    }
    // SemanticAnalyzer already guarantees every reference is declared
    // before IR generation runs (Compiler.compile only calls generateIR
    // once analyze() reports zero errors) — reaching here would be an
    // internal bug, not a user-facing script error, hence the generic
    // Error rather than a CompileLimitError/diagnostic.
    throw new Error(`Internal compiler error: unresolved variable '$${name}' reached IR generation`);
  }

  /** Folds a SET value (plain value or arithmetic expression) into a
   * single concrete number/string, left to right, no precedence — see
   * ast/nodes.ts's Expression comment for why that's the right scope for
   * this language. */
  function resolveValue(value: ArgValue | Expression, scopes: Scope[], line: number, column: number): VarValue {
    if (typeof value !== "object" || !("kind" in value) || value.kind !== "EXPRESSION") {
      return resolve(value as ArgValue, scopes);
    }

    let acc = resolve(value.first, scopes);
    for (const { op, value: operand } of value.rest) {
      const rhs = resolve(operand, scopes);
      if (op === "+" && typeof acc === "string" && typeof rhs === "string") {
        acc = acc + rhs;
      } else if (typeof acc === "number" && typeof rhs === "number") {
        if (op === "/" && rhs === 0) {
          throw new CompileLimitError("Division by zero", line, column);
        }
        acc = op === "+" ? acc + rhs : op === "-" ? acc - rhs : op === "*" ? acc * rhs : acc / rhs;
      } else {
        // SemanticAnalyzer already rejects any statically-known type
        // mismatch — reaching here means both sides were DYNAMIC
        // (loop-index-derived) and only turned out mismatched once
        // concrete, which is exactly the kind of per-iteration surprise
        // this re-check exists to catch.
        throw new CompileLimitError(`'${op}' requires two numbers, or two strings (for '+') — got ${JSON.stringify(acc)} and ${JSON.stringify(rhs)}`, line, column);
      }
    }
    return acc;
  }

  function compareValues(left: VarValue, op: string, right: VarValue, line: number, column: number): boolean {
    if (typeof left !== typeof right) {
      throw new CompileLimitError(`IF's two sides resolved to different types (${JSON.stringify(left)} vs ${JSON.stringify(right)}) on this iteration`, line, column);
    }
    switch (op) {
      case ">": return left > right;
      case "<": return left < right;
      case ">=": return left >= right;
      case "<=": return left <= right;
      case "==": return left === right;
      case "!=": return left !== right;
      default: throw new Error(`Internal compiler error: unknown comparison operator '${op}'`);
    }
  }

  function pushInstruction(instr: IRInstruction) {
    if (instructions.length >= MAX_TOTAL_INSTRUCTIONS) {
      throw new CompileLimitError(`Script expands to more than ${MAX_TOTAL_INSTRUCTIONS} instructions once loops are unrolled — shorten it or reduce REPEAT counts`, instr.line, instr.column);
    }
    instructions.push(instr);
  }

  function emit(statements: Statement[], scopes: Scope[]) {
    for (const stmt of statements) {
      if (stmt.kind === "COMMAND") {
        const arg = stmt.arg !== undefined ? resolve(stmt.arg, scopes) : undefined;
        pushInstruction({ op: "EXEC", command: stmt.name as CommandType, arg, line: stmt.line, column: stmt.column });
      } else if (stmt.kind === "WAIT") {
        const ms = resolve(stmt.ms, scopes);
        if (typeof ms !== "number" || ms < 0 || ms > 60000) {
          throw new CompileLimitError(`WAIT resolved to ${JSON.stringify(ms)} on this iteration, which is outside the allowed 0-60000ms range`, stmt.line, stmt.column);
        }
        pushInstruction({ op: "SLEEP", ms, line: stmt.line, column: stmt.column });
      } else if (stmt.kind === "PRINT") {
        const value = resolve(stmt.value, scopes);
        pushInstruction({ op: "LOG", message: String(value), line: stmt.line, column: stmt.column });
      } else if (stmt.kind === "SET") {
        scopes[scopes.length - 1].set(stmt.name, resolveValue(stmt.value, scopes, stmt.line, stmt.column));
      } else if (stmt.kind === "RANDOM") {
        const min = resolve(stmt.min, scopes);
        const max = resolve(stmt.max, scopes);
        if (typeof min !== "number" || typeof max !== "number" || !Number.isInteger(min) || !Number.isInteger(max) || min > max) {
          throw new CompileLimitError(`RANDOM's bounds resolved to invalid values (${JSON.stringify(min)}, ${JSON.stringify(max)}) on this iteration`, stmt.line, stmt.column);
        }
        // Rolled once, here, at compile time — see nodes.ts's
        // RandomStatement comment for why this isn't a per-execution
        // runtime draw.
        const roll = min + Math.floor(Math.random() * (max - min + 1));
        scopes[scopes.length - 1].set(stmt.name, roll);
      } else if (stmt.kind === "REPEAT") {
        const count = typeof stmt.count === "number" ? stmt.count : resolve(stmt.count, scopes);
        if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > MAX_REPEAT_COUNT) {
          throw new CompileLimitError(`REPEAT resolved to ${JSON.stringify(count)} on this iteration, which is outside the allowed 1-${MAX_REPEAT_COUNT} range`, stmt.line, stmt.column);
        }
        for (let i = 0; i < count; i++) {
          const loopScope: Scope = new Map([[stmt.asName, i]]);
          emit(stmt.body, [...scopes, loopScope]);
        }
      } else if (stmt.kind === "IF") {
        const left = resolve(stmt.left, scopes);
        const right = resolve(stmt.right, scopes);
        const taken = compareValues(left, stmt.op, right, stmt.line, stmt.column);
        // The whole point: only the branch actually taken this
        // iteration gets emitted. An IF leaves zero trace in the
        // compiled IR — no runtime branching construct exists downstream.
        if (taken) {
          emit(stmt.thenBody, [...scopes, new Map()]);
        } else if (stmt.elseBody) {
          emit(stmt.elseBody, [...scopes, new Map()]);
        }
      }
    }
  }

  emit(ast.body, [new Map()]);
  return { instructions };
}
