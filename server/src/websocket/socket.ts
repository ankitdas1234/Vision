import type { Server as HTTPServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../config/env";
import { SOCKET_EVENTS } from "./events";
import { ROOMS } from "./rooms";
import { logger } from "../logging/Logger";
import { sessionService } from "../auth/SessionService";
import { SESSION_COOKIE_NAME } from "../middleware/auth";

let io: Server | null = null;

/** Pulls a single cookie value out of a raw `Cookie:` header without adding
 * a dependency — Socket.IO's handshake gives us the raw header, not the
 * cookie-parser-parsed req.cookies the REST middleware relies on. */
function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export function initSocket(httpServer: HTTPServer) {
  io = new Server(httpServer, { cors: { origin: env.FRONTEND_URL, credentials: true } });

  // Every real-time event (person recognition, memory, mental state, raw
  // telemetry, ...) carries the same sensitive data the REST API guards with
  // requireAuth — the socket layer must not be a side door around that.
  // Same session model as the REST API: verify the httpOnly session cookie
  // (JWT signature + DB revocation/expiry check), just read from the raw
  // handshake header since cookie-parser hasn't touched this request.
  io.use(async (socket, next) => {
    try {
      const cookieToken = readCookie(socket.request.headers.cookie, SESSION_COOKIE_NAME);
      const authToken = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : null;
      const token = cookieToken ?? authToken;
      if (!token) return next(new Error("UNAUTHENTICATED"));

      const user = await sessionService.verify(token);
      if (!user) return next(new Error("UNAUTHENTICATED"));

      socket.data.user = user;
      next();
    } catch {
      next(new Error("UNAUTHENTICATED"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(ROOMS.DASHBOARD);
    logger.info("socket connected", { id: socket.id, userId: socket.data.user?.id });

    socket.on("disconnect", () => logger.info("socket disconnected", { id: socket.id }));
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error("Socket.IO not initialized — call initSocket() first");
  return io;
}

export function emitToAll(event: keyof typeof SOCKET_EVENTS | string, payload: unknown) {
  getIO().to(ROOMS.DASHBOARD).emit(event as string, payload);
}

export { SOCKET_EVENTS };
