import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { createServer } from "node:http";
import { env } from "./config/env";
import { simulationRouter, simulationStatic } from "./routes/simulation.routes";
import { robotModeService } from "./robot/RobotModeService";
import { robotLink } from "./robot/RobotLink";
import { simulatedRobot } from "./robot/SimulatedRobot";
import { initSocket } from "./websocket/socket";
import { errorHandler } from "./middleware/errorHandler";
import { logger } from "./logging/Logger";
import { memoryManager } from "./memory/MemoryManager";
import { loadMemoryFromDatabase } from "./memory/MemoryPersistence";

import { authRouter } from "./routes/auth.routes";
import { usersRouter } from "./routes/users.routes";
import { settingsRouter } from "./routes/settings.routes";
import { commandsRouter } from "./routes/commands.routes";
import { servosRouter } from "./routes/servos.routes";
import { gaitRouter } from "./routes/gait.routes";
import { cameraRouter } from "./routes/camera.routes";
import { audioRouter } from "./routes/audio.routes";
import { musicRouter } from "./routes/music.routes";
import { ultrasonicRouter } from "./routes/ultrasonic.routes";
import { trackingRouter } from "./routes/tracking.routes";
import { brainRouter } from "./routes/brain.routes";
import { memoryRouter } from "./routes/memory.routes";
import { mentalRouter } from "./routes/mental.routes";
import { decisionsRouter } from "./routes/decisions.routes";
import { reactionsRouter } from "./routes/reactions.routes";
import { peopleRouter } from "./routes/people.routes";
import { smartDevicesRouter } from "./routes/smartDevices.routes";
import { objectsRouter } from "./routes/objects.routes";
import { robotRouter } from "./routes/robot.routes";
import { tasksRouter } from "./routes/tasks.routes";
import { scriptsRouter } from "./routes/scripts.routes";
import { telemetryRouter } from "./routes/telemetry.routes";
import { systemRouter } from "./routes/system.routes";
import { conversationRouter, restrictionsRouter } from "./routes/conversation.routes";
import { commandDeliveryRouter } from "./routes/commandDelivery.routes";

const app = express();
// Behind Render/Fly/nginx every request arrives from the proxy's IP. Without this, rate limiting
// (login/register/reset) sees ONE client for everybody, so a handful of requests would lock all
// users out at once. Only trusted in production, where a proxy is actually in front.
if (env.isProd) app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

// Bare /health for load balancers / uptime monitors that don't know about /api.
app.get("/health", (_req, res) => res.json({ status: "OK" }));

const api = express.Router();
// Mount order matters here: every router below is mounted flat on /api (no
// per-feature path prefix at this level — each router's own routes carry
// their full path, e.g. "/audio/listen/start"). Each router now scopes its
// own auth middleware to its own path prefix (see audio.routes.ts for why),
// which prevents cross-router leakage regardless of order — EXCEPT
// conversationRouter and audioRouter, which both genuinely own paths under
// "/audio" ("/audio/conversation-turn" vs "/audio/listen/start" etc).
// conversationRouter must be mounted first so its exact-path robot-authed
// route is matched before audioRouter's "/audio"-scoped requireAuth ever
// runs. Same reasoning for commandDeliveryRouter vs commandsRouter below
// ("/commands/pending" vs commandsRouter's "/commands"-scoped requireAuth).
// Everything else can be mounted in any order.
[
  authRouter, conversationRouter,
  commandDeliveryRouter,
  usersRouter, settingsRouter,
  commandsRouter, servosRouter, gaitRouter,
  cameraRouter, audioRouter, musicRouter, ultrasonicRouter, trackingRouter,
  brainRouter, memoryRouter, mentalRouter, decisionsRouter, reactionsRouter,
  peopleRouter, objectsRouter, robotRouter, smartDevicesRouter,
  tasksRouter, scriptsRouter, telemetryRouter, systemRouter,
  restrictionsRouter, simulationRouter,
].forEach((r) => api.use(r));
app.use("/api", api);
// The 3D simulator page — only answers while the robot mode is "simulation" (it can now change from the dashboard,
// so the check happens per request). Its data endpoints are under /api/simulation.
app.use("/simulation", simulationStatic);

app.use(errorHandler);

const httpServer = createServer(app);
initSocket(httpServer);
// ROBOT_MODE decides what is at the end of the command pipeline. The brain and
  // the compiler are identical either way:
  //   hardware   -> real ESP32 over the persistent WebSocket (robot/RobotLink.ts)
  //   simulation -> in-process virtual robot (robot/SimulatedRobot.ts)
  robotLink.attach(httpServer); // refuses connections itself when ROBOT_MODE=simulation
  // A mode chosen on the dashboard (remembered in data/robot-mode.json) wins over the ROBOT_MODE environment value.
  // set() starts the virtual robot when the result is simulation.
  if (robotModeService.load() === "simulation") simulatedRobot.start();

async function start() {
  // Loads everything static/dynamic/conceptual memory has ever been
  // seeded with or has learned back into the runtime MemoryManager
  // BEFORE the server accepts any traffic or the brain cycle can run a
  // single lookup — otherwise the very first requests/cycles would see
  // empty memory even though the database has real data (see
  // memory/MemoryPersistence.ts for exactly what this closes the gap
  // on, and why it degrades gracefully rather than blocking startup if
  // the database isn't reachable).
  await loadMemoryFromDatabase(memoryManager);

  // Keep HTTP connections open longer than typical proxy idle timeouts so the
  // firmware's HTTP fallback reuses connections instead of re-handshaking.
  httpServer.keepAliveTimeout = 65_000;
  httpServer.headersTimeout = 66_000;

  httpServer.listen(env.PORT, "0.0.0.0", () => {
    logger.info(`Vision server listening on 0.0.0.0:${env.PORT}`, { robotMode: env.ROBOT_MODE, env: env.NODE_ENV });
  });
}

start();
