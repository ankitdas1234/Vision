import { describe, it, expect } from "vitest";
import { isLocalDatabaseUrl } from "../../../src/config/database";

describe("isLocalDatabaseUrl", () => {
  it("treats localhost as local (no SSL)", () => {
    expect(isLocalDatabaseUrl("postgresql://vision:vision@localhost:5432/vision")).toBe(true);
  });

  it("treats 127.0.0.1 as local (no SSL)", () => {
    expect(isLocalDatabaseUrl("postgresql://vision:vision@127.0.0.1:5432/vision")).toBe(true);
  });

  it("REGRESSION: treats a real Neon connection string as remote (needs SSL) regardless of NODE_ENV", () => {
    expect(isLocalDatabaseUrl("postgresql://user:pass@ep-cool-name-123456.us-east-2.aws.neon.tech/vision?sslmode=require")).toBe(false);
  });

  it("treats any other remote host as remote (needs SSL) — Render, RDS, whatever", () => {
    expect(isLocalDatabaseUrl("postgresql://user:pass@my-db.render.com:5432/vision")).toBe(false);
    expect(isLocalDatabaseUrl("postgresql://user:pass@mydb.abc123.us-east-1.rds.amazonaws.com:5432/vision")).toBe(false);
  });

  it("does not get fooled by 'localhost' or '127.0.0.1' appearing elsewhere in the string (e.g. a password or db name), only the actual host", () => {
    expect(isLocalDatabaseUrl("postgresql://localhost:localhost@real-remote-host.neon.tech/vision")).toBe(false);
  });
});
