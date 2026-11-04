export type { Diagnostic } from "./semantic/SemanticAnalyzer";
import type { Diagnostic } from "./semantic/SemanticAnalyzer";

/**
 * Formats a single diagnostic the way a normal compiler CLI would —
 * `line:column: severity: message` plus a caret pointing at the exact
 * offending column when the source is available. Used by anything
 * presenting compile results to a human (dashboard Compiler page's
 * terminal widget, a future CLI) instead of each caller re-inventing
 * its own rendering of the same Diagnostic shape.
 */
export function formatDiagnostic(diagnostic: Diagnostic, source?: string): string {
  const location = `${diagnostic.line}:${diagnostic.column + 1}`;
  const header = `${location}: ${diagnostic.severity}: ${diagnostic.message}`;
  if (!source) return header;

  const sourceLine = source.split("\n")[diagnostic.line - 1];
  if (sourceLine === undefined) return header;

  const caretLine = " ".repeat(diagnostic.column) + "^";
  return `${header}\n  ${sourceLine}\n  ${caretLine}`;
}

/** Formats a whole diagnostics list, one block per diagnostic, in the
 * order given — callers that want source-position order should sort
 * first (SemanticAnalyzer.analyze already does for its own output). */
export function formatDiagnostics(diagnostics: Diagnostic[], source?: string): string {
  return diagnostics.map((d) => formatDiagnostic(d, source)).join("\n\n");
}
