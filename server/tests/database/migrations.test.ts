import { describe, it, expect, vi } from "vitest";

// Each in-process Postgres takes a few seconds to boot; some tests boot two.
vi.setConfig({ testTimeout: 60_000 });
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Runs the REAL SQL (every migration, then schema.sql) on an in-process Postgres.
// pgvector isn't available for PGlite, so vector(N) becomes real[] and the HNSW index is dropped —
// neither touches the servo/gait tables this suite is about.
const DB = join(__dirname, "../../../database");
const shim = (sql: string) =>
  sql.replace(/CREATE EXTENSION IF NOT EXISTS vector;/g, "").replace(/vector\(\d+\)/g, "real[]").replace(/CREATE INDEX[^;]*USING hnsw[^;]*;/gs, "");
const mk = () => new PGlite({ extensions: { pgcrypto } });
const migrations = readdirSync(join(DB, "migrations")).filter((f) => f.endsWith(".sql")).sort();
const sql = (f: string) => readFileSync(join(DB, "migrations", f), "utf-8");
const cols = async (db: PGlite, t: string) =>
  (await db.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY 1`, [t])).rows.map((r) => r.column_name);

async function upgradedFromOldLayout() {
  const db = mk();
  for (const f of migrations.filter((m) => m < "0011")) await db.exec(shim(sql(f)));
  const robot = (await db.query<{ id: string }>(`INSERT INTO robots (robot_code, name) VALUES ('vision-001','Vision') RETURNING id`)).rows[0].id;
  // the original 4-servo layout, with some real calibration the user would not want to lose
  await db.query(
    `INSERT INTO servo_configurations (robot_id, servo_id, name, channel, servo_type, purpose, neutral_pwm, min_pwm, max_pwm, default_speed, min_angle, max_angle, center_angle, direction_inverted) VALUES
     ($1,'left-leg-rotation','Left Leg Rotation',0,'CONTINUOUS','LEFT_LEG_ROTATION',311,200,415,55,NULL,NULL,NULL,false),
     ($1,'left-leg-joint','Left Leg Joint',1,'POSITIONAL','LEFT_LEG_JOINT',NULL,NULL,NULL,NULL,0,180,90,false),
     ($1,'right-leg-rotation','Right Leg Rotation',2,'CONTINUOUS','RIGHT_LEG_ROTATION',303,205,409,50,NULL,NULL,NULL,true),
     ($1,'right-leg-joint','Right Leg Joint',3,'POSITIONAL','RIGHT_LEG_JOINT',NULL,NULL,NULL,NULL,0,180,90,false)`,
    [robot],
  );
  await db.exec(sql("0011_three_servo_layout.sql"));
  return db;
}

describe("migration 0011: 4 leg servos -> head + 2 legs", () => {
  it("upgrades an existing install: head on CH0, legs on CH1/CH2, calibration preserved", async () => {
    const db = await upgradedFromOldLayout();
    const rows = (await db.query<any>(`SELECT channel, purpose, servo_type, neutral_pwm, default_speed, direction_inverted, min_angle, max_angle, center_angle FROM servo_configurations ORDER BY channel`)).rows;
    expect(rows.map((r) => r.purpose)).toEqual(["HEAD", "LEFT_LEG", "RIGHT_LEG"]);
    expect(rows[0]).toMatchObject({ servo_type: "POSITIONAL", min_angle: 0, max_angle: 180, center_angle: 90 });
    expect(rows[1]).toMatchObject({ servo_type: "CONTINUOUS", neutral_pwm: 311, default_speed: 55 });
    expect(rows[2]).toMatchObject({ servo_type: "CONTINUOUS", neutral_pwm: 303, direction_inverted: true });
  });

  it("drops the joint-angle columns from gait_phases", async () => {
    const db = await upgradedFromOldLayout();
    const c = await cols(db, "gait_phases");
    expect(c).not.toContain("left_joint_angle");
    expect(c).not.toContain("right_joint_angle");
    expect(c).toContain("left_rotation_speed");
  });

  it("is safe to run twice", async () => {
    const db = await upgradedFromOldLayout();
    await db.exec(sql("0011_three_servo_layout.sql"));
    expect((await db.query<{ n: number }>(`SELECT count(*)::int n FROM servo_configurations`)).rows[0].n).toBe(3);
  });

  it("does not invent servo rows on an empty database (the seed does that)", async () => {
    const db = mk();
    for (const f of migrations) await db.exec(shim(sql(f)));
    expect((await db.query<{ n: number }>(`SELECT count(*)::int n FROM servo_configurations`)).rows[0].n).toBe(0);
  });
});

describe("schema.sql (fresh installs) matches the migration path", () => {
  it("defines the same tables and columns, apart from the one documented legacy column", async () => {
    const a = mk(); for (const f of migrations) await a.exec(shim(sql(f)));
    const b = mk(); await b.exec(shim(readFileSync(join(DB, "schema.sql"), "utf-8")));
    const tables = async (db: PGlite) => (await db.query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`)).rows.map((r) => r.table_name);
    expect(await tables(a)).toEqual(await tables(b));
    const drift: string[] = [];
    for (const t of await tables(b)) {
      // 0005 deliberately keeps person_faces.embedding_legacy_jsonb for audit; schema.sql has the final shape without it.
      const ca = (await cols(a, t)).filter((c) => !(t === "person_faces" && c === "embedding_legacy_jsonb"));
      const cb = await cols(b, t);
      if (JSON.stringify(ca) !== JSON.stringify(cb)) drift.push(t);
    }
    expect(drift).toEqual([]);
  });

  it("has the 3-servo gait shape (no joint angles)", async () => {
    const b = mk(); await b.exec(shim(readFileSync(join(DB, "schema.sql"), "utf-8")));
    expect(await cols(b, "gait_phases")).not.toContain("left_joint_angle");
  });
});
