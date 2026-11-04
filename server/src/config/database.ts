import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "./env";
import * as schema from "../database/schema";

/**
 * BUG FIX: this used to be `ssl: env.isProd ? {...} : false` — SSL was
 * tied to NODE_ENV, a deploy-environment concept, rather than to whether
 * the actual database being connected to needs it. That broke the very
 * common case of running the server locally (NODE_ENV=development, the
 * default) against a real remote managed database like Neon — Neon
 * requires SSL-only connections, so `ssl: false` there doesn't just skip
 * an optimization, it makes the connection fail outright. This is
 * exactly what would happen the moment DATABASE_URL is pointed at a real
 * Neon connection string for `npm run seed`/local dev without also
 * setting NODE_ENV=production (which nobody does for local work).
 *
 * Fixed: SSL is now based on whether DATABASE_URL itself points at
 * localhost/127.0.0.1 (a local Postgres, which typically isn't set up
 * with SSL certs) rather than the environment name. Any remote host —
 * Neon, Render, RDS, whatever — gets SSL automatically, in every
 * environment, local dev included.
 */
/** Exported purely so it's directly unit-testable without needing to
 * construct a real Pool/env each time — see tests/unit/config/database.test.ts. */
export function isLocalDatabaseUrl(databaseUrl: string): boolean {
  return /:\/\/[^@]*@(localhost|127\.0\.0\.1)([:/]|$)/.test(databaseUrl);
}

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: isLocalDatabaseUrl(env.DATABASE_URL) ? false : { rejectUnauthorized: false },
});
export const db = drizzle(pool, { schema });
