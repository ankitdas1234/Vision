/** Raised when a script is valid syntactically/semantically on its own,
 * but expands (after loop unrolling) into something too large, or a
 * loop-varying value turns out to be out of range on some iteration —
 * things that can only be discovered once the IR generator actually
 * walks the unrolled program. Kept distinct from SemanticError so
 * Compiler.compile can report a clear COMPILE_LIMIT_EXCEEDED code. */
export class CompileLimitError extends Error {
  constructor(
    message: string,
    public line: number,
    public column: number,
  ) {
    super(message);
    this.name = "CompileLimitError";
  }
}
