import { TokenType } from "./TokenType";
import type { Token } from "./Token";
import { LexError } from "./LexError";

/**
 * Tokenizes Vision Script source. Grammar is intentionally small and safe:
 * one command (+ optional numeric/string/variable arg) per line, plus
 * `SET name value` and `REPEAT n TIMES ... END` for bounded loops with
 * a compile-time-substituted loop variable. Everything is fully resolved
 * (loops unrolled, variables substituted) at compile time — see
 * ir/IRGenerator.ts — so there is still no runtime branching, no
 * unbounded loops, and no arbitrary code execution; a compiled script is
 * exactly as inspectable as it always was, just possibly longer.
 */
export class Lexer {
  private line = 1;

  tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    const lines = source.split("\n");

    lines.forEach((rawLine, idx) => {
      this.line = idx + 1;
      const { text: line } = this.stripComment(rawLine);

      let i = 0;
      // Column is the real 0-based character offset into the ORIGINAL
      // (pre-comment-stripped, pre-trim) line — not a per-token counter —
      // so diagnostics can point exactly at the offending text.
      while (i < line.length) {
        const ch = line[i];
        if (/\s/.test(ch)) {
          i++;
          continue;
        }

        if (ch === '"') {
          const start = i;
          const end = line.indexOf('"', i + 1);
          if (end === -1) {
            throw new LexError(`Unterminated string literal starting at column ${start + 1}`, this.line, start);
          }
          const value = line.slice(i + 1, end);
          tokens.push({ type: TokenType.STRING, value, line: this.line, column: start });
          i = end + 1;
          continue;
        }

        if (ch === "$") {
          const start = i;
          i++;
          const nameStart = i;
          while (i < line.length && !/\s/.test(line[i])) i++;
          const name = line.slice(nameStart, i);
          if (name.length === 0) {
            throw new LexError(`'$' must be followed by a variable name`, this.line, start);
          }
          tokens.push({ type: TokenType.VARIABLE, value: name.toUpperCase(), line: this.line, column: start });
          continue;
        }

        const start = i;
        while (i < line.length && !/\s/.test(line[i])) i++;
        const part = line.slice(start, i);
        const upper = part.toUpperCase();
        if (/^-?\d+(\.\d+)?$/.test(part)) {
          tokens.push({ type: TokenType.NUMBER, value: part, line: this.line, column: start });
        } else if (part === ">") {
          tokens.push({ type: TokenType.OP_GT, value: part, line: this.line, column: start });
        } else if (part === "<") {
          tokens.push({ type: TokenType.OP_LT, value: part, line: this.line, column: start });
        } else if (part === ">=") {
          tokens.push({ type: TokenType.OP_GTE, value: part, line: this.line, column: start });
        } else if (part === "<=") {
          tokens.push({ type: TokenType.OP_LTE, value: part, line: this.line, column: start });
        } else if (part === "==") {
          tokens.push({ type: TokenType.OP_EQ, value: part, line: this.line, column: start });
        } else if (part === "!=") {
          tokens.push({ type: TokenType.OP_NEQ, value: part, line: this.line, column: start });
        } else if (part === "+") {
          tokens.push({ type: TokenType.OP_PLUS, value: part, line: this.line, column: start });
        } else if (part === "-") {
          tokens.push({ type: TokenType.OP_MINUS, value: part, line: this.line, column: start });
        } else if (part === "*") {
          tokens.push({ type: TokenType.OP_TIMES_SIGN, value: part, line: this.line, column: start });
        } else if (part === "/") {
          tokens.push({ type: TokenType.OP_DIVIDE, value: part, line: this.line, column: start });
        } else if (upper === "WAIT") {
          tokens.push({ type: TokenType.WAIT, value: upper, line: this.line, column: start });
        } else if (upper === "SET") {
          tokens.push({ type: TokenType.SET, value: upper, line: this.line, column: start });
        } else if (upper === "REPEAT") {
          tokens.push({ type: TokenType.REPEAT, value: upper, line: this.line, column: start });
        } else if (upper === "TIMES") {
          tokens.push({ type: TokenType.TIMES, value: upper, line: this.line, column: start });
        } else if (upper === "AS") {
          tokens.push({ type: TokenType.AS, value: upper, line: this.line, column: start });
        } else if (upper === "END") {
          tokens.push({ type: TokenType.END, value: upper, line: this.line, column: start });
        } else if (upper === "IF") {
          tokens.push({ type: TokenType.IF, value: upper, line: this.line, column: start });
        } else if (upper === "THEN") {
          tokens.push({ type: TokenType.THEN, value: upper, line: this.line, column: start });
        } else if (upper === "ELSE") {
          tokens.push({ type: TokenType.ELSE, value: upper, line: this.line, column: start });
        } else if (upper === "PRINT") {
          tokens.push({ type: TokenType.PRINT, value: upper, line: this.line, column: start });
        } else if (upper === "RANDOM") {
          tokens.push({ type: TokenType.RANDOM, value: upper, line: this.line, column: start });
        } else {
          tokens.push({ type: TokenType.IDENT, value: upper, line: this.line, column: start });
        }
      }
      tokens.push({ type: TokenType.NEWLINE, value: "\\n", line: this.line, column: line.length });
    });

    tokens.push({ type: TokenType.EOF, value: "", line: this.line + 1, column: 0 });
    return tokens;
  }

  /** '#' starts a comment, unless it's inside a quoted string. Returns the
   * comment-stripped (but NOT trimmed) line so column offsets computed
   * against it still line up with the original source text. */
  private stripComment(line: string): { text: string; hadTrailingComment: boolean } {
    let inString = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') inString = !inString;
      else if (line[i] === "#" && !inString) return { text: line.slice(0, i), hadTrailingComment: true };
    }
    return { text: line, hadTrailingComment: false };
  }
}
