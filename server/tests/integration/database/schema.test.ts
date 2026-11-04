import { describe, it, expect } from "vitest";
import * as schema from "../../../src/database/schema";

describe("database schema", () => {
  it("exports all required tables", () => {
    const required = ["robots", "people", "observations", "staticMemories", "dynamicMemories", "conceptualMemories", "tasks", "commandHistory", "telemetry", "servoConfigurations", "gaitConfigurations", "gaitPhases", "adminRestrictions", "speechEvents"];
    for (const t of required) expect(schema).toHaveProperty(t);
  });
});
