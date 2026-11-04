/** Raised for lexical problems — malformed tokens the lexer can't even
 * turn into a valid token, as opposed to ParseError (a valid token
 * stream that doesn't form a valid statement). Kept as a separate class
 * so callers (Compiler.compile's catch block) can report a distinct
 * `LEX_ERROR` diagnostic code rather than lumping every failure under
 * one generic label. */
export class LexError extends Error {
  constructor(
    message: string,
    public line: number,
    public column: number,
  ) {
    super(message);
    this.name = "LexError";
  }
}
