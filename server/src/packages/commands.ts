// ============================================================
// VISION — SHARED COMMAND CATALOG (schemas usable by server + tests)
// The full CommandRegistry (with handlers) lives in server —
// this package only defines the STATIC catalog + validation
// schemas so both server and Vision Script compiler share one truth.
// ============================================================
import { z } from "zod";
import { COMMAND_TYPES, type CommandType } from "./types";

export { COMMAND_TYPES };
export type { CommandType };

/** Which category a command belongs to (used for permission grouping). */
export const COMMAND_CATEGORY: Record<CommandType, string> = {
  CAMERA_CAPTURE: "CAMERA", CAMERA_START_TRACKING: "CAMERA", CAMERA_STOP_TRACKING: "CAMERA",
  AUDIO_START_LISTENING: "AUDIO", AUDIO_STOP_LISTENING: "AUDIO", AUDIO_SPEAK: "AUDIO", AUDIO_STOP: "AUDIO",
  EYE_CENTER: "EYE", EYE_LEFT: "EYE", EYE_RIGHT: "EYE", EYE_SET: "EYE", EYE_TRACK_PERSON: "EYE",
  LEFT_LEG_FORWARD: "LEFT_LEG", LEFT_LEG_REVERSE: "LEFT_LEG", LEFT_LEG_ROTATE: "LEFT_LEG",
  LEFT_LEG_STOP: "LEFT_LEG",
  RIGHT_LEG_FORWARD: "RIGHT_LEG", RIGHT_LEG_REVERSE: "RIGHT_LEG", RIGHT_LEG_ROTATE: "RIGHT_LEG",
  RIGHT_LEG_STOP: "RIGHT_LEG",
  WALK_FORWARD: "GAIT", WALK_BACKWARD: "GAIT", TURN_LEFT: "GAIT", TURN_RIGHT: "GAIT", WALK_STOP: "GAIT",
  ULTRASONIC_READ: "ULTRASONIC", ULTRASONIC_CALIBRATE: "ULTRASONIC", ULTRASONIC_ENABLE: "ULTRASONIC", ULTRASONIC_DISABLE: "ULTRASONIC",
  SERVOS_SAFE: "SYSTEM", EMERGENCY_STOP: "SYSTEM", EMERGENCY_CLEAR: "SYSTEM",
  BRAIN_OBSERVE: "BRAIN", BRAIN_PROCESS: "BRAIN",
  MEMORY_SEARCH: "MEMORY", MEMORY_LEARN: "MEMORY",
  TASK_START: "TASK", TASK_CANCEL: "TASK",
  SCRIPT_COMPILE: "SCRIPT", SCRIPT_EXECUTE: "SCRIPT",
  FIND_PERSON: "PEOPLE", DANCE: "PERFORMANCE",
  PLAY_SONG_REQUEST: "PERFORMANCE", SET_DANCE_PREFERENCE: "PEOPLE", RESET_PERSON_FACE: "PEOPLE",
  SMART_DEVICE_TRIGGER: "SMART_HOME",
};

/** Per-command Zod parameter schema. Empty object = no params required. */
export const COMMAND_PARAM_SCHEMAS: Record<CommandType, z.ZodTypeAny> = {
  CAMERA_CAPTURE: z.object({}),
  CAMERA_START_TRACKING: z.object({}),
  CAMERA_STOP_TRACKING: z.object({}),

  AUDIO_START_LISTENING: z.object({}),
  AUDIO_STOP_LISTENING: z.object({}),
  AUDIO_SPEAK: z.object({ text: z.string().min(1).max(1000) }),
  AUDIO_STOP: z.object({}),

  EYE_CENTER: z.object({}),
  EYE_LEFT: z.object({ step: z.number().min(1).max(90).optional() }),
  EYE_RIGHT: z.object({ step: z.number().min(1).max(90).optional() }),
  EYE_SET: z.object({ angle: z.number().min(0).max(180) }),
  EYE_TRACK_PERSON: z.object({ personId: z.string().optional(), targetAngle: z.number().min(0).max(180).optional() }),

  LEFT_LEG_FORWARD: z.object({ speed: z.number().min(0).max(100) }),
  LEFT_LEG_REVERSE: z.object({ speed: z.number().min(0).max(100) }),
  LEFT_LEG_ROTATE: z.object({ speed: z.number().min(-100).max(100) }),
  LEFT_LEG_STOP: z.object({}),

  RIGHT_LEG_FORWARD: z.object({ speed: z.number().min(0).max(100) }),
  RIGHT_LEG_REVERSE: z.object({ speed: z.number().min(0).max(100) }),
  RIGHT_LEG_ROTATE: z.object({ speed: z.number().min(-100).max(100) }),
  RIGHT_LEG_STOP: z.object({}),

  WALK_FORWARD: z.object({ durationMs: z.number().min(0).max(60_000).optional() }),
  WALK_BACKWARD: z.object({ durationMs: z.number().min(0).max(60_000).optional() }),
  TURN_LEFT: z.object({ durationMs: z.number().min(0).max(60_000).optional() }),
  TURN_RIGHT: z.object({ durationMs: z.number().min(0).max(60_000).optional() }),
  WALK_STOP: z.object({}),

  ULTRASONIC_READ: z.object({}),
  ULTRASONIC_CALIBRATE: z.object({
    safeDistanceMm: z.number().min(0).optional(),
    warningDistanceMm: z.number().min(0).optional(),
    stopDistanceMm: z.number().min(0).optional(),
    emergencyDistanceMm: z.number().min(0).optional(),
  }),
  ULTRASONIC_ENABLE: z.object({}),
  ULTRASONIC_DISABLE: z.object({}),

  SERVOS_SAFE: z.object({}),
  EMERGENCY_STOP: z.object({}),
  // Requires a short reason so the audit log / command history always shows
  // WHO decided the situation was resolved and WHY — clearing an emergency
  // stop is a deliberate judgment call, not a one-click undo.
  EMERGENCY_CLEAR: z.object({ reason: z.string().min(1).max(500) }),

  BRAIN_OBSERVE: z.object({ mediaId: z.string().optional() }),
  BRAIN_PROCESS: z.object({ observationId: z.string() }),

  MEMORY_SEARCH: z.object({ query: z.string().min(1) }),
  MEMORY_LEARN: z.object({
    title: z.string().min(1),
    content: z.string().min(1),
    source: z.string().default("SYSTEM"),
  }),

  TASK_START: z.object({ taskType: z.string(), input: z.record(z.unknown()).optional() }),
  TASK_CANCEL: z.object({ taskId: z.string() }),

  SCRIPT_COMPILE: z.object({ source: z.string().min(1) }),
  SCRIPT_EXECUTE: z.object({ source: z.string().min(1) }),

  // "text" mirrors AUDIO_SPEAK's convention so `FIND_PERSON "Sam"` in a
  // Vision Script (a single quoted-string arg) works with no compiler
  // changes — see ScriptExecutor.paramsForArg, which sets both `text` and
  // `name` for a string arg. "name" is the clearer field for anything
  // calling this directly (dashboard, intent engine).
  //
  // No image field here on purpose: if multiple people share the name,
  // Vision asks out loud and resolves it from its own camera — see
  // people/PersonSearchRunner.ts and people/PendingDisambiguation.ts.
  // There's deliberately only one way this works, not a second
  // API-supplied-photo path alongside it.
  FIND_PERSON: z
    .object({ name: z.string().min(1).max(80).optional(), text: z.string().min(1).max(80).optional() })
    .refine((v) => !!(v.name || v.text), { message: "name is required" }),

  // A bare `DANCE` or `DANCE 20000` (duration in ms) needs no extra
  // wiring — ScriptExecutor already maps a numeric arg to `durationMs`.
  // `DANCE "energetic"` sets trackId via the same string-arg mapping.
  DANCE: z.object({
    trackId: z.string().max(80).optional(),
    text: z.string().max(80).optional(),
    durationMs: z.number().min(2000).max(120_000).optional(),
  }),

  // "text"/"name" mirror the same string-arg convention as FIND_PERSON —
  // `SMART_DEVICE_TRIGGER "living room lamp"` in a Vision Script resolves
  // to a device registered by that name (see
  // repositories/smartDevices.repository.ts, routes/smartDevices.routes.ts
  // for how a device gets registered, ADMIN-only).
  SMART_DEVICE_TRIGGER: z
    .object({ name: z.string().min(1).max(128).optional(), text: z.string().min(1).max(128).optional() })
    .refine((v) => !!(v.name || v.text), { message: "name is required" }),

  // Real, first-class dispatch path for the music pipeline (see
  // music/PlaySongService.ts) — previously only reachable via the
  // PLAY_SONG voice intent, not via a script or manual dispatch. "text"
  // mirrors FIND_PERSON's convention (`PLAY_SONG_REQUEST "some jazz"` in
  // a Vision Script). personId is optional — an admin-triggered request
  // with no specific requester still searches and plays, it just has
  // nobody to log the request against or check a dance preference for.
  PLAY_SONG_REQUEST: z
    .object({ text: z.string().min(1).max(200).optional(), personId: z.string().uuid().optional() })
    .refine((v) => !!v.text, { message: "text (what to play) is required" }),

  // Real dispatch path for the "Ram, don't dance" preference (see
  // people/PersonEncounterService.ts, music/PlaySongService.ts's
  // finishWithResult) — previously only reachable via the
  // DANCE_PREFERENCE voice intent.
  SET_DANCE_PREFERENCE: z.object({ personId: z.string().uuid(), enabled: z.boolean() }),

  // Real dispatch path for "that's not me" (see
  // repositories/personFaces.repository.ts's deleteAllForPerson) —
  // previously only reachable via the NOT_ME voice intent. Clears every
  // registered face for this person so the next real detection registers
  // a fresh embedding, rather than trying to identify which single
  // stored embedding was the bad match.
  RESET_PERSON_FACE: z.object({ personId: z.string().uuid() }),
};

/** Commands that manipulate hardware directly and therefore always require SAFETY validation. */
export const HARDWARE_COMMANDS = new Set<CommandType>([
  "EYE_CENTER", "EYE_LEFT", "EYE_RIGHT", "EYE_SET", "EYE_TRACK_PERSON",
  "LEFT_LEG_FORWARD", "LEFT_LEG_REVERSE", "LEFT_LEG_ROTATE", "LEFT_LEG_STOP",
  "RIGHT_LEG_FORWARD", "RIGHT_LEG_REVERSE", "RIGHT_LEG_ROTATE", "RIGHT_LEG_STOP",
  "WALK_FORWARD", "WALK_BACKWARD", "TURN_LEFT", "TURN_RIGHT", "WALK_STOP",
  "SERVOS_SAFE", "EMERGENCY_STOP",
]);

/**
 * Commands that need to physically reach the robot over the network, not
 * just update the server's own software model of it — drained by firmware
 * via GET /api/commands/pending (see commands/PendingCommandQueue.ts).
 * A superset of HARDWARE_COMMANDS (which exists for a different reason —
 * "needs SAFETY validation") plus audio/camera-mode commands that aren't
 * safety-relevant but still need to reach the device. Deliberately
 * excludes orchestration-only types (TASK_START, SCRIPT_*, FIND_PERSON,
 * DANCE, MEMORY_LEARN, ULTRASONIC_CALIBRATE) — those either run
 * server-side only or dispatch further commands that get queued
 * individually when they run.
 */
export const PHYSICALLY_DELIVERABLE_COMMANDS = new Set<CommandType>([
  ...HARDWARE_COMMANDS,
  "EMERGENCY_CLEAR",
  "AUDIO_SPEAK", "AUDIO_START_LISTENING", "AUDIO_STOP_LISTENING", "AUDIO_STOP",
  "CAMERA_START_TRACKING", "CAMERA_STOP_TRACKING",
]);

/** Commands whose execution must additionally consult live ultrasonic distance before moving anything. */
export const MOVEMENT_COMMANDS = new Set<CommandType>([
  "LEFT_LEG_FORWARD", "LEFT_LEG_REVERSE", "RIGHT_LEG_FORWARD", "RIGHT_LEG_REVERSE",
  "WALK_FORWARD", "WALK_BACKWARD", "TURN_LEFT", "TURN_RIGHT",
]);

/** Commands that require ADMIN permission.
 *
 * EMERGENCY_STOP is admin-gated BY DESIGN CHOICE, not by default — this is
 * a deliberate override of the usual "the stop button must be the most
 * accessible control in the system" rule (still true for EMERGENCY_CLEAR's
 * sibling commands SERVOS_SAFE/WALK_STOP/leg-STOP/leg-CENTER, which stay
 * open to everyone; see MANUAL_GATED_COMMANDS and SafetyManager). Owner
 * explicitly requested this after being shown the trade-off: a bystander
 * who is NOT a recognized admin cannot stop the robot at all, even in a
 * genuine emergency, until an admin's presence is confirmed by voice or
 * face. `isAdmin` for this command is set from live biometric presence
 * (see people/AdminPresence.ts), not from a dashboard login role alone —
 * see routes/commands.routes.ts and routes/conversation.routes.ts for the
 * two places that decide it.
 *
 * Resuming afterwards (EMERGENCY_CLEAR) was already the same shape: a
 * judgment call that something is actually safe again, so it requires
 * ADMIN too. */
export const ADMIN_ONLY_COMMANDS = new Set<CommandType>(["EMERGENCY_STOP", "EMERGENCY_CLEAR", "SERVOS_SAFE", "ULTRASONIC_CALIBRATE", "ULTRASONIC_ENABLE", "ULTRASONIC_DISABLE"]);

/**
 * Commands that physically move the robot's body and therefore require
 * Manual Mode to be enabled when issued by a human (DASHBOARD or PI_SCRIPT).
 * Deliberately excludes every STOP/CENTER/SAFE command — those can only
 * reduce risk, never increase it, so a human can always issue them
 * regardless of mode. The brain (SYSTEM/AI sources) is never gated by this
 * — it's the autonomous default.
 */
export const MANUAL_GATED_COMMANDS = new Set<CommandType>([
  "EYE_LEFT", "EYE_RIGHT", "EYE_SET", "EYE_TRACK_PERSON",
  "LEFT_LEG_FORWARD", "LEFT_LEG_REVERSE", "LEFT_LEG_ROTATE",
  "RIGHT_LEG_FORWARD", "RIGHT_LEG_REVERSE", "RIGHT_LEG_ROTATE",
  "WALK_FORWARD", "WALK_BACKWARD", "TURN_LEFT", "TURN_RIGHT",
]);
