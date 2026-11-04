import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard for a real incident: every router in server/src/routes
 * is mounted flat on /api (see index.ts — none of them get their own path
 * prefix at the app level; each route string carries its own full path
 * instead). Because of that flat mounting, a bare `someRouter.use(requireAuth)`
 * — with NO path argument — matches every request that reaches that router,
 * not just its own routes. Since Express dispatches into every mounted
 * router in order until one responds, an earlier router's unscoped auth
 * middleware can reject requests meant for a completely different, later
 * router before they ever get there.
 *
 * This silently broke, in production terms: the public uptime health check
 * (GET /api/system/health — the exact path Render's own healthCheckPath
 * pings), the real ESP32-CAM's heartbeat (POST /api/heartbeat, robot-secret
 * authed, no user session), and the audio conversation-turn endpoint — all
 * returned 401 "Login required" instead of working, because they were
 * intercepted by an unrelated, earlier-mounted router's blanket
 * `.use(requireAuth)`.
 *
 * The fix was scoping every such call to its own router's actual path
 * prefix (e.g. `audioRouter.use("/audio", requireAuth)`). This test parses
 * every route file and fails if that pattern regresses — i.e. if a
 * `.use(...)` call that includes an auth-checking function is ever
 * registered again without an explicit string path as its first argument.
 */
describe("route auth middleware must be path-scoped (no cross-router leakage)", () => {
  const routesDir = join(__dirname, "../../../src/routes");
  const files = readdirSync(routesDir).filter((f) => f.endsWith(".routes.ts"));

  // Matches `xyzRouter.use(` followed by anything that is NOT a string literal
  // as the first argument (i.e. no path scoping) — and where the arguments
  // reference one of the auth-checking helpers.
  const bareAuthUsePattern = /\w*Router\.use\(\s*(require\w+)/;

  it("found route files to check (sanity — a zero-file result would make every other assertion vacuous)", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const file of files) {
    it(`${file}: no unscoped auth middleware (.use(requireX...) without a leading path string)`, () => {
      const source = readFileSync(join(routesDir, file), "utf-8");
      const lines = source.split("\n");
      const offenders = lines.filter((line) => bareAuthUsePattern.test(line));
      expect(offenders).toEqual([]);
    });
  }
});

describe("object profiles are ADMIN-only", () => {
  it("objects.routes.ts guards /objects with requireRole(\"ADMIN\")", () => {
    const source = readFileSync(join(__dirname, "../../../src/routes/objects.routes.ts"), "utf-8");
    expect(source).toMatch(/objectsRouter\.use\("\/objects",\s*requireAuth,\s*requireRole\("ADMIN"\)\)/);
  });
});
