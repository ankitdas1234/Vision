import { describe, it, expect } from "vitest";
import { compiler } from "../../../src/compiler/Compiler";

describe("Vision Script compiler — FIND_PERSON / DANCE", () => {
  it("compiles FIND_PERSON with a quoted name", () => {
    const result = compiler.compile('FIND_PERSON "Sam"');
    expect(result.success).toBe(true);
    expect(result.ir?.instructions).toMatchObject([{ op: "EXEC", command: "FIND_PERSON", arg: "Sam" }]);
  });

  it("compiles DANCE with a numeric duration", () => {
    const result = compiler.compile("DANCE 20000");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions).toMatchObject([{ op: "EXEC", command: "DANCE", arg: 20000 }]);
  });

  it("compiles a bare DANCE with no argument", () => {
    const result = compiler.compile("DANCE");
    expect(result.success).toBe(true);
    expect(result.ir?.instructions).toMatchObject([{ op: "EXEC", command: "DANCE", arg: undefined }]);
  });

  it("compiles a script combining both", () => {
    const source = ['FIND_PERSON "Sam"', "WAIT 500", 'DANCE "energetic"'].join("\n");
    const result = compiler.compile(source);
    expect(result.success).toBe(true);
    expect(result.ir?.instructions).toMatchObject([
      { op: "EXEC", command: "FIND_PERSON", arg: "Sam" },
      { op: "SLEEP", ms: 500 },
      { op: "EXEC", command: "DANCE", arg: "energetic" },
    ]);
  });

  it("compiles SMART_DEVICE_TRIGGER with a quoted device name", () => {
    const result = compiler.compile('SMART_DEVICE_TRIGGER "living room lamp"');
    expect(result.success).toBe(true);
    expect(result.ir?.instructions).toMatchObject([{ op: "EXEC", command: "SMART_DEVICE_TRIGGER", arg: "living room lamp" }]);
  });

  it("still rejects a genuinely unknown command", () => {
    const result = compiler.compile("MOONWALK");
    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "UNKNOWN_COMMAND")).toBe(true);
  });
});
