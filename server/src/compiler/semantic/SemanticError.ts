export class SemanticError extends Error {
  constructor(message: string, public line: number) { super(message); }
}
