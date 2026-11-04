import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const candidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), ".env.local"),
  resolve(__dirname, "../../.env"),      
  resolve(__dirname, "../../../.env"),  
];

for (const path of candidates) {
  if (existsSync(path)) {
    loadEnv({ path });
    break;
  }
}


const EnvSchema = z.object({
  // Required in production; falls back to a local dev default so tests/tooling
  // that don't touch the database can run without a full .env.
  DATABASE_URL: z.string().min(1).default("postgresql://vision:vision@localhost:5432/vision"),
  PORT: z.string().default("4000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  FRONTEND_URL: z.string().default("http://localhost:5173"),

  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("openrouter/auto"),
  // Optional — a vision-capable model (e.g. a multimodal model on OpenRouter)
  // used for actual object/person recognition. Left unset, Vision falls back
  // to local heuristic detection only (see docs/vision-pipeline.md).
  OPENROUTER_VISION_MODEL: z.string().optional(),

  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().default("onwK4e9ZLuTAKqWW03F9"),
  ELEVENLABS_MODEL_ID: z.string().default("eleven_turbo_v2_5"),

  // Free, no API key required — see docs/audio.md "Giving Vision a voice (free option)".
  TTS_PROVIDER: z.enum(["mock", "edge", "elevenlabs", "omnivoice"]).default("edge"),
  EDGE_TTS_VOICE: z.string().default("en-GB-RyanNeural"),

  // Optional — OmniVoice (k2-fsa/OmniVoice, 600+ languages) via WaveSpeedAI.
  // Only used if TTS_PROVIDER=omnivoice. See config/omnivoice.ts.
  WAVESPEED_API_KEY: z.string().optional(),
  // Comma-separated voice attributes, e.g. "male, young adult, british accent"
  // — see docs/audio.md for the full valid-attribute list. Optional; omit
  // for a random voice each time.
  OMNIVOICE_VOICE_DESCRIPTION: z.string().optional(),

  // Speech-to-text (hearing/understanding what someone said). Defaults to
  // "mock" (always returns an empty transcript) since, unlike TTS, there's
  // no free no-signup STT option — see docs/audio.md "Hearing" for the
  // tradeoffs between elevenlabs (reuses ELEVENLABS_API_KEY above if
  // that's already configured for TTS) and groq (separate free-tier key,
  // very fast Whisper-compatible inference).
  STT_PROVIDER: z.enum(["mock", "elevenlabs", "groq"]).default("mock"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_STT_MODEL: z.string().default("whisper-large-v3-turbo"),

  GOOGLE_DRIVE_CLIENT_ID: z.string().optional(),
  GOOGLE_DRIVE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_DRIVE_REFRESH_TOKEN: z.string().optional(),

  // No default in the schema on purpose — see the production check below.
  // A local dev fallback is applied afterwards so `npm run dev` still works
  // without a .env, but production can never silently boot on it.
  JWT_SECRET: z.string().min(1).optional(),
  ROBOT_AUTH_SECRET: z.string().min(1).optional(),

  SOCKET_URL: z.string().optional(),

  // Session cookie SameSite policy. "lax" is right when the dashboard and the API are the
  // same site (e.g. both behind one domain, or localhost in dev). If they are on DIFFERENT
  // sites (dashboard on Vercel/Netlify, API on Render) the browser won't send a Lax cookie
  // on cross-site requests, so login won't stick: set "none" (HTTPS only; "secure" is forced on).
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),

  // Outgoing email (password reset). Any SMTP provider. Leave SMTP_HOST empty
  // in development to have reset links logged to the console instead.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().default("587"),
  SMTP_SECURE: z.string().default("false"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(), // e.g. "Vision <no-reply@yourdomain.com>"

  // ---- Robot connection mode (THE switch) -----------------------------------
  //   hardware   : the brain and the Vision Script compiler drive the REAL ESP32
  //                over the persistent link (robot/RobotLink.ts, /api/robot-ws).
  //                The simulator is never started.
  //   simulation : no ESP32 needed. The SAME command pipeline (brain, compiler,
  //                dashboard -> CommandRegistry) drives an in-process virtual
  //                robot (robot/SimulatedRobot.ts) instead. The robot link and
  //                the robot HTTP routes are closed so a real board can't be
  //                half-connected while you are simulating.
  ROBOT_MODE: z.enum(["hardware", "simulation"]).optional(),
  // Optional folder of .jpg/.png images the simulated camera cycles through
  // (e.g. photos of a person) so the brain has something real to look at.
  // Empty = the simulated camera sends no frames.
  SIM_FRAMES_DIR: z.string().optional(),
  // Deprecated alias kept so old .env files still work: MOCK_MODE=true means
  // ROBOT_MODE=simulation. ROBOT_MODE wins if both are set.
  MOCK_MODE: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  if (process.env.NODE_ENV === "production") {
    throw new Error("Environment validation failed. Check .env against .env.example");
  }
}

const data = parsed.success ? parsed.data : EnvSchema.parse({});

// JWT_SECRET / ROBOT_AUTH_SECRET have no schema default so a production
// deploy that forgets to set them fails loudly at boot instead of silently
// signing every session / authenticating every robot request with a
// well-known placeholder string. Dev/test get a clearly-labelled insecure
// fallback so `npm run dev` still works without a .env.
const isProdEnv = data.NODE_ENV === "production";
if (isProdEnv && (!data.JWT_SECRET || !data.ROBOT_AUTH_SECRET)) {
  throw new Error(
    "JWT_SECRET and ROBOT_AUTH_SECRET must both be set in production — refusing to start with an " +
    "insecure default. Generate random values (e.g. `openssl rand -hex 32`) and set them as env vars."
  );
}

// ROBOT_MODE wins; else legacy MOCK_MODE; else simulation (safe default: never
// drives hardware unless explicitly told to).
const robotMode: "hardware" | "simulation" =
  data.ROBOT_MODE ?? (data.MOCK_MODE === "false" ? "hardware" : "simulation");

export const env = {
  ...data,
  JWT_SECRET: data.JWT_SECRET ?? "dev-insecure-jwt-secret",
  ROBOT_AUTH_SECRET: data.ROBOT_AUTH_SECRET ?? "dev-insecure-robot-secret",
  PORT: Number(data.PORT),
  SMTP_PORT: Number(data.SMTP_PORT),
  SMTP_SECURE: data.SMTP_SECURE === "true",
  ROBOT_MODE: robotMode,
  /** True in simulation mode. Name kept because the rest of the codebase already uses it. */
  MOCK_MODE: robotMode === "simulation",
  COOKIE_SAMESITE: data.COOKIE_SAMESITE,
  isProd: isProdEnv,
};
