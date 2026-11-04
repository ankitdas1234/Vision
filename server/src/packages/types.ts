// ============================================================
// VISION — SHARED TYPES
// Single source of truth for hardware map + domain types.
// ============================================================

export type ServoType = "POSITIONAL" | "CONTINUOUS";

export type ServoPurpose = "HEAD" | "LEFT_LEG" | "RIGHT_LEG";

/**
 * Fixed, authoritative hardware map: 3 servos. CH3-CH15 reserved for future
 * use. CH0 = head (camera + HC-SR04 ride on it, 0-180° like a human turning
 * their head), CH1 = left leg, CH2 = right leg. See servos/ServoConfiguration.ts.
 */
export const SERVO_CHANNEL_MAP: Record<number, { purpose: ServoPurpose; type: ServoType }> = {
  0: { purpose: "HEAD", type: "POSITIONAL" },
  1: { purpose: "LEFT_LEG", type: "CONTINUOUS" },
  2: { purpose: "RIGHT_LEG", type: "CONTINUOUS" },
};

export type PersonCategory = "ADMIN" | "TRUSTED" | "FRIEND" | "GUEST" | "UNKNOWN";

export type TrackingState =
  | "IDLE"
  | "SEARCHING"
  | "TARGET_ACQUIRED"
  | "TRACKING"
  | "TARGET_LOST"
  | "REACQUIRING";

export type MemorySource = "STATIC" | "DYNAMIC" | "CONCEPTUAL" | "AI";

export type VerificationStatus = "VERIFIED" | "UNVERIFIED" | "REQUIRES_REVIEW" | "REJECTED";

export type CuriosityDecision = "OBSERVE" | "INVESTIGATE" | "ASK" | "LEARN" | "IGNORE" | "REACT";

export type CommandStatus =
  | "PENDING"
  | "VALIDATED"
  | "REJECTED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED";

export type CommandSource = "AI" | "PI_SCRIPT" | "DASHBOARD" | "SYSTEM" | "ADMIN";

export const COMMAND_TYPES = [
  "CAMERA_CAPTURE", "CAMERA_START_TRACKING", "CAMERA_STOP_TRACKING",
  "AUDIO_START_LISTENING", "AUDIO_STOP_LISTENING", "AUDIO_SPEAK", "AUDIO_STOP",
  "EYE_CENTER", "EYE_LEFT", "EYE_RIGHT", "EYE_SET", "EYE_TRACK_PERSON",
  "LEFT_LEG_FORWARD", "LEFT_LEG_REVERSE", "LEFT_LEG_ROTATE", "LEFT_LEG_STOP",
  "RIGHT_LEG_FORWARD", "RIGHT_LEG_REVERSE", "RIGHT_LEG_ROTATE", "RIGHT_LEG_STOP",
  "WALK_FORWARD", "WALK_BACKWARD", "TURN_LEFT", "TURN_RIGHT", "WALK_STOP",
  "ULTRASONIC_READ", "ULTRASONIC_CALIBRATE", "ULTRASONIC_ENABLE", "ULTRASONIC_DISABLE",
  "SERVOS_SAFE", "EMERGENCY_STOP", "EMERGENCY_CLEAR",
  "BRAIN_OBSERVE", "BRAIN_PROCESS",
  "MEMORY_SEARCH", "MEMORY_LEARN",
  "TASK_START", "TASK_CANCEL",
  "SCRIPT_COMPILE", "SCRIPT_EXECUTE",
  "FIND_PERSON", "DANCE",
  "PLAY_SONG_REQUEST", "SET_DANCE_PREFERENCE", "RESET_PERSON_FACE",
  "SMART_DEVICE_TRIGGER",
] as const;

export type CommandType = typeof COMMAND_TYPES[number];

export interface CommandResult {
  success: boolean;
  commandId: string;
  type: CommandType;
  status: CommandStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  result?: Record<string, unknown>;
  error?: { code: string; message: string; details?: unknown } | null;
}

export type GaitDirection = "FORWARD" | "REVERSE" | "STOP";

export interface GaitPhase {
  phaseNumber: number;
  durationMs: number;
  leftRotationSpeed: number; // 0-100
  leftRotationDirection: GaitDirection;
  rightRotationSpeed: number;
  rightRotationDirection: GaitDirection;
}

export interface MentalState {
  mood: string;
  energy: number;
  curiosity: number;
  friendliness: number;
  alertness: number;
  confidence: number;
  intent: string;
  internalState: MentalIntelState;
  explorationActive: boolean;
  currentPersonId?: string | null;
  currentTaskId?: string | null;
}

export interface Reaction {
  state: string;
  speech?: string;
  gestures: { type: string; target?: string }[];
  reason: string;
  confidence: number;
}

export interface SimilarityResult {
  candidateId: string;
  candidateName: string;
  totalScore: number;
  shapeScore: number;
  colourScore: number;
  sizeScore: number;
  appearanceScore: number;
  contextScore: number;
  featureScore: number;
  semanticScore: number;
  matchingFeatures: string[];
  conflictingFeatures: string[];
  confidence: number;
}

export interface TelemetrySnapshot {
  robotId: string;
  wifiRssi?: number;
  freeHeap?: number;
  uptimeSeconds?: number;
  cameraStatus?: "OK" | "ERROR" | "UNKNOWN";
  pca9685Status?: "OK" | "ERROR" | "UNKNOWN";
  micStatus?: "OK" | "ERROR" | "UNKNOWN";
  speakerStatus?: "OK" | "ERROR" | "UNKNOWN";
  ultrasonicStatus?: "OK" | "ERROR" | "UNKNOWN";
  trackingState?: TrackingState;
  gaitState?: string;
  ultrasonicDistanceMm?: number;
  ultrasonicState?: UltrasonicState;
  mockMode?: boolean;
  createdAt?: string;
}

export type UltrasonicState = "CLEAR" | "NEAR" | "WARNING" | "OBSTACLE" | "VERY_CLOSE" | "INVALID" | "SENSOR_ERROR";

export interface UltrasonicReading {
  rawDistanceMm: number;
  filteredDistanceMm: number;
  confidence: number;
  status: UltrasonicState;
  timestamp: string;
}

export type MentalIntelState = "IDLE" | "OBSERVING" | "THINKING" | "CURIOUS" | "EXPLORING" | "INTERACTING" | "LEARNING" | "CONFUSED" | "SURPRISED" | "CAUTIOUS" | "SAFETY_STOP" | "ERROR";

export type EmotionState = "HAPPY" | "CALM" | "CURIOUS" | "CONFUSED" | "SURPRISED" | "WORRIED" | "SAD" | "EXCITED" | "ANNOYED" | "NEUTRAL";
