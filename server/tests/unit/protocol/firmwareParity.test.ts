import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PHYSICALLY_DELIVERABLE_COMMANDS, COMMAND_PARAM_SCHEMAS } from "../../../src/packages/commands";

// Contract test: every command the server sends to the robot must be understood by the firmware,
// in BOTH firmware trees (PlatformIO + the flat Arduino mirror). A command the firmware doesn't
// handle is silently dropped on a real robot while the simulator happily runs it.
const fw = (p: string) => readFileSync(join(__dirname, "../../../../firmware", p), "utf-8");
const trees = [
  { name: "PlatformIO", types: "esp32-cam/src/protocol/CommandTypes.h", parser: "esp32-cam/src/protocol/MessageParser.cpp", proto: "esp32-cam/src/protocol/CommandProtocol.cpp" },
  { name: "Arduino mirror", types: "esp32-cam-arduino/CommandTypes.h", parser: "esp32-cam-arduino/MessageParser.cpp", proto: "esp32-cam-arduino/CommandProtocol.cpp" },
];

describe.each(trees)("server <-> firmware command parity ($name)", (t) => {
  const types = fw(t.types), parser = fw(t.parser), proto = fw(t.proto);
  const enumBody = types.slice(types.indexOf("enum class RobotCommand"));
  const enumNames = new Set([...enumBody.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)].map((m) => m[1]));
  const parsed = new Set([...parser.matchAll(/strcmp\(name, "([A-Z0-9_]+)"\)/g)].map((m) => m[1]));
  const handled = new Set([...proto.matchAll(/case RobotCommand::([A-Z0-9_]+):/g)].map((m) => m[1]));

  it("every command the server delivers is a firmware enum value", () => {
    const missing = [...PHYSICALLY_DELIVERABLE_COMMANDS].filter((c) => !enumNames.has(c));
    expect(missing).toEqual([]);
  });

  it("every command the server delivers is parsed by the firmware", () => {
    const missing = [...PHYSICALLY_DELIVERABLE_COMMANDS].filter((c) => !parsed.has(c));
    expect(missing).toEqual([]);
  });

  it("every command the server delivers has a handler in CommandProtocol::dispatch", () => {
    const missing = [...PHYSICALLY_DELIVERABLE_COMMANDS].filter((c) => !handled.has(c));
    expect(missing).toEqual([]);
  });

  it("the firmware doesn't parse or handle commands the server no longer has (e.g. the removed joint commands)", () => {
    const known = new Set(Object.keys(COMMAND_PARAM_SCHEMAS));
    expect([...parsed].filter((c) => !known.has(c))).toEqual([]);
    expect([...handled].filter((c) => c !== "UNKNOWN" && !known.has(c))).toEqual([]);
  });
});

describe("server <-> firmware parameter names", () => {
  it("the firmware reads every numeric parameter name the server's movement/head schemas use", () => {
    const poller = fw("esp32-cam/src/protocol/CommandPoller.cpp");
    for (const key of ["angle", "targetAngle", "speed", "durationMs", "step"]) {
      expect(poller).toContain(`params["${key}"]`);
    }
  });
});
