import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { Compiler } from "../../src/compiler/Compiler";
import { COMMAND_TYPES } from "../../src/packages/types";

// Docs that lie are worse than no docs. These checks fail the build when the documentation and the code disagree.
const ROOT = join(__dirname, "../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf-8");

describe("docs/vision-script.md: every example actually compiles", () => {
  const md = read("docs/vision-script.md");
  const blocks = [...md.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]);
  // The IF "grammar" block is a syntax template with <placeholders>, not a runnable script.
  const runnable = blocks.filter((b) => !/<value>|<op>/.test(b));

  it("has a meaningful number of runnable examples", () => expect(runnable.length).toBeGreaterThanOrEqual(4));

  it.each(runnable.map((b, i) => [i + 1, b] as const))("example block %i compiles with no errors", (_i, src) => {
    const r = new Compiler().compile(src);
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(r.success).toBe(true);
  });
});

describe("dashboard Compiler page", () => {
  it("every sample script compiles", () => {
    const src = readFileSync(join(ROOT, "dashboard/src/pages/Compiler.jsx"), "utf-8");
    const block = src.match(/const SAMPLES = \{([\s\S]*?)\n\};/);
    expect(block).toBeTruthy();
    const samples = [...block![1].matchAll(/`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1]);
    expect(samples.length).toBeGreaterThanOrEqual(3);
    for (const sample of samples) {
      const r = new Compiler().compile(sample);
      expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(r.success).toBe(true);
    }
  });
});

describe("docs/commands.md lists every command, and only real ones", () => {
  const md = read("docs/commands.md");
  const documented = new Set([...md.matchAll(/^\|\s*`([A-Z0-9_]+)`/gm)].map((m) => m[1]));
  it("every command type is documented", () => expect(COMMAND_TYPES.filter((c) => !documented.has(c))).toEqual([]));
  it("nothing documented is a command that doesn't exist (e.g. the removed joint commands)", () =>
    expect([...documented].filter((c) => !(COMMAND_TYPES as readonly string[]).includes(c))).toEqual([]));
});

describe("file references in the docs point at files that exist", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      if (["node_modules", "dist", ".git"].includes(f)) continue;
      const p = join(dir, f);
      statSync(p).isDirectory() ? walk(p) : files.push(p);
    }
  };
  walk(ROOT);
  const mdFiles = ["README.md", "database/README.md", ...readdirSync(join(ROOT, "docs")).map((f) => `docs/${f}`)].filter((f) => f.endsWith(".md"));
  const exts = "ts|tsx|js|jsx|mjs|cpp|h|ino|sql|md|json|yml|yaml|html|css|obj|ini";
  const re = new RegExp("`((?:[A-Za-z0-9_.\\-\\[\\]]+/)+[A-Za-z0-9_.\\-\\[\\]]+\\.(?:" + exts + "))`", "g");

  it.each(mdFiles)("%s", (md) => {
    const broken: string[] = [];
    for (const m of read(md).matchAll(re)) {
      const ref = m[1].replace(/^\.?\//, "");
      if (ref.startsWith("api/")) continue;
      if (!existsSync(join(ROOT, ref)) && !files.some((f) => f.endsWith("/" + ref))) broken.push(ref);
    }
    expect(broken).toEqual([]);
  });
});

describe("calibration settings named in the docs really exist", () => {
  const trees = ["firmware/esp32-cam/src/config/servo_config.h", "firmware/esp32-cam-arduino/servo_config.h"];
  const documented = ["EYE_MIN_ANGLE", "EYE_MAX_ANGLE", "EYE_CENTER_ANGLE", "LEFT_LEG_NEUTRAL_PWM", "RIGHT_LEG_NEUTRAL_PWM",
    "LEFT_LEG_INVERTED", "RIGHT_LEG_INVERTED", "CONTINUOUS_MIN_PWM", "CONTINUOUS_MAX_PWM", "HEAD_MAX_DEG_PER_SEC",
    "HEAD_SCAN_MIN_ANGLE", "HEAD_SCAN_MAX_ANGLE"];
  it.each(trees)("%s defines every setting that docs/servo-system.md and docs/hardware.md tell you to change", (f) => {
    const h = read(f);
    expect(documented.filter((name) => !new RegExp(`#define\\s+${name}\\b`).test(h))).toEqual([]);
  });
  it("those docs actually mention each of them (so this list can't silently go stale)", () => {
    const docs = read("docs/servo-system.md") + read("docs/hardware.md");
    expect(documented.filter((name) => !docs.includes(name))).toEqual([]);
  });
  it("the head speed is the same number on the server and in the firmware", () => {
    const fw = read("firmware/esp32-cam/src/config/servo_config.h").match(/#define\s+HEAD_MAX_DEG_PER_SEC\s+(\d+)/)![1];
    const srv = read("server/src/servos/ServoConfiguration.ts").match(/HEAD_MAX_DEG_PER_SEC\s*=\s*(\d+)/)![1];
    expect(srv).toBe(fw);
  });
  it("the docs don't claim a servo calibration API or page exists", () => {
    const all = ["docs/servo-system.md", "docs/gait.md", "docs/hardware.md"].map(read).join("\n");
    expect(all).not.toMatch(/override via the calibration API|dashboard calibration/i);
  });
});
