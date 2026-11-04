import { TokenType } from "../lexer/TokenType";
import type { Token } from "../lexer/Token";
import type { ProgramAST } from "../ast/AST";
import type { Statement, ArgValue, ArithmeticOp, ComparisonOp, Expression } from "../ast/nodes";
import { ParseError } from "./ParseError";

import { MAX_NESTING_DEPTH } from "../limits";

const DEFAULT_LOOP_VAR_NAME = "I";

const ARITHMETIC_OP_TOKENS: Partial<Record<TokenType, ArithmeticOp>> = {
  [TokenType.OP_PLUS]: "+",
  [TokenType.OP_MINUS]: "-",
  [TokenType.OP_TIMES_SIGN]: "*",
  [TokenType.OP_DIVIDE]: "/",
};

const COMPARISON_OP_TOKENS: Partial<Record<TokenType, ComparisonOp>> = {
  [TokenType.OP_GT]: ">",
  [TokenType.OP_LT]: "<",
  [TokenType.OP_GTE]: ">=",
  [TokenType.OP_LTE]: "<=",
  [TokenType.OP_EQ]: "==",
  [TokenType.OP_NEQ]: "!=",
};

/** Recursive-descent parser for the small, safe Vision Script grammar. */
export class Parser {
  private pos = 0;
  private depth = 0;
  constructor(private tokens: Token[]) {}

  private peek() { return this.tokens[this.pos]; }
  private advance() { return this.tokens[this.pos++]; }

  parseProgram(): ProgramAST {
    const body = this.parseStatements(new Set([TokenType.EOF]));
    return { kind: "PROGRAM", body };
  }

  /** Enforces the documented "one statement per line" grammar (see
   * docs/vision-script.md) — without this, `EYE_CENTER WALK_FORWARD` on
   * a single line silently parsed as two separate statements instead of
   * being rejected, which is both a spec violation and a footgun (a
   * typo'd missing newline would quietly do more than the author
   * intended rather than erroring). */
  private expectEndOfLine(): void {
    const next = this.peek();
    if (next.type === TokenType.NEWLINE || next.type === TokenType.EOF) {
      if (next.type === TokenType.NEWLINE) this.advance();
      return;
    }
    throw new ParseError(`Expected end of line, but found '${next.value}' — only one statement is allowed per line`, next.line, next.column);
  }

  /** Parses statements until a token type in `stopAt` is the next
   * non-newline token (consumed by the caller, not here — a block needs
   * to see its own END/ELSE to report a good error if it's missing;
   * parseProgram needs EOF left alone so its own loop condition still
   * works). */
  private parseStatements(stopAt: ReadonlySet<TokenType>): Statement[] {
    const body: Statement[] = [];
    while (!stopAt.has(this.peek().type)) {
      if (this.peek().type === TokenType.NEWLINE) {
        this.advance();
        continue;
      }
      if (this.peek().type === TokenType.EOF) {
        // Only reachable when stopAt doesn't include EOF, i.e. we were
        // looking for a REPEAT/IF's closing keyword and ran off the end.
        throw new ParseError("Unexpected end of script — missing END for an open REPEAT or IF block", this.peek().line, this.peek().column);
      }
      body.push(this.parseStatement());
      this.expectEndOfLine();
    }
    return body;
  }

  /** A single literal, string, or variable reference — never an
   * expression. Used everywhere a "plain value" is grammatically
   * required (WAIT's duration, REPEAT's count, IF's comparison operands,
   * PRINT's argument, RANDOM's bounds) — only SET allows the fuller
   * expression form, via parseValueOrExpression below. */
  private parseValue(): ArgValue | undefined {
    const next = this.peek();
    if (next.type === TokenType.NUMBER) return Number(this.advance().value);
    if (next.type === TokenType.STRING) return this.advance().value;
    if (next.type === TokenType.VARIABLE) return { kind: "VARIABLE_REF", name: this.advance().value };
    return undefined;
  }

  /** SET's value grammar: a plain value, optionally followed by a
   * left-to-right chain of arithmetic operations (`$a + 1 - $b`). No
   * operator precedence on purpose — see nodes.ts's Expression comment. */
  private parseValueOrExpression(): ArgValue | Expression | undefined {
    const first = this.parseValue();
    if (first === undefined) return undefined;

    const rest: Expression["rest"] = [];
    let opType = ARITHMETIC_OP_TOKENS[this.peek().type];
    while (opType) {
      this.advance();
      const operand = this.parseValue();
      if (operand === undefined) {
        throw new ParseError(`Expected a value after '${opType}'`, this.peek().line, this.peek().column);
      }
      rest.push({ op: opType, value: operand });
      opType = ARITHMETIC_OP_TOKENS[this.peek().type];
    }

    return rest.length === 0 ? first : { kind: "EXPRESSION", first, rest };
  }

  private parseStatement(): Statement {
    const tok = this.advance();

    if (tok.type === TokenType.WAIT) {
      const arg = this.parseValue();
      if (arg === undefined || typeof arg === "string") {
        throw new ParseError("WAIT requires a numeric or variable millisecond argument", tok.line, tok.column);
      }
      return { kind: "WAIT", ms: arg, line: tok.line, column: tok.column };
    }

    if (tok.type === TokenType.SET) {
      const nameTok = this.advance();
      if (nameTok.type !== TokenType.VARIABLE) {
        throw new ParseError("SET requires a variable name starting with '$', e.g. SET $speed 50", tok.line, tok.column);
      }
      const value = this.parseValueOrExpression();
      if (value === undefined) {
        throw new ParseError("SET requires a value, e.g. SET $speed 50 or SET $total $a + $b", tok.line, tok.column);
      }
      return { kind: "SET", name: nameTok.value, value, line: tok.line, column: tok.column };
    }

    if (tok.type === TokenType.RANDOM) {
      const nameTok = this.advance();
      if (nameTok.type !== TokenType.VARIABLE) {
        throw new ParseError("RANDOM requires a variable name starting with '$', e.g. RANDOM $angle 30 150", tok.line, tok.column);
      }
      const min = this.parseValue();
      const max = this.parseValue();
      if (min === undefined || max === undefined) {
        throw new ParseError("RANDOM requires two bounds, e.g. RANDOM $angle 30 150", tok.line, tok.column);
      }
      return { kind: "RANDOM", name: nameTok.value, min, max, line: tok.line, column: tok.column };
    }

    if (tok.type === TokenType.PRINT) {
      const value = this.parseValue();
      if (value === undefined) {
        throw new ParseError('PRINT requires a value, e.g. PRINT "hello" or PRINT $angle', tok.line, tok.column);
      }
      return { kind: "PRINT", value, line: tok.line, column: tok.column };
    }

    if (tok.type === TokenType.REPEAT) {
      const countTok = this.peek();
      let count: number | { kind: "VARIABLE_REF"; name: string };
      if (countTok.type === TokenType.NUMBER) {
        count = Number(this.advance().value);
      } else if (countTok.type === TokenType.VARIABLE) {
        count = { kind: "VARIABLE_REF", name: this.advance().value };
      } else {
        throw new ParseError("REPEAT requires a numeric or variable count, e.g. REPEAT 3 TIMES", tok.line, tok.column);
      }

      const timesTok = this.advance();
      if (timesTok.type !== TokenType.TIMES) {
        throw new ParseError("Expected TIMES after REPEAT's count, e.g. REPEAT 3 TIMES", timesTok.line, timesTok.column);
      }

      let asName = DEFAULT_LOOP_VAR_NAME;
      if (this.peek().type === TokenType.AS) {
        this.advance();
        const nameTok = this.advance();
        if (nameTok.type !== TokenType.VARIABLE) {
          throw new ParseError("AS requires a variable name starting with '$', e.g. REPEAT 3 TIMES AS $step", tok.line, tok.column);
        }
        asName = nameTok.value;
      }
      this.expectEndOfLine();

      this.depth++;
      if (this.depth > MAX_NESTING_DEPTH) {
        throw new ParseError(`REPEAT/IF blocks may only be nested ${MAX_NESTING_DEPTH} levels deep`, tok.line, tok.column);
      }
      const body = this.parseStatements(new Set([TokenType.END]));
      this.depth--;

      this.advance(); // consume END
      return { kind: "REPEAT", count, asName, body, line: tok.line, column: tok.column };
    }

    if (tok.type === TokenType.IF) {
      const left = this.parseValue();
      if (left === undefined) {
        throw new ParseError("IF requires a comparison, e.g. IF $x > 50", tok.line, tok.column);
      }
      const opTok = this.advance();
      const op = COMPARISON_OP_TOKENS[opTok.type];
      if (!op) {
        throw new ParseError("Expected a comparison operator (>, <, >=, <=, ==, !=) after IF's first value", opTok.line, opTok.column);
      }
      const right = this.parseValue();
      if (right === undefined) {
        throw new ParseError(`Expected a value after '${op}'`, this.peek().line, this.peek().column);
      }
      if (this.peek().type === TokenType.THEN) this.advance(); // optional, purely for readability
      this.expectEndOfLine();

      this.depth++;
      if (this.depth > MAX_NESTING_DEPTH) {
        throw new ParseError(`REPEAT/IF blocks may only be nested ${MAX_NESTING_DEPTH} levels deep`, tok.line, tok.column);
      }
      const thenBody = this.parseStatements(new Set([TokenType.ELSE, TokenType.END]));

      let elseBody: Statement[] | null = null;
      if (this.peek().type === TokenType.ELSE) {
        this.advance();
        this.expectEndOfLine();
        elseBody = this.parseStatements(new Set([TokenType.END]));
      }
      this.depth--;

      this.advance(); // consume END
      return { kind: "IF", left, op, right, thenBody, elseBody, line: tok.line, column: tok.column };
    }

    if (tok.type === TokenType.IDENT) {
      const arg = this.parseValue();
      return { kind: "COMMAND", name: tok.value, arg, line: tok.line, column: tok.column };
    }

    if (tok.type === TokenType.END) {
      throw new ParseError("Unexpected END with no matching REPEAT or IF", tok.line, tok.column);
    }
    if (tok.type === TokenType.ELSE) {
      throw new ParseError("Unexpected ELSE with no matching IF", tok.line, tok.column);
    }

    throw new ParseError(`Unexpected token '${tok.value}'`, tok.line, tok.column);
  }
}
