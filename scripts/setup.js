#!/usr/bin/env node
// Installs server + dashboard dependencies and copies .env.example -> .env if missing.
const { execSync } = require("node:child_process");
const fs = require("node:fs");

if (!fs.existsSync(".env")) {
  fs.copyFileSync(".env.example", ".env");
  console.log("Created .env from .env.example — fill in real values before production use.");
}

console.log("Installing server dependencies...");
execSync("npm install", { cwd: "server", stdio: "inherit" });

console.log("Installing dashboard dependencies...");
execSync("npm install", { cwd: "dashboard", stdio: "inherit" });

console.log("Setup complete. Next: npm run migrate && npm run seed");
