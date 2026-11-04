#!/usr/bin/env node
/**
 * Downloads the three real, pretrained face-api.js model weight sets used
 * by perception/faceEmbedding.ts:
 *   - tiny_face_detector  (face localization)
 *   - face_landmark_68    (alignment)
 *   - face_recognition    (128-d identity descriptor)
 *
 * These are published as open weights in the face-api.js project's own
 * GitHub repo (vladmandic/face-api, MIT-licensed model release) — this is
 * ordinary "download the model file I depend on" tooling, no different in
 * kind from `npm install`. Run once via `npm run setup:face-models`.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const REPO_RAW_BASE = "https://raw.githubusercontent.com/vladmandic/face-api/master/model";
const OUT_DIR = process.env.FACE_MODELS_DIR || path.join(__dirname, "../models/face-api");

const MANIFESTS = ["tiny_face_detector_model-weights_manifest.json", "face_landmark_68_model-weights_manifest.json", "face_recognition_model-weights_manifest.json"];

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(fetchText(res.headers.location));
        }
        if (res.statusCode !== 200) return reject(new Error(`GET ${url} -> ${res.statusCode}`));
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

async function downloadFile(filename) {
  const dest = path.join(OUT_DIR, filename);
  if (fs.existsSync(dest)) {
    console.log(`  already have ${filename}`);
    return;
  }
  const bytes = await fetchText(`${REPO_RAW_BASE}/${filename}`);
  fs.writeFileSync(dest, bytes);
  console.log(`  downloaded ${filename} (${bytes.length} bytes)`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Downloading face-api.js model weights into ${OUT_DIR}`);

  for (const manifestName of MANIFESTS) {
    console.log(`\n${manifestName}`);
    await downloadFile(manifestName);
    const manifest = JSON.parse(fs.readFileSync(path.join(OUT_DIR, manifestName), "utf8"));
    const shardFiles = manifest.flatMap((entry) => entry.paths || []);
    for (const shard of shardFiles) {
      await downloadFile(shard);
    }
  }

  console.log("\nDone. Set FACE_MODELS_DIR to override this location if needed.");
}

main().catch((err) => {
  console.error("Model download failed:", err.message);
  console.error("You can also download these files manually from https://github.com/vladmandic/face-api/tree/master/model");
  process.exit(1);
});
