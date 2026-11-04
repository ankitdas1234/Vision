import { describe, it, expect } from "vitest";
import { Compiler } from "../../../src/compiler/Compiler";
import { MAX_REPEAT_COUNT, MAX_NESTING_DEPTH, MAX_TOTAL_INSTRUCTIONS } from "../../../src/compiler/limits";

describe("Vision Script — variables (SET)", () => {
  it("compiles a variable used as a command argument", () => {
    const result = new Compiler().compile("SET $angle 90\nEYE_SET $angle");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions[0]).toMatchObject({ op: "EXEC", command: "EYE_SET", arg: 90 });
  });

  it("compiles a variable used in WAIT", () => {
    const result = new Compiler().compile("SET $delay 250\nWAIT $delay");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions[0]).toMatchObject({ op: "SLEEP", ms: 250 });
  });

  it("supports string variables", () => {
    const result = new Compiler().compile('SET $greeting "Hello there"\nAUDIO_SPEAK $greeting');
    expect(result.success).toBe(true);
    expect(result.ir?.instructions[0]).toMatchObject({ arg: "Hello there" });
  });

  it("rejects a reference to an undeclared variable", () => {
    const result = new Compiler().compile("EYE_SET $angle");
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("UNDECLARED_VARIABLE");
  });

  it("rejects using a string variable where WAIT needs a number", () => {
    const result = new Compiler().compile('SET $name "Sam"\nWAIT $name');
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("TYPE_MISMATCH");
  });

  it("still enforces WAIT's range even when the value comes from a variable", () => {
    const result = new Compiler().compile("SET $delay 999999\nWAIT $delay");
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("WAIT_OUT_OF_RANGE");
  });

  it("allows redeclaring a variable with a new value", () => {
    const result = new Compiler().compile("SET $angle 10\nSET $angle 170\nEYE_SET $angle");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions[0]).toMatchObject({ arg: 170 });
  });

  it("requires SET's name to start with '$'", () => {
    const result = new Compiler().compile("SET angle 90");
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("PARSE_ERROR");
  });
});

describe("Vision Script — loops (REPEAT)", () => {
  it("unrolls a simple REPEAT into the real repeated instructions", () => {
    const result = new Compiler().compile("REPEAT 3 TIMES\nWALK_FORWARD\nEND");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions).toHaveLength(3);
    expect(result.ir?.instructions.every((i) => i.op === "EXEC" && i.command === "WALK_FORWARD")).toBe(true);
  });

  it("exposes the 0-based loop index as $I inside the body", () => {
    const result = new Compiler().compile("REPEAT 3 TIMES\nEYE_SET $I\nEND");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions.map((i) => (i as { arg: number }).arg)).toEqual([0, 1, 2]);
  });

  it("supports a custom loop-variable name via AS", () => {
    const result = new Compiler().compile("REPEAT 2 TIMES AS $step\nEYE_SET $step\nEND");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions.map((i) => (i as { arg: number }).arg)).toEqual([0, 1]);
  });

  it("supports nested REPEAT blocks, each with its own index variable", () => {
    const result = new Compiler().compile("REPEAT 2 TIMES AS $outer\nREPEAT 2 TIMES AS $inner\nEYE_SET $inner\nEND\nEND");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions).toHaveLength(4);
    expect(result.ir?.instructions.map((i) => (i as { arg: number }).arg)).toEqual([0, 1, 0, 1]);
  });

  it("an inner loop can use its own AND an outer loop's index", () => {
    // Outer index doubles as a per-outer-iteration multiplier here —
    // proves outer scope stays visible inside the nested loop body.
    const result = new Compiler().compile("REPEAT 2 TIMES AS $outer\nREPEAT 2 TIMES AS $inner\nWAIT $outer\nEND\nEND");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions.map((i) => (i as { ms: number }).ms)).toEqual([0, 0, 1, 1]);
  });

  it("rejects a REPEAT count of 0", () => {
    const result = new Compiler().compile("REPEAT 0 TIMES\nWALK_FORWARD\nEND");
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("REPEAT_COUNT_OUT_OF_RANGE");
  });

  it("rejects a REPEAT count above the configured max", () => {
    const result = new Compiler().compile(`REPEAT ${MAX_REPEAT_COUNT + 1} TIMES\nWALK_FORWARD\nEND`);
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("REPEAT_COUNT_OUT_OF_RANGE");
  });

  it("accepts a REPEAT count exactly at the configured max", () => {
    const result = new Compiler().compile(`REPEAT ${MAX_REPEAT_COUNT} TIMES\nWALK_STOP\nEND`);
    expect(result.success).toBe(true);
    expect(result.ir?.instructions).toHaveLength(MAX_REPEAT_COUNT);
  });

  it("rejects a REPEAT with no matching END", () => {
    const result = new Compiler().compile("REPEAT 3 TIMES\nWALK_FORWARD");
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("PARSE_ERROR");
    expect(result.diagnostics[0].message).toMatch(/missing END/i);
  });

  it("rejects an END with no matching REPEAT", () => {
    const result = new Compiler().compile("WALK_FORWARD\nEND");
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("PARSE_ERROR");
  });

  it("rejects nesting deeper than MAX_NESTING_DEPTH", () => {
    let source = "";
    for (let i = 0; i < MAX_NESTING_DEPTH + 1; i++) source += `REPEAT 1 TIMES\n`;
    source += "WALK_FORWARD\n";
    for (let i = 0; i < MAX_NESTING_DEPTH + 1; i++) source += "END\n";
    const result = new Compiler().compile(source);
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].message).toMatch(/nested/i);
  });

  it("rejects a script that would exceed MAX_TOTAL_INSTRUCTIONS once unrolled", () => {
    // MAX_REPEAT_COUNT^2 comfortably exceeds MAX_TOTAL_INSTRUCTIONS with
    // two nested full-size loops.
    const source = `REPEAT ${MAX_REPEAT_COUNT} TIMES\nREPEAT ${MAX_REPEAT_COUNT} TIMES\nWALK_FORWARD\nEND\nEND`;
    const result = new Compiler().compile(source);
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("COMPILE_LIMIT_EXCEEDED");
  });

  it("supports a REPEAT count driven by a variable", () => {
    const result = new Compiler().compile("SET $n 4\nREPEAT $n TIMES\nWALK_FORWARD\nEND");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions).toHaveLength(4);
  });

  it("mixes plain statements before, inside, and after a loop correctly", () => {
    const result = new Compiler().compile("EYE_CENTER\nREPEAT 2 TIMES\nWALK_FORWARD\nEND\nWALK_STOP");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions.map((i) => (i as { command: string }).command)).toEqual(["EYE_CENTER", "WALK_FORWARD", "WALK_FORWARD", "WALK_STOP"]);
  });
});
