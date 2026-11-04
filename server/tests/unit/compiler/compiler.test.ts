import { describe, it, expect } from "vitest";
import { Compiler } from "../../../src/compiler/Compiler";
import { formatDiagnostic } from "../../../src/compiler/diagnostics";

describe("Vision Script compiler", () => {
  it("TEST 16: invalid Vision Script -> compiler error", () => {
    const result = new Compiler().compile("NOT_A_REAL_COMMAND");
    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("TEST 17: valid Vision Script -> compiled safely", () => {
    const result = new Compiler().compile("EYE_CENTER\nWAIT 500\nWALK_FORWARD 1000\nWALK_STOP");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions.length).toBe(4);
  });

  it("supports a quoted string argument (e.g. AUDIO_SPEAK \"Hello\")", () => {
    const result = new Compiler().compile('AUDIO_SPEAK "Hello there"');
    expect(result.success).toBe(true);
    const exec = result.ir?.instructions[0];
    expect(exec).toMatchObject({ op: "EXEC", command: "AUDIO_SPEAK", arg: "Hello there" });
  });

  it("treats '#' inside a quoted string as literal, not a comment", () => {
    const result = new Compiler().compile('AUDIO_SPEAK "Room #5"');
    expect(result.success).toBe(true);
    expect(result.ir?.instructions[0]).toMatchObject({ arg: "Room #5" });
  });

  it("rejects more than one statement on the same line", () => {
    const result = new Compiler().compile("EYE_CENTER WALK_FORWARD");
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("PARSE_ERROR");
    expect(result.diagnostics[0].message).toMatch(/one statement is allowed per line/i);
  });

  it("rejects an unterminated string literal with a clear lex error", () => {
    const result = new Compiler().compile('AUDIO_SPEAK "unterminated');
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("LEX_ERROR");
    expect(result.diagnostics[0].message).toMatch(/unterminated string/i);
  });

  it("reports the real column of an unknown command, not a token-index counter", () => {
    // Two leading spaces before the command name — a real column should
    // reflect that offset, not just "how many tokens in".
    const result = new Compiler().compile("  BOGUS_COMMAND");
    expect(result.diagnostics[0].column).toBe(2);
  });

  it("reports the WAIT token's own column when its argument isn't numeric", () => {
    const result = new Compiler().compile("WAIT abc");
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].column).toBe(0);
  });

  it("rejects a WAIT duration outside the 0-60000ms range", () => {
    const result = new Compiler().compile("WAIT -5");
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("WAIT_OUT_OF_RANGE");
  });

  it("threads source line/column through to IR instructions", () => {
    const result = new Compiler().compile("EYE_CENTER\nWAIT 500");
    expect(result.ir?.instructions[0]).toMatchObject({ line: 1 });
    expect(result.ir?.instructions[1]).toMatchObject({ line: 2 });
  });

  it("sorts diagnostics by source position", () => {
    const result = new Compiler().compile("BOGUS_TWO\nBOGUS_ONE\nWAIT 999999");
    expect(result.diagnostics.map((d) => d.line)).toEqual([1, 2, 3]);
  });

  it("formatDiagnostic renders a caret pointing at the exact column", () => {
    const source = "  BOGUS_COMMAND";
    const result = new Compiler().compile(source);
    const formatted = formatDiagnostic(result.diagnostics[0], source);
    expect(formatted).toContain("1:3"); // 1-based line:column
    expect(formatted.split("\n")[2]).toBe("  " + " ".repeat(2) + "^");
  });

  it("formatDiagnostic degrades gracefully with no source provided", () => {
    const result = new Compiler().compile("BOGUS_COMMAND");
    const formatted = formatDiagnostic(result.diagnostics[0]);
    expect(formatted).not.toContain("^");
    expect(formatted).toMatch(/^1:1: error:/);
  });
});
