import { pgTable, uuid, varchar, text, integer, boolean, real, timestamp, jsonb, index, customType } from "drizzle-orm/pg-core";

/** pgvector column type — drizzle-orm doesn't ship a built-in `vector`
 * column type, so this defines one via `customType`, matching how the
 * pgvector project itself documents doing this for drizzle. Stored/read
 * as pgvector's own text literal format ("[0.1,0.2,...]"), cast to/from
 * `vector` on the Postgres side. See database/migrations/0005_pgvector_face_embeddings.sql
 * for the `CREATE EXTENSION vector` + `ALTER COLUMN ... TYPE vector(n)`
 * migration and the HNSW index this column depends on for fast
 * nearest-neighbor search (see repositories/personFaces.repository.ts). */
export const vector = (dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(",")}]`;
    },
    fromDriver(value: string): number[] {
      return value
        .slice(1, -1)
        .split(",")
        .filter((s) => s.length > 0)
        .map(Number);
    },
  });

/** Embedding dimensionality currently in use — see
 * perception/embedding/faceApiBackend.ts (128-d, the default backend) vs
 * perception/embedding/onnxBackend.ts (512-d, once configured). The
 * column is sized for the larger of the two so switching backends never
 * requires a migration; see personFaces.repository.ts for how
 * mixed-dimension rows are handled (they aren't compared against each
 * other — see the `backend` column below). */
export const FACE_EMBEDDING_DIMENSIONS = 512;

// ============================================================
// VISION — DRIZZLE SCHEMA
// Mirrors /database/schema.sql. Keep both in sync.
// ============================================================

export const robots = pgTable("robots", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotCode: varchar("robot_code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull().default("Vision"),
  firmwareVersion: varchar("firmware_version", { length: 32 }),
  hardwareVersion: varchar("hardware_version", { length: 32 }),
  status: varchar("status", { length: 32 }).notNull().default("OFFLINE"),
  ipAddress: varchar("ip_address", { length: 64 }),
  // Free-text room/place label (e.g. "living room", "hallway") — there's no
  // GPS on this hardware, so location is admin-set rather than sensed. Used
  // to tag every person_observations row so a person's timeline shows
  // *where* each encounter happened, not just when. See PATCH /robot/location.
  currentLocation: varchar("current_location", { length: 128 }),
  lastHeartbeat: timestamp("last_heartbeat"),
  wifiRssi: integer("wifi_rssi"),
  freeHeap: integer("free_heap"),
  uptimeSeconds: integer("uptime_seconds"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const people = pgTable("people", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 128 }),
  category: varchar("category", { length: 16 }).notNull().default("UNKNOWN"),
  trustScore: real("trust_score").notNull().default(0),
  relationshipScore: real("relationship_score").notNull().default(0),
  faceIdentifier: varchar("face_identifier", { length: 256 }),
  visitCount: integer("visit_count").notNull().default(0),
  firstSeen: timestamp("first_seen").defaultNow(),
  lastSeen: timestamp("last_seen").defaultNow(),
  preferences: jsonb("preferences"),
  metadata: jsonb("metadata"),
  /** "Ram says don't dance" -> Vision still plays music for Ram, just
   * never dances on its own for him until he says otherwise. Default
   * true (dance-by-default) so this only matters once someone has
   * actually opted out. See music/PlaySongService.ts and
   * audio/IntentEngine.ts's DANCE_PREFERENCE intent. */
  autonomousDanceEnabled: boolean("autonomous_dance_enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  categoryIdx: index("people_category_idx").on(t.category),
  faceIdx: index("people_face_idx").on(t.faceIdentifier),
  lastSeenIdx: index("people_last_seen_idx").on(t.lastSeen),
}));

export const personFaces = pgTable("person_faces", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id").notNull().references(() => people.id),
  /** Fixed-width pgvector column (see FACE_EMBEDDING_DIMENSIONS above).
   * Shorter embeddings (e.g. the 128-d default face-api backend) are
   * zero-padded to this width on write — see
   * repositories/personFaces.repository.ts — which doesn't change L2
   * distance between two same-length vectors padded identically, and
   * comparisons are always scoped to matching `backend`/`dimensions`
   * anyway so padding never causes a cross-backend comparison. */
  embedding: vector(FACE_EMBEDDING_DIMENSIONS)("embedding"),
  /** Which embedding backend produced this row (see
   * perception/embedding/types.ts) — matches are only ever computed
   * against faces from the same backend, since distances from different
   * models aren't on a comparable scale. */
  backend: varchar("backend", { length: 32 }).notNull().default("face-api-resnet34"),
  /** Actual (unpadded) vector length this backend produces — needed to
   * correctly un-pad on read and to double-check backend compatibility
   * even if `backend` naming ever drifts. */
  dimensions: integer("dimensions").notNull().default(128),
  /** 0-1 composite quality score from quality/faceQuality.ts at capture
   * time — lets the matcher and pruning logic (see matching config
   * maxStoredFacesPerPerson) prefer/retain the best reference faces per
   * person rather than treating all stored faces as equal. */
  qualityScore: real("quality_score"),
  mediaId: uuid("media_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  personIdx: index("person_faces_person_idx").on(t.personId),
}));

export const personPreferences = pgTable("person_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id").notNull().references(() => people.id),
  key: varchar("key", { length: 128 }).notNull(),
  value: jsonb("value"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id").references(() => people.id),
  robotId: uuid("robot_id").references(() => robots.id),
  transcript: jsonb("transcript"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const mediaFiles = pgTable("media_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  mediaType: varchar("media_type", { length: 32 }).notNull().default("IMAGE"),
  mimeType: varchar("mime_type", { length: 64 }),
  filename: varchar("filename", { length: 256 }),
  googleDriveFileId: varchar("google_drive_file_id", { length: 256 }),
  googleDriveUrl: text("google_drive_url"),
  fileSize: integer("file_size"),
  checksum: varchar("checksum", { length: 128 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const observations = pgTable("observations", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  personId: uuid("person_id").references(() => people.id),
  observationType: varchar("observation_type", { length: 32 }).notNull(),
  description: text("description"),
  confidence: real("confidence"),
  source: varchar("source", { length: 32 }),
  mediaId: uuid("media_id").references(() => mediaFiles.id),
  features: jsonb("features"),
  context: jsonb("context"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  createdAtIdx: index("observations_created_at_idx").on(t.createdAt),
  typeIdx: index("observations_type_idx").on(t.observationType),
}));

export const objects = pgTable("objects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 128 }).notNull(),
  category: varchar("category", { length: 64 }),
  description: text("description"),
  confidence: real("confidence"),
  firstSeen: timestamp("first_seen").defaultNow(),
  lastSeen: timestamp("last_seen").defaultNow(),
  observationCount: integer("observation_count").notNull().default(0),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const objectObservations = pgTable("object_observations", {
  id: uuid("id").primaryKey().defaultRandom(),
  objectId: uuid("object_id").notNull().references(() => objects.id),
  observationId: uuid("observation_id").notNull().references(() => observations.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const objectFeatures = pgTable("object_features", {
  id: uuid("id").primaryKey().defaultRandom(),
  objectId: uuid("object_id").notNull().references(() => objects.id),
  shape: varchar("shape", { length: 64 }),
  primaryColour: varchar("primary_colour", { length: 32 }),
  secondaryColour: varchar("secondary_colour", { length: 32 }),
  estimatedSize: varchar("estimated_size", { length: 32 }),
  texture: varchar("texture", { length: 64 }),
  aspectRatio: real("aspect_ratio"),
  dimensions: jsonb("dimensions"),
  visualFeatures: jsonb("visual_features"),
  semanticFeatures: jsonb("semantic_features"),
});

export const staticMemories = pgTable("static_memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  memoryKey: varchar("memory_key", { length: 128 }).notNull().unique(),
  memoryType: varchar("memory_type", { length: 64 }).notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  content: text("content").notNull(),
  importance: real("importance").notNull().default(0.5),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const dynamicMemories = pgTable("dynamic_memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  personId: uuid("person_id").references(() => people.id),
  observationId: uuid("observation_id").references(() => observations.id),
  memoryType: varchar("memory_type", { length: 64 }),
  title: varchar("title", { length: 256 }).notNull(),
  content: text("content").notNull(),
  source: varchar("source", { length: 32 }).notNull(),
  confidence: real("confidence").notNull(),
  importance: real("importance").notNull().default(0.5),
  verificationStatus: varchar("verification_status", { length: 32 }).notNull().default("UNVERIFIED"),
  requiresReview: boolean("requires_review").notNull().default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  confidenceIdx: index("dynamic_memories_confidence_idx").on(t.confidence),
  createdAtIdx: index("dynamic_memories_created_at_idx").on(t.createdAt),
  verificationIdx: index("dynamic_memories_verification_idx").on(t.verificationStatus),
}));

export const conceptualMemories = pgTable("conceptual_memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  objectId: uuid("object_id").references(() => objects.id),
  observationId: uuid("observation_id").references(() => observations.id),
  conceptName: varchar("concept_name", { length: 128 }).notNull(),
  conceptCategory: varchar("concept_category", { length: 64 }),
  description: text("description"),
  confidence: real("confidence"),
  featureVector: jsonb("feature_vector"),
  semanticVector: jsonb("semantic_vector"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  conceptNameIdx: index("conceptual_memories_concept_name_idx").on(t.conceptName),
}));

export const similarityResults = pgTable("similarity_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  observationId: uuid("observation_id").references(() => observations.id),
  candidateType: varchar("candidate_type", { length: 32 }),
  candidateId: uuid("candidate_id"),
  candidateName: varchar("candidate_name", { length: 128 }),
  totalScore: real("total_score"),
  shapeScore: real("shape_score"),
  colourScore: real("colour_score"),
  sizeScore: real("size_score"),
  appearanceScore: real("appearance_score"),
  contextScore: real("context_score"),
  featureScore: real("feature_score"),
  semanticScore: real("semantic_score"),
  matchingFeatures: jsonb("matching_features"),
  conflictingFeatures: jsonb("conflicting_features"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  observationIdx: index("similarity_results_observation_idx").on(t.observationId),
  totalScoreIdx: index("similarity_results_total_score_idx").on(t.totalScore),
}));

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  personId: uuid("person_id").references(() => people.id),
  taskType: varchar("task_type", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("PENDING"),
  priority: integer("priority").notNull().default(1),
  description: text("description"),
  input: jsonb("input"),
  result: jsonb("result"),
  error: text("error"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  statusIdx: index("tasks_status_idx").on(t.status),
  robotIdx: index("tasks_robot_idx").on(t.robotId),
}));

export const robotState = pgTable("robot_state", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  mood: varchar("mood", { length: 32 }),
  energy: integer("energy"),
  curiosity: integer("curiosity"),
  friendliness: integer("friendliness"),
  alertness: integer("alertness"),
  confidence: integer("confidence"),
  currentIntent: varchar("current_intent", { length: 64 }),
  currentPersonId: uuid("current_person_id").references(() => people.id),
  currentTaskId: uuid("current_task_id").references(() => tasks.id),
  state: jsonb("state"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const moodHistory = pgTable("mood_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  mood: varchar("mood", { length: 32 }),
  snapshot: jsonb("snapshot"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reactions = pgTable("reactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  observationId: uuid("observation_id").references(() => observations.id),
  state: varchar("state", { length: 32 }),
  speech: text("speech"),
  gestures: jsonb("gestures"),
  reason: text("reason"),
  confidence: real("confidence"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const commandHistory = pgTable("command_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  taskId: uuid("task_id").references(() => tasks.id),
  source: varchar("source", { length: 32 }).notNull(),
  commandType: varchar("command_type", { length: 64 }).notNull(),
  command: jsonb("command"),
  status: varchar("status", { length: 32 }).notNull(),
  validationResult: jsonb("validation_result"),
  executionResult: jsonb("execution_result"),
  error: jsonb("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  executedAt: timestamp("executed_at"),
}, (t) => ({
  robotIdx: index("command_history_robot_idx").on(t.robotId),
  createdAtIdx: index("command_history_created_at_idx").on(t.createdAt),
  statusIdx: index("command_history_status_idx").on(t.status),
}));

export const telemetry = pgTable("telemetry", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  wifiRssi: integer("wifi_rssi"),
  freeHeap: integer("free_heap"),
  uptimeSeconds: integer("uptime_seconds"),
  cameraStatus: varchar("camera_status", { length: 16 }),
  pca9685Status: varchar("pca9685_status", { length: 16 }),
  servoPositions: jsonb("servo_positions"),
  trackingState: varchar("tracking_state", { length: 32 }),
  gaitState: varchar("gait_state", { length: 32 }),
  mockMode: boolean("mock_mode").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  robotIdx: index("telemetry_robot_idx").on(t.robotId),
  createdAtIdx: index("telemetry_created_at_idx").on(t.createdAt),
}));

export const systemLogs = pgTable("system_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  level: varchar("level", { length: 16 }).notNull(),
  message: text("message").notNull(),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  levelIdx: index("system_logs_level_idx").on(t.level),
  createdAtIdx: index("system_logs_created_at_idx").on(t.createdAt),
}));

export const piScripts = pgTable("pi_scripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 128 }),
  source: text("source").notNull(),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const compilerExecutions = pgTable("compiler_executions", {
  id: uuid("id").primaryKey().defaultRandom(),
  scriptId: uuid("script_id").references(() => piScripts.id),
  source: text("source"),
  tokens: jsonb("tokens"),
  ast: jsonb("ast"),
  diagnostics: jsonb("diagnostics"),
  ir: jsonb("ir"),
  status: varchar("status", { length: 32 }),
  executionResult: jsonb("execution_result"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const aiRequests = pgTable("ai_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  taskId: uuid("task_id").references(() => tasks.id),
  provider: varchar("provider", { length: 32 }).notNull().default("openrouter"),
  model: varchar("model", { length: 128 }),
  purpose: varchar("purpose", { length: 64 }),
  inputSummary: text("input_summary"),
  outputSummary: text("output_summary"),
  confidence: real("confidence"),
  success: boolean("success").notNull().default(false),
  latencyMs: integer("latency_ms"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const safetyEvents = pgTable("safety_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  eventType: varchar("event_type", { length: 64 }).notNull(),
  severity: varchar("severity", { length: 16 }).notNull(),
  description: text("description"),
  sensorData: jsonb("sensor_data"),
  actionTaken: text("action_taken"),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const servoConfigurations = pgTable("servo_configurations", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  servoId: varchar("servo_id", { length: 64 }),
  name: varchar("name", { length: 128 }).notNull(),
  channel: integer("channel").notNull(),
  servoType: varchar("servo_type", { length: 16 }).notNull(),
  purpose: varchar("purpose", { length: 64 }).notNull(),
  minAngle: integer("min_angle"),
  maxAngle: integer("max_angle"),
  centerAngle: integer("center_angle"),
  neutralPwm: integer("neutral_pwm"),
  minPwm: integer("min_pwm"),
  maxPwm: integer("max_pwm"),
  defaultSpeed: integer("default_speed"),
  directionInverted: boolean("direction_inverted").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const gaitConfigurations = pgTable("gait_configurations", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  name: varchar("name", { length: 64 }).notNull(),
  gaitType: varchar("gait_type", { length: 32 }).notNull(),
  stepDuration: integer("step_duration").notNull().default(400),
  defaultSpeed: integer("default_speed").notNull().default(60),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const gaitPhases = pgTable("gait_phases", {
  id: uuid("id").primaryKey().defaultRandom(),
  gaitConfigurationId: uuid("gait_configuration_id").notNull().references(() => gaitConfigurations.id),
  phaseNumber: integer("phase_number").notNull(),
  durationMs: integer("duration_ms").notNull(),
  leftRotationSpeed: integer("left_rotation_speed").notNull(),
  leftRotationDirection: varchar("left_rotation_direction", { length: 16 }).notNull(),
  rightRotationSpeed: integer("right_rotation_speed").notNull(),
  rightRotationDirection: varchar("right_rotation_direction", { length: 16 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// VISION PIPELINE — durable per-frame outcome log
// ============================================================

/**
 * One row per captured frame's outcome (stored / discarded / skipped).
 * `visionStats` (camera/visionStats.ts) is the fast in-memory gauge used by
 * the live health check; this table is the durable record behind it, so
 * "how many of our photos are actually useful" can be answered for any
 * past time range, not just since the process last restarted.
 */
export const visionFrameEvents = pgTable("vision_frame_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  outcome: varchar("outcome", { length: 16 }).notNull(), // STORED | DISCARDED | SKIPPED_NO_CHANGE
  discardReason: varchar("discard_reason", { length: 32 }),
  meanBrightness: real("mean_brightness"),
  contrast: real("contrast"),
  sharpness: real("sharpness"),
  motionDetected: boolean("motion_detected"),
  mediaId: uuid("media_id").references(() => mediaFiles.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  robotIdx: index("vision_frame_events_robot_idx").on(t.robotId),
  outcomeIdx: index("vision_frame_events_outcome_idx").on(t.outcome),
  createdAtIdx: index("vision_frame_events_created_at_idx").on(t.createdAt),
}));

// ============================================================
// AUTH — users, sessions, verification/reset tokens, audit log
// ============================================================

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 128 }).notNull(),
  email: varchar("email", { length: 256 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 256 }).notNull(),
  role: varchar("role", { length: 16 }).notNull().default("USER"), // ADMIN | TRUSTED | USER
  isVerified: boolean("is_verified").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
  /** Profile picture shown in the dashboard topbar and on this account's
   * admin detail page — reuses the same media_files table camera/person
   * photos live in rather than a separate image store. Nullable; the
   * dashboard shows initials when unset. See routes/users.routes.ts
   * POST /users/me/avatar. */
  avatarMediaId: uuid("avatar_media_id").references(() => mediaFiles.id),
  /** Links this login account to a `people` row — the same identity
   * record Vision's own camera recognizes in person. Set during
   * registration (webcam capture, matched/created via
   * auth/FaceLinking.ts) or later from Settings. Nullable: someone can
   * decline camera access and still have a normal account, just without
   * "Vision already knows me" carried over — see docs/people.md
   * "One identity, however you first met". */
  personId: uuid("person_id").references(() => people.id),
}, (t) => ({
  emailIdx: index("users_email_idx").on(t.email),
  roleIdx: index("users_role_idx").on(t.role),
}));

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  tokenHash: varchar("token_hash", { length: 128 }).notNull(),
  userAgent: varchar("user_agent", { length: 256 }),
  ipAddress: varchar("ip_address", { length: 64 }),
  revoked: boolean("revoked").notNull().default(false),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  userIdx: index("sessions_user_idx").on(t.userId),
  tokenHashIdx: index("sessions_token_hash_idx").on(t.tokenHash),
}));

export const verificationTokens = pgTable("verification_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  tokenHash: varchar("token_hash", { length: 128 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  tokenHash: varchar("token_hash", { length: 128 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  event: varchar("event", { length: 64 }).notNull(),
  ipAddress: varchar("ip_address", { length: 64 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  userIdx: index("audit_logs_user_idx").on(t.userId),
  eventIdx: index("audit_logs_event_idx").on(t.event),
  createdAtIdx: index("audit_logs_created_at_idx").on(t.createdAt),
}));

/** Small generic key/value settings store — e.g. "manual_mode_enabled". */
export const systemSettings = pgTable("system_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================
// ADMIN RESTRICTIONS — "Vision, don't do that" vetoes
// ============================================================

/**
 * A standing veto placed on a command type (optionally scoped to a specific
 * person), issued by an ADMIN — via dashboard or voice. Checked by
 * CommandRegistry on every dispatch, before safety/control-mode, so a
 * restriction blocks the command regardless of who or what re-requests it
 * (AI brain, another person's voice command, Vision Script, dashboard)
 * until an admin explicitly lifts it.
 */
export const adminRestrictions = pgTable("admin_restrictions", {
  id: uuid("id").primaryKey().defaultRandom(),
  commandType: varchar("command_type", { length: 64 }).notNull(),
  scopedPersonId: uuid("scoped_person_id").references(() => people.id), // null = blocked for everyone
  reason: varchar("reason", { length: 256 }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  liftedAt: timestamp("lifted_at"),
}, (t) => ({
  commandTypeIdx: index("admin_restrictions_command_type_idx").on(t.commandType),
  activeIdx: index("admin_restrictions_active_idx").on(t.active),
}));

// ============================================================
// SPEECH EVENTS — conversation arbitration / interruption log
// ============================================================

/**
 * One row per speech turn the ConversationArbiter had to make a call on:
 * a normal turn, an interruption (someone spoke while Vision was already
 * mid-conversation with someone else), or an admin-in-background event.
 * Used to build a per-person "talks too much" signal over time — see
 * ConversationArbiterService.
 */
export const speechEvents = pgTable("speech_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  personId: uuid("person_id").references(() => people.id),
  eventType: varchar("event_type", { length: 32 }).notNull(), // TURN | INTERRUPTION | ADMIN_BACKGROUND | QUIETED
  transcript: text("transcript"),
  wasAdmin: boolean("was_admin").notNull().default(false),
  respondedWith: text("responded_with"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  personIdx: index("speech_events_person_idx").on(t.personId),
  eventTypeIdx: index("speech_events_event_type_idx").on(t.eventType),
  createdAtIdx: index("speech_events_created_at_idx").on(t.createdAt),
}));

// ============================================================
// ULTRASONIC (HC-SR04)
// ============================================================

export const ultrasonicReadings = pgTable("ultrasonic_readings", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  distanceMm: real("distance_mm"),
  rawDistanceMm: real("raw_distance_mm"),
  filteredDistanceMm: real("filtered_distance_mm"),
  confidence: real("confidence"),
  status: varchar("status", { length: 16 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  robotIdx: index("ultrasonic_readings_robot_idx").on(t.robotId),
  createdAtIdx: index("ultrasonic_readings_created_at_idx").on(t.createdAt),
  statusIdx: index("ultrasonic_readings_status_idx").on(t.status),
}));

export const ultrasonicConfigurations = pgTable("ultrasonic_configurations", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  safeDistanceMm: integer("safe_distance_mm").notNull().default(600),
  warningDistanceMm: integer("warning_distance_mm").notNull().default(300),
  stopDistanceMm: integer("stop_distance_mm").notNull().default(150),
  emergencyDistanceMm: integer("emergency_distance_mm").notNull().default(50),
  filterWindow: integer("filter_window").notNull().default(5),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id),
});

// ============================================================
// AUDIO
// ============================================================

export const audioFiles = pgTable("audio_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  personId: uuid("person_id").references(() => people.id),
  direction: varchar("direction", { length: 16 }), // INBOUND | OUTBOUND
  googleDriveFileId: varchar("google_drive_file_id", { length: 256 }),
  googleDriveUrl: text("google_drive_url"),
  durationMs: integer("duration_ms"),
  checksum: varchar("checksum", { length: 128 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const speechTranscriptions = pgTable("speech_transcriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  audioFileId: uuid("audio_file_id").references(() => audioFiles.id),
  transcript: text("transcript"),
  confidence: real("confidence"),
  language: varchar("language", { length: 16 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const voiceInteractions = pgTable("voice_interactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  personId: uuid("person_id").references(() => people.id),
  transcriptionId: uuid("transcription_id").references(() => speechTranscriptions.id),
  intent: varchar("intent", { length: 64 }),
  response: text("response"),
  authorized: boolean("authorized").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// PERSON OBSERVATIONS / INTERACTIONS (distinct from generic `observations`:
// these specifically track "saw but didn't talk" vs "talked" history per person)
// ============================================================

export const personObservations = pgTable("person_observations", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id").references(() => people.id),
  robotId: uuid("robot_id").references(() => robots.id),
  mediaId: uuid("media_id").references(() => mediaFiles.id),
  talkedTo: boolean("talked_to").notNull().default(false),
  confidence: real("confidence"),
  context: jsonb("context"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  personIdx: index("person_observations_person_idx").on(t.personId),
  createdAtIdx: index("person_observations_created_at_idx").on(t.createdAt),
}));

export const personInteractions = pgTable("person_interactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id").references(() => people.id),
  robotId: uuid("robot_id").references(() => robots.id),
  voiceInteractionId: uuid("voice_interaction_id").references(() => voiceInteractions.id),
  summary: text("summary"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// INTELLIGENCE — mental state / curiosity / decisions / emotions
// ============================================================

export const mentalStates = pgTable("mental_states", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  state: varchar("state", { length: 32 }).notNull(),
  curiosity: integer("curiosity"),
  uncertainty: integer("uncertainty"),
  confidence: integer("confidence"),
  attentionTarget: varchar("attention_target", { length: 128 }),
  currentGoal: varchar("current_goal", { length: 128 }),
  context: jsonb("context"),
  explorationActive: boolean("exploration_active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  robotIdx: index("mental_states_robot_idx").on(t.robotId),
  createdAtIdx: index("mental_states_created_at_idx").on(t.createdAt),
}));

export const curiosityEvents = pgTable("curiosity_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  trigger: varchar("trigger", { length: 64 }),
  noveltyScore: real("novelty_score"),
  action: varchar("action", { length: 32 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const decisions = pgTable("decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  observationId: uuid("observation_id").references(() => observations.id),
  decision: varchar("decision", { length: 64 }).notNull(),
  confidence: real("confidence"),
  reason: text("reason"),
  alternatives: jsonb("alternatives"),
  safetyApproved: boolean("safety_approved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  robotIdx: index("decisions_robot_idx").on(t.robotId),
  createdAtIdx: index("decisions_created_at_idx").on(t.createdAt),
}));

export const emotions = pgTable("emotions", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  emotion: varchar("emotion", { length: 32 }).notNull(),
  intensity: integer("intensity"),
  trigger: varchar("trigger", { length: 64 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const memoryLinks = pgTable("memory_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceMemoryId: uuid("source_memory_id").notNull(),
  targetMemoryId: uuid("target_memory_id").notNull(),
  relationship: varchar("relationship", { length: 64 }),
  similarityScore: real("similarity_score"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const aiResponses = pgTable("ai_responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  aiRequestId: uuid("ai_request_id").references(() => aiRequests.id),
  content: text("content"),
  confidence: real("confidence"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const hardwareCapabilities = pgTable("hardware_capabilities", {
  id: uuid("id").primaryKey().defaultRandom(),
  robotId: uuid("robot_id").references(() => robots.id),
  capability: varchar("capability", { length: 64 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// SMART DEVICES — "when explicitly authorized, control small/medium
// connected systems" (see docs/architecture-map.md §7). Deliberately
// generic: any device that can be controlled by hitting a URL (Shelly
// Gen1, Tasmota's HTTP API, Home Assistant webhooks, IFTTT Maker
// webhooks, etc. all work this way) rather than one vendor-specific
// integration. See integrations/HttpSmartDevice.ts.
// ============================================================

export const smartDevices = pgTable("smart_devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Matched case-insensitively against SMART_DEVICE_TRIGGER's deviceName
  // param — see commands/CommandExecutor.ts.
  name: varchar("name", { length: 128 }).notNull().unique(),
  category: varchar("category", { length: 32 }).notNull().default("other"), // light | plug | other
  triggerUrl: text("trigger_url").notNull(),
  method: varchar("method", { length: 8 }).notNull().default("GET"), // GET | POST
  headers: jsonb("headers"), // e.g. { "Authorization": "Bearer ..." } for devices/webhooks that need one
  body: text("body"), // raw request body for POST devices; ignored for GET
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================
// MUSIC TRACKS — real, user-uploaded audio files the robot can actually
// play through its physical speaker, with real detected tempo/beat data
// (see audio/beatDetection.ts) so performance/DanceRunner.ts's
// beat-synced mode has real rhythm to sync against. Deliberately NOT a
// YouTube/Spotify/etc. catalog entry — there's no legitimate way to pull
// playable audio bytes from those services (see docs/music.md), so this
// table only ever represents a file someone actually uploaded.
// ============================================================

export const musicTracks = pgTable("music_tracks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 256 }).notNull(),
  uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id),
  mediaId: uuid("media_id"), // media_files row for the stored original upload — see camera/mediaStorage.ts's storeAudioMedia
  durationMs: integer("duration_ms").notNull(),
  /** Detected tempo — see audio/beatDetection.ts. Real DSP output, not a
   * user-entered or guessed value. */
  bpm: integer("bpm").notNull(),
  /** 0-1, how confident the detector is in `bpm`/`beatTimestampsMs` — low
   * values (near-silent or arrhythmic audio) mean DanceRunner should fall
   * back to the fixed-tempo choreography instead of trusting a shaky
   * detection. See beatDetection.ts's BeatDetectionResult.confidence. */
  beatConfidence: real("beat_confidence").notNull(),
  /** Full detected beat grid, milliseconds from track start — stored so
   * playback doesn't need to re-run DSP every time the same track is
   * played again. */
  beatTimestampsMs: jsonb("beat_timestamps_ms").notNull(),
  checksum: varchar("checksum", { length: 128 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// PLAY REQUESTS — "Vision, play [song]": who asked, what they asked for,
// which real track (if any) matched, and the genuine getting-to-know-you
// conversation Vision has with them while the real search+fetch happens
// in the background. See music/PlaySongService.ts for the orchestration
// and music/SongQuestionProposer.ts for the conversation itself.
// ============================================================

export const playRequests = pgTable("play_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id").references(() => people.id),
  robotId: uuid("robot_id").references(() => robots.id),
  /** The raw spoken request, e.g. "play some coldplay" — never a song's
   * lyrics or content, just what the person asked Vision to do. */
  requestedText: text("requested_text").notNull(),
  /** SEARCHING while Jamendo/FMA lookup + fetch is in flight, FOUND once
   * matched (see matchedTrackId), NOT_FOUND if no licensed match exists
   * for what was asked, PLAYED once playback actually started. */
  status: varchar("status", { length: 16 }).notNull().default("SEARCHING"),
  matchedTrackId: uuid("matched_track_id").references(() => musicTracks.id),
  /** Real question/answer pairs from the conversation Vision has with the
   * requester while their song is being found — see
   * music/SongQuestionProposer.ts. Never includes song lyrics; questions
   * are strictly about the person's own taste/preferences, not the
   * song's content. Array of { question, answer, askedAt }. */
  conversationLog: jsonb("conversation_log").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});


// ============================================================
// SIMULATION MIND STATE - the Autonomous simulator's human-like state, per dashboard user (simulation only)
// ============================================================
export const simulationMindState = pgTable("simulation_mind_state", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  state: jsonb("state").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
