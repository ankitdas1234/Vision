import { describe, it, expect } from "vitest";
import { Compiler } from "../../../src/compiler/Compiler";
import { MAX_NESTING_DEPTH } from "../../../src/compiler/limits";

describe("Vision Script — IF branching", () => {
  it("emits only the THEN branch's instructions when the comparison is true", () => {
    const result = new Compiler().compile("IF 10 > 5\nWALK_FORWARD\nEND");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions).toHaveLength(1);
    expect(result.ir?.instructions[0]).toMatchObject({ command: "WALK_FORWARD" });
  });

  it("emits nothing when the comparison is false and there's no ELSE", () => {
    const result = new Compiler().compile("IF 5 > 10\nWALK_FORWARD\nEND");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions).toHaveLength(0);
  });

  it("emits the ELSE branch when the comparison is false", () => {
    const result = new Compiler().compile("IF 5 > 10\nWALK_FORWARD\nELSE\nWALK_BACKWARD\nEND");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions[0]).toMatchObject({ command: "WALK_BACKWARD" });
  });

  it("supports all six comparison operators correctly", () => {
    const cases: [string, boolean][] = [
      ["5 > 3", true], ["3 > 5", false],
      ["3 < 5", true], ["5 < 3", false],
      ["5 >= 5", true], ["4 >= 5", false],
      ["5 <= 5", true], ["6 <= 5", false],
      ["5 == 5", true], ["5 == 6", false],
      ["5 != 6", true], ["5 != 5", false],
    ];
    for (const [cmp, expected] of cases) {
      const result = new Compiler().compile(`IF ${cmp}\nWALK_FORWARD\nEND`);
      expect(result.success).toBe(true);
      expect(result.ir?.instructions.length === 1).toBe(expected);
    }
  });

  it("supports the optional THEN keyword", () => {
    const result = new Compiler().compile("IF 10 > 5 THEN\nWALK_FORWARD\nEND");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions).toHaveLength(1);
  });

  it("branches differently per loop iteration using the loop's own index", () => {
    const result = new Compiler().compile("REPEAT 4 TIMES\nIF $I >= 2\nWALK_FORWARD\nELSE\nWALK_BACKWARD\nEND\nEND");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions.map((i) => (i as { command: string }).command)).toEqual(["WALK_BACKWARD", "WALK_BACKWARD", "WALK_FORWARD", "WALK_FORWARD"]);
  });

  it("supports string equality comparisons", () => {
    const result = new Compiler().compile('SET $name "Sam"\nIF $name == "Sam"\nAUDIO_SPEAK "hi Sam"\nEND');
    expect(result.success).toBe(true);
    expect(result.ir?.instructions).toHaveLength(1);
  });

  it("rejects ordering comparisons (< >) on strings", () => {
    const result = new Compiler().compile('SET $name "Sam"\nIF $name > "Sam"\nWALK_FORWARD\nEND');
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("TYPE_MISMATCH");
  });

  it("rejects comparing a number to a string", () => {
    const result = new Compiler().compile('SET $x 5\nIF $x == "5"\nWALK_FORWARD\nEND');
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("TYPE_MISMATCH");
  });

  it("rejects an IF with no matching END", () => {
    const result = new Compiler().compile("IF 5 > 3\nWALK_FORWARD");
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("PARSE_ERROR");
  });

  it("rejects an ELSE with no matching IF", () => {
    const result = new Compiler().compile("WALK_FORWARD\nELSE\nEND");
    expect(result.success).toBe(false);
  });

  it("supports nested IF blocks", () => {
    const result = new Compiler().compile("IF 10 > 5\nIF 3 > 1\nWALK_FORWARD\nEND\nEND");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions).toHaveLength(1);
  });

  it("rejects IF/REPEAT nesting deeper than MAX_NESTING_DEPTH combined", () => {
    let source = "";
    for (let i = 0; i < MAX_NESTING_DEPTH + 1; i++) source += "IF 1 == 1\n";
    source += "WALK_FORWARD\n";
    for (let i = 0; i < MAX_NESTING_DEPTH + 1; i++) source += "END\n";
    const result = new Compiler().compile(source);
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].message).toMatch(/nested/i);
  });

  it("validates both branches structurally even though only one runs", () => {
    const result = new Compiler().compile("IF 1 == 1\nWALK_FORWARD\nELSE\nBOGUS_COMMAND\nEND");
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("UNKNOWN_COMMAND");
  });
});

describe("Vision Script — arithmetic expressions in SET", () => {
  it("adds two numbers", () => {
    const result = new Compiler().compile("SET $x 2 + 3\nEYE_SET $x");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions[0]).toMatchObject({ arg: 5 });
  });

  it("evaluates a chain left to right with no precedence", () => {
    const result = new Compiler().compile("SET $x 2 + 3 * 2\nEYE_SET $x");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions[0]).toMatchObject({ arg: 10 });
  });

  it("supports subtraction and division", () => {
    const result = new Compiler().compile("SET $x 20 - 4\nSET $y 20 / 4\nEYE_SET $x\nEYE_SET $y");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions[0]).toMatchObject({ arg: 16 });
    expect(result.ir?.instructions[1]).toMatchObject({ arg: 5 });
  });

  it("concatenates two strings with +", () => {
    const result = new Compiler().compile('SET $greeting "Hello " + "there"\nAUDIO_SPEAK $greeting');
    expect(result.success).toBe(true);
    expect(result.ir?.instructions[0]).toMatchObject({ arg: "Hello there" });
  });

  it("uses variables as operands", () => {
    const result = new Compiler().compile("SET $a 10\nSET $b 5\nSET $sum $a + $b\nEYE_SET $sum");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions[0]).toMatchObject({ arg: 15 });
  });

  it("varies per loop iteration when using the loop index", () => {
    const result = new Compiler().compile("REPEAT 3 TIMES\nSET $angle $I * 10\nEYE_SET $angle\nEND");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions.map((i) => (i as { arg: number }).arg)).toEqual([0, 10, 20]);
  });

  it("rejects subtracting a string from a number", () => {
    const result = new Compiler().compile('SET $x 5 - "abc"');
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("TYPE_MISMATCH");
  });

  it("rejects division by a literal zero at compile time", () => {
    const result = new Compiler().compile("SET $x 5 / 0");
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("DIVIDE_BY_ZERO");
  });

  it("rejects division by zero that only becomes zero via a loop index", () => {
    const result = new Compiler().compile("REPEAT 3 TIMES\nSET $x 5 / $I\nEND");
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("COMPILE_LIMIT_EXCEEDED");
  });
});

describe("Vision Script — PRINT", () => {
  it("compiles to a LOG instruction, never touching CommandRegistry", () => {
    const result = new Compiler().compile('PRINT "hello"');
    expect(result.success).toBe(true);
    expect(result.ir?.instructions[0]).toMatchObject({ op: "LOG", message: "hello" });
  });

  it("stringifies a numeric value", () => {
    const result = new Compiler().compile("SET $x 42\nPRINT $x");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions[0]).toMatchObject({ op: "LOG", message: "42" });
  });

  it("requires an argument", () => {
    const result = new Compiler().compile("PRINT");
    expect(result.success).toBe(false);
  });
});

describe("Vision Script — RANDOM", () => {
  it("assigns a value within the requested bounds", () => {
    const result = new Compiler().compile("RANDOM $angle 30 150\nEYE_SET $angle");
    expect(result.success).toBe(true);
    const arg = (result.ir?.instructions[0] as { arg: number }).arg;
    expect(arg).toBeGreaterThanOrEqual(30);
    expect(arg).toBeLessThanOrEqual(150);
  });

  it("supports min === max (always that exact value)", () => {
    const result = new Compiler().compile("RANDOM $x 7 7\nEYE_SET $x");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions[0]).toMatchObject({ arg: 7 });
  });

  it("rejects min greater than max", () => {
    const result = new Compiler().compile("RANDOM $x 100 10\nEYE_SET $x");
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe("RANDOM_RANGE_INVALID");
  });

  it("can vary the value used across loop iterations", () => {
    const result = new Compiler().compile("REPEAT 5 TIMES\nRANDOM $angle 0 180\nEYE_SET $angle\nEND");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions).toHaveLength(5);
    for (const instr of result.ir!.instructions) {
      const arg = (instr as { arg: number }).arg;
      expect(arg).toBeGreaterThanOrEqual(0);
      expect(arg).toBeLessThanOrEqual(180);
    }
  });
});
