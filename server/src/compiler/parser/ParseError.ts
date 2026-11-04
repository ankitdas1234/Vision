export class ParseError extends Error {
  constructor(message: string, public line: number, public column: number) {
    super(message);
  }
}
