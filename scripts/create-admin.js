#!/usr/bin/env node
/**
 * Generates a ready-to-paste SQL statement for creating (or resetting) an
 * ADMIN user directly in Neon — no app deployment, no seed script, no
 * plaintext password ever touching the database or a repo.
 *
 * Why this exists:
 *   The 6 admin accounts aren't self-registered (the public /auth/register
 *   route always creates role=USER — see server/src/auth/AuthService.ts).
 *   Admins are provisioned by whoever holds DB access, straight into Neon's
 *   SQL editor. This script does the one part that can't safely happen in
 *   the SQL editor itself: bcrypt-hashing the password with the exact same
 *   algorithm + cost factor the app's login route verifies against
 *   (server/src/auth/PasswordService.ts — bcrypt, 12 rounds).
 *
 * Usage:
 *   node scripts/create-admin.js
 *     -> interactive prompts, password input is hidden while typing.
 *
 *   node scripts/create-admin.js --name "Priya Sharma" --email priya@company.com
 *     -> prompts only for the password (still hidden).
 *
 * The script only ever prints SQL to your terminal. It does not connect to
 * any database and does not write the password or hash to disk or history.
 * Copy the printed statement into Neon's SQL Editor and run it there.
 */

const readline = require("node:readline");
const crypto = require("node:crypto");

let bcrypt;
try {
  bcrypt = require("bcryptjs");
} catch {
  console.error(
    "\nbcryptjs isn't installed at the repo root yet.\n" +
    "This script runs from the repo root, not from server/ — installing\n" +
    "bcryptjs inside server/node_modules (e.g. via `cd server && npm install`)\n" +
    "does NOT fix this, since Node won't resolve into a sibling folder's\n" +
    "node_modules from here. Run this instead, from the repo root:\n\n" +
    "  npm install\n\n" +
    "then re-run this script.\n"
  );
  process.exit(1);
}

const SALT_ROUNDS = 12; // must match server/src/auth/PasswordService.ts

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

// Hides input as the user types (no echoed asterisks, just nothing — simplest
// approach that avoids extra deps and still keeps the password off the visible screen).
// Falls back to plain (visible) input if stdin isn't a real TTY — raw mode
// only exists on an actual interactive terminal; piping input in (or some
// restricted/non-interactive shells) would otherwise throw
// "stdin.setRawMode is not a function" instead of just working, less securely.
function askHidden(question) {
  if (!process.stdin.isTTY) {
    console.warn("(stdin isn't an interactive terminal — password will be visible as you type)");
    return ask(question);
  }
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.resume();
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    let input = "";
    const onData = (char) => {
      if (char === "\n" || char === "\r" || char === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(input.trim());
        return;
      }
      if (char === "\u0003") { process.exit(1); } // Ctrl+C
      if (char === "\u007f") { input = input.slice(0, -1); return; } // backspace
      input += char;
    };
    stdin.on("data", onData);
  });
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (key) out[key] = argv[i + 1];
  }
  return out;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function passwordIssues(pw) {
  const issues = [];
  if (pw.length < 12) issues.push("at least 12 characters (this is an admin account — hold it to a higher bar than the 8-char user minimum)");
  if (!/[A-Z]/.test(pw)) issues.push("an uppercase letter");
  if (!/[a-z]/.test(pw)) issues.push("a lowercase letter");
  if (!/[0-9]/.test(pw)) issues.push("a digit");
  return issues;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let name = args.name;
  while (!name) {
    name = await ask("Admin full name: ");
    if (!name) console.log("  Name can't be empty.");
  }

  let email = args.email;
  while (!email || !isValidEmail(email)) {
    email = await ask("Admin email: ");
    if (!isValidEmail(email)) console.log("  That doesn't look like a valid email.");
  }
  email = email.toLowerCase();

  let password = args.password;
  while (true) {
    if (!password) password = await askHidden("Admin password (input hidden): ");
    const issues = passwordIssues(password);
    if (issues.length === 0) break;
    console.log(`  Password needs: ${issues.join(", ")}.`);
    password = null;
  }

  let confirm = args.password ? password : await askHidden("Confirm password (input hidden): ");
  if (confirm !== password) {
    console.error("\nPasswords didn't match. Nothing was generated — run the script again.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const nameEscaped = name.replace(/'/g, "''");
  const emailEscaped = email.replace(/'/g, "''");

  const sql = `-- Admin account for ${nameEscaped} <${emailEscaped}>
-- Generated ${new Date().toISOString()} — safe to run more than once (idempotent upsert).
-- Paste into Neon's SQL Editor and run.
INSERT INTO users (name, email, password_hash, role, is_verified, is_active)
VALUES ('${nameEscaped}', '${emailEscaped}', '${passwordHash}', 'ADMIN', TRUE, TRUE)
ON CONFLICT (email) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    role = 'ADMIN',
    is_active = TRUE,
    updated_at = now();`;

  console.log("\n" + "=".repeat(72));
  console.log("Copy everything between the lines into Neon's SQL Editor and run it:");
  console.log("=".repeat(72) + "\n");
  console.log(sql);
  console.log("\n" + "=".repeat(72));
  console.log(`Done. ${emailEscaped} can now log in at /login with the password you just entered.`);
  console.log("The plaintext password was never written to disk — store it in your team's");
  console.log("password manager now, this terminal won't show it again.");
  console.log("=".repeat(72) + "\n");
}

main();
