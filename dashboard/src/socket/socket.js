import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";

// withCredentials sends the httpOnly `pi_session` cookie on the handshake
// request, same as apiClient's `credentials: "include"` — the server
// verifies it in initSocket()'s auth middleware before allowing the
// connection to join the broadcast room.
export const socket = io(SOCKET_URL, { autoConnect: true, transports: ["websocket"], withCredentials: true });

export const SOCKET_EVENTS = {
  ROBOT_STATUS: "robot:status", TELEMETRY_UPDATE: "telemetry:update",
  PERSON_TRACKING: "person:tracking", MENTAL_STATE: "mental:state",
  BRAIN_DECISION: "brain:decision", REACTION_SELECTED: "reaction:selected",
  COMMAND_COMPLETED: "command:completed", SAFETY_EVENT: "safety:event",
  GAIT_STARTED: "gait:started", GAIT_STOPPED: "gait:stopped",
  SYSTEM_LOG: "system:log",
};
