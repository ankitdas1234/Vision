import type { ProgramAST } from "../ast/AST";
import type { Statement, ArgValue, VariableRef, Expression, ComparisonOp } from "../ast/nodes";
import { SemanticError } from "./SemanticError";
import { isKnownCommand } from "./TypeChecker";
import { MAX_REPEAT_COUNT } from "../limits";

export interface Diagnostic { line: number; column: number; code: string; message: string; severity: "error" | "warning" }

type VarType = "number" | "string";
/** A variable's statically-known value, or DYNAMIC for a loop-bound index
 * variable (or anything derived from one) whose concrete value varies
 * per iteration and is only known once the IR generator actually
 * unrolls the loop. */
type VarValue = number | string | "DYNAMIC";

interface VarInfo {
  type: VarType;
  value: VarValue;
}

/**
 * Walks the AST validating:
 *   - every COMMAND refers to a real, registered command
 *   - every WAIT duration is in range — including through a variable or
 *     an arithmetic expression, resolved as far as statically possible
 *   - every variable reference was actually declared (via SET, RANDOM,
 *     or is a REPEAT's own loop-index variable) before use
 *   - type consistency throughout: arithmetic requires numbers (except
 *     `+` between two strings, which concatenates); comparisons require
 *     matching types on both sides
 *   - REPEAT counts and IF comparisons are checked when statically
 *     known; a value depending on an outer loop's own index is legal
 *     but not statically known — the IR generator re-checks those once
 *     it has a concrete number for that iteration
 *   - both branches of every IF are validated, even though only one
 *     will ever actually run for a given iteration — a script has to be
 *     structurally valid regardless of which branch a particular
 *     iteration takes
 *
 * Diagnostics are returned sorted by source position.
 */
export function analyze(ast: ProgramAST): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const scopes: Map<string, VarInfo>[] = [new Map()];

  const declare = (name: string, info: VarInfo) => {
    scopes[scopes.length - 1].set(name, info);
  };

  const lookup = (name: string): VarInfo | undefined => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const found = scopes[i].get(name);
      if (found) return found;
    }
    return undefined;
  };

  /** Resolves an ArgValue to a type + statically-known value (or DYNAMIC),
   * emitting an UNDECLARED_VARIABLE diagnostic if the reference is bad.
   * Returns null if the reference is invalid — callers should skip
   * further checks on it rather than cascade a second, confusing error. */
  function resolveArg(arg: ArgValue, line: number, column: number): VarInfo | null {
    if (typeof arg === "number") return { type: "number", value: arg };
    if (typeof arg === "string") return { type: "string", value: arg };
    const info = lookup((arg as VariableRef).name);
    if (!info) {
      diagnostics.push({ line, column, code: "UNDECLARED_VARIABLE", message: `'$${(arg as VariableRef).name}' is used before it's declared with SET/RANDOM (or isn't the current loop's index variable)`, severity: "error" });
      return null;
    }
    return info;
  }

  /** Resolves SET's value, which may be a plain ArgValue or an
   * Expression (a left-to-right arithmetic chain). Folds it as far as
   * possible; a DYNAMIC operand anywhere in the chain makes the whole
   * result DYNAMIC (its exact value depends on which loop iteration this
   * is, only knowable once IRGenerator unrolls it). Emits TYPE_MISMATCH
   * for a non-numeric operand in `- * /`, or mismatched types on `+`
   * where neither "both numbers" nor "both strings" holds. */
  function resolveValueOrExpression(value: ArgValue | Expression, line: number, column: number): VarInfo | null {
    if (typeof value !== "object" || !("kind" in value) || value.kind !== "EXPRESSION") {
      return resolveArg(value as ArgValue, line, column);
    }

    let acc = resolveArg(value.first, line, column);
    if (!acc) return null;

    for (const { op, value: operand } of value.rest) {
      const rhs = resolveArg(operand, line, column);
      if (!rhs) return null;

      if (acc.value === "DYNAMIC" || rhs.value === "DYNAMIC") {
        // Can't fold the arithmetic yet, but can still catch a type
        // problem that would be wrong on EVERY iteration regardless of
        // the dynamic value — e.g. subtracting from a string.
        if (op !== "+" && (acc.type !== "number" || rhs.type !== "number")) {
          diagnostics.push({ line, column, code: "TYPE_MISMATCH", message: `'${op}' requires numeric values`, severity: "error" });
          return null;
        }
        acc = { type: acc.type === "string" && rhs.type === "string" ? "string" : "number", value: "DYNAMIC" };
        continue;
      }

      if (op === "+" && acc.type === "string" && rhs.type === "string") {
        acc = { type: "string", value: (acc.value as string) + (rhs.value as string) };
      } else if (acc.type === "number" && rhs.type === "number") {
        const a = acc.value as number;
        const b = rhs.value as number;
        if (op === "/" && b === 0) {
          diagnostics.push({ line, column, code: "DIVIDE_BY_ZERO", message: "Division by zero", severity: "error" });
          return null;
        }
        const result = op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : a / b;
        acc = { type: "number", value: result };
      } else {
        diagnostics.push({ line, column, code: "TYPE_MISMATCH", message: `'${op}' requires two numbers, or two strings (for '+')`, severity: "error" });
        return null;
      }
    }

    return acc;
  }

  function checkNumericRange(info: VarInfo | null, line: number, column: number, code: string, label: string, min: number, max: number) {
    if (!info) return;
    if (info.type !== "number" || typeof info.value !== "number") {
      if (info.type !== "number") {
        diagnostics.push({ line, column, code: "TYPE_MISMATCH", message: `${label} requires a numeric value, but the given variable holds a string`, severity: "error" });
      }
      return; // DYNAMIC (loop index) — checked at IR-generation time instead
    }
    if (info.value < min || info.value > max) {
      diagnostics.push({ line, column, code, message: `${label} must be between ${min} and ${max}`, severity: "error" });
    }
  }

  function checkComparison(left: VarInfo | null, op: ComparisonOp, right: VarInfo | null, line: number, column: number) {
    if (!left || !right) return;
    const bothDynamicOrKnown = left.type === right.type;
    if (!bothDynamicOrKnown) {
      diagnostics.push({ line, column, code: "TYPE_MISMATCH", message: "IF's two sides must be the same type (both numbers or both text)", severity: "error" });
      return;
    }
    if (left.type === "string" && (op === ">" || op === "<" || op === ">=" || op === "<=")) {
      diagnostics.push({ line, column, code: "TYPE_MISMATCH", message: `'${op}' only works on numbers — text can only be compared with == or !=`, severity: "error" });
    }
  }

  function walk(statements: Statement[]) {
    for (const stmt of statements) {
      if (stmt.kind === "COMMAND") {
        if (!isKnownCommand(stmt.name)) {
          diagnostics.push({ line: stmt.line, column: stmt.column, code: "UNKNOWN_COMMAND", message: `'${stmt.name}' is not a registered Vision command`, severity: "error" });
        }
        if (stmt.arg !== undefined) resolveArg(stmt.arg, stmt.line, stmt.column);
      } else if (stmt.kind === "WAIT") {
        checkNumericRange(resolveArg(stmt.ms, stmt.line, stmt.column), stmt.line, stmt.column, "WAIT_OUT_OF_RANGE", "WAIT", 0, 60_000);
      } else if (stmt.kind === "PRINT") {
        resolveArg(stmt.value, stmt.line, stmt.column);
      } else if (stmt.kind === "SET") {
        const resolved = resolveValueOrExpression(stmt.value, stmt.line, stmt.column);
        declare(stmt.name, resolved ?? { type: "number", value: "DYNAMIC" });
      } else if (stmt.kind === "RANDOM") {
        const min = resolveArg(stmt.min, stmt.line, stmt.column);
        const max = resolveArg(stmt.max, stmt.line, stmt.column);
        if (min && min.type !== "number") diagnostics.push({ line: stmt.line, column: stmt.column, code: "TYPE_MISMATCH", message: "RANDOM's min must be numeric", severity: "error" });
        if (max && max.type !== "number") diagnostics.push({ line: stmt.line, column: stmt.column, code: "TYPE_MISMATCH", message: "RANDOM's max must be numeric", severity: "error" });
        if (min && max && typeof min.value === "number" && typeof max.value === "number" && min.value > max.value) {
          diagnostics.push({ line: stmt.line, column: stmt.column, code: "RANDOM_RANGE_INVALID", message: "RANDOM's min must not be greater than its max", severity: "error" });
        }
        declare(stmt.name, { type: "number", value: "DYNAMIC" }); // the actual roll only happens at IR-generation time
      } else if (stmt.kind === "REPEAT") {
        let countInfo: VarInfo | null;
        if (typeof stmt.count === "number") {
          countInfo = { type: "number", value: stmt.count };
        } else {
          countInfo = resolveArg(stmt.count, stmt.line, stmt.column);
        }
        checkNumericRange(countInfo, stmt.line, stmt.column, "REPEAT_COUNT_OUT_OF_RANGE", "REPEAT's count", 1, MAX_REPEAT_COUNT);

        scopes.push(new Map([[stmt.asName, { type: "number", value: "DYNAMIC" }]]));
        walk(stmt.body);
        scopes.pop();
      } else if (stmt.kind === "IF") {
        const left = resolveArg(stmt.left, stmt.line, stmt.column);
        const right = resolveArg(stmt.right, stmt.line, stmt.column);
        checkComparison(left, stmt.op, right, stmt.line, stmt.column);

        // Both branches get validated — see this function's header
        // comment for why (structural validity can't depend on which
        // branch a given loop iteration happens to take).
        scopes.push(new Map());
        walk(stmt.thenBody);
        scopes.pop();
        if (stmt.elseBody) {
          scopes.push(new Map());
          walk(stmt.elseBody);
          scopes.pop();
        }
      }
    }
  }

  walk(ast.body);
  return diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);
}

export function assertNoErrors(diagnostics: Diagnostic[]) {
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) throw new SemanticError(errors.map((e) => e.message).join("; "), errors[0].line);
}
