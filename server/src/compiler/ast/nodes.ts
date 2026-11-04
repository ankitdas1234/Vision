/** A reference to a variable declared earlier via SET, or the automatic
 * loop-index variable a REPEAT block binds (see RepeatStatement.asName).
 * Resolved to a concrete number|string at IR-generation time — this node
 * never reaches the executor. */
export interface VariableRef {
  kind: "VARIABLE_REF";
  name: string;
}

export type ArgValue = number | string | VariableRef;

export type ArithmeticOp = "+" | "-" | "*" | "/";
export type ComparisonOp = ">" | "<" | ">=" | "<=" | "==" | "!=";

/** A left-to-right chain of arithmetic operations, e.g. `1 + $x - 2`.
 * No operator precedence — this is a small robot-scripting language, not
 * a calculator, so operations apply strictly in written order. Every
 * operand is fully resolved (variables substituted, arithmetic actually
 * computed) at compile time — see ir/IRGenerator.ts — so a `SET` using
 * one of these still ends up assigning a single concrete literal by the
 * time execution sees it. */
export interface Expression {
  kind: "EXPRESSION";
  first: ArgValue;
  rest: { op: ArithmeticOp; value: ArgValue }[];
}

export interface CommandStatement {
  kind: "COMMAND";
  name: string;
  arg?: ArgValue;
  line: number;
  column: number;
}

export interface WaitStatement {
  kind: "WAIT";
  ms: ArgValue;
  line: number;
  column: number;
}

/** `SET name value` — declares (or redeclares) a variable. `value` may be
 * a literal, a variable reference, or a simple left-to-right arithmetic
 * expression (`SET $x $a + 1`) — never something that depends on
 * external/runtime input, since no such input exists in this language.
 * That's what keeps every variable's value statically knowable just by
 * reading the script top to bottom (once loops are accounted for). */
export interface SetStatement {
  kind: "SET";
  name: string;
  value: ArgValue | Expression;
  line: number;
  column: number;
}

/** `RANDOM name min max` — assigns a real random integer in [min, max]
 * (inclusive) to a variable. Resolved once, at compile time (see
 * ir/IRGenerator.ts) — compiling the same script twice can yield
 * different values, but a single compiled program's IR is just as fixed
 * and inspectable as any other SET. This is NOT a per-execution runtime
 * random draw; document that distinction anywhere this is explained. */
export interface RandomStatement {
  kind: "RANDOM";
  name: string;
  min: ArgValue;
  max: ArgValue;
  line: number;
  column: number;
}

/** `PRINT value` — logs a message (via the server logger, see
 * scripts/ScriptExecutor.ts) with zero hardware interaction. Exists for
 * script authors to see what a script actually computed (useful once
 * variables/expressions/loops are in the mix) without dispatching a real
 * robot command just to produce output. */
export interface PrintStatement {
  kind: "PRINT";
  value: ArgValue;
  line: number;
  column: number;
}

/** `REPEAT count TIMES [AS name] ... END` — a bounded loop, fully
 * unrolled at compile time (see ir/IRGenerator.ts). `count` may be a
 * literal or a variable that resolves to a positive integer within
 * SemanticAnalyzer's configured bound. `asName` (default "I") is the
 * name bound to the 0-based iteration index inside the body, e.g.
 * `EYE_SET $I` varies per iteration — usable as an ordinary variable
 * reference in the body, shadowing any outer variable of the same name
 * for the duration of the loop. */
export interface RepeatStatement {
  kind: "REPEAT";
  count: number | VariableRef;
  asName: string;
  body: Statement[];
  line: number;
  column: number;
}

/** `IF left op right [THEN] ... [ELSE ...] END` — a single comparison,
 * no AND/OR chaining (keeps the grammar small and unambiguous). Because
 * every value in this language is knowable at compile time (literals,
 * SET results, or a loop's own index for that iteration — never live
 * sensor input), the comparison itself is evaluated at compile time too
 * (see ir/IRGenerator.ts) and only the taken branch's instructions are
 * ever emitted. There is no runtime branching construct — an IF vanishes
 * completely once compiled, the same way a REPEAT unrolls into its real
 * repeated instructions instead of staying a loop. */
export interface IfStatement {
  kind: "IF";
  left: ArgValue;
  op: ComparisonOp;
  right: ArgValue;
  thenBody: Statement[];
  elseBody: Statement[] | null;
  line: number;
  column: number;
}

export type Statement = CommandStatement | WaitStatement | SetStatement | RepeatStatement | IfStatement | PrintStatement | RandomStatement;
