import { servoManager } from "../servos/ServoManager";
import { GaitController } from "../gait/GaitController";
import { EmergencyStop } from "../safety/EmergencyStop";
import { safetyManager } from "../safety/SafetyManager";
import { audioService } from "../audio/AudioService";
import { setPendingSpeech } from "../audio/PendingSpeechCache";
import { ultrasonicController } from "../ultrasonic/UltrasonicController";
import { getAttentionControllerFor } from "../attention/AttentionController";
import { brainOrchestrator } from "../brain/BrainOrchestrator";
import { memoryManager } from "../memory/MemoryManager";
import { createDynamicMemory } from "../memory/dynamic/learning";
import { taskManager } from "../tasks/TaskManager";
import { runPersonSearch } from "../people/PersonSearchRunner";
import { runDance } from "../performance/DanceRunner";
import { smartDevicesRepository } from "../repositories/smartDevices.repository";
import { triggerSmartDevice } from "../integrations/HttpSmartDevice";
import { startPlayRequest } from "../music/PlaySongService";
import { peopleRepository } from "../repositories/people.repository";
import { personFacesRepository } from "../repositories/personFaces.repository";
import { getHeadAngle, setHeadAngle, centerHead } from "../attention/HeadController";
import { LEG_CHANNELS } from "../servos/ServoConfiguration";
import type { CommandHandler, CommandHandlerArgs } from "./commandTypes";
import type { CommandType } from "../packages/types";

const gaitController = new GaitController(servoManager);
const emergencyStop = new EmergencyStop(servoManager, gaitController);

const handlers: Partial<Record<CommandType, CommandHandler>> = {
  // EYE_* commands drive the HEAD servo (CH0): camera + ultrasonic ride on it,
  // 0-180° like a human turning their head. See attention/HeadController.ts.
  // The legs are separate servos, so looking never interrupts walking.
  EYE_CENTER: async () => ({ angle: centerHead(servoManager) }),
  EYE_LEFT: async ({ params }) => ({ angle: setHeadAngle(Math.max(0, getHeadAngle() - ((params as any).step ?? 10)), servoManager) }),
  EYE_RIGHT: async ({ params }) => ({ angle: setHeadAngle(Math.min(180, getHeadAngle() + ((params as any).step ?? 10)), servoManager) }),
  EYE_SET: async ({ params }) => ({ angle: setHeadAngle((params as any).angle, servoManager) }),
  // Server-driven single-step tracking correction — the ESP32-CAM runs the
  // continuous low-latency tracking loop itself (see firmware/.../EyeTracker);
  // this command points the head at the last known target bearing.
  EYE_TRACK_PERSON: async ({ params }) => {
    const target = (params as any).targetAngle;
    const angle = typeof target === "number" ? setHeadAngle(target, servoManager) : getHeadAngle();
    return { angle, tracking: true };
  },

  LEFT_LEG_FORWARD: async ({ params }) => ({ pwm: servoManager.getContinuous(LEG_CHANNELS.left).forward((params as any).speed) }),
  LEFT_LEG_REVERSE: async ({ params }) => ({ pwm: servoManager.getContinuous(LEG_CHANNELS.left).reverse((params as any).speed) }),
  // Bidirectional convenience command: positive speed = forward, negative = reverse, 0 = stop.
  LEFT_LEG_ROTATE: async ({ params }) => {
    const speed = (params as any).speed ?? 0;
    const pwm = speed > 0 ? servoManager.getContinuous(LEG_CHANNELS.left).forward(speed) : speed < 0 ? servoManager.getContinuous(LEG_CHANNELS.left).reverse(-speed) : servoManager.getContinuous(LEG_CHANNELS.left).stop();
    return { pwm };
  },
  LEFT_LEG_STOP: async () => ({ pwm: servoManager.getContinuous(LEG_CHANNELS.left).stop() }),

  RIGHT_LEG_FORWARD: async ({ params }) => ({ pwm: servoManager.getContinuous(LEG_CHANNELS.right).forward((params as any).speed) }),
  RIGHT_LEG_REVERSE: async ({ params }) => ({ pwm: servoManager.getContinuous(LEG_CHANNELS.right).reverse((params as any).speed) }),
  RIGHT_LEG_ROTATE: async ({ params }) => {
    const speed = (params as any).speed ?? 0;
    const pwm = speed > 0 ? servoManager.getContinuous(LEG_CHANNELS.right).forward(speed) : speed < 0 ? servoManager.getContinuous(LEG_CHANNELS.right).reverse(-speed) : servoManager.getContinuous(LEG_CHANNELS.right).stop();
    return { pwm };
  },
  RIGHT_LEG_STOP: async () => ({ pwm: servoManager.getContinuous(LEG_CHANNELS.right).stop() }),

  WALK_FORWARD: async ({ params }) => { await gaitController.walkForward((params as any).durationMs); return { gaitState: gaitController.gaitState }; },
  WALK_BACKWARD: async ({ params }) => { await gaitController.walkBackward((params as any).durationMs); return { gaitState: gaitController.gaitState }; },
  TURN_LEFT: async ({ params }) => { await gaitController.turnLeft((params as any).durationMs); return { gaitState: gaitController.gaitState }; },
  TURN_RIGHT: async ({ params }) => { await gaitController.turnRight((params as any).durationMs); return { gaitState: gaitController.gaitState }; },
  WALK_STOP: async () => { gaitController.stop(); return { gaitState: gaitController.gaitState }; },

  AUDIO_START_LISTENING: async () => audioService.startListening(),
  AUDIO_STOP_LISTENING: async () => audioService.stopListening(),
  AUDIO_SPEAK: async ({ ctx, params }) => {
    const result = await audioService.speak((params as any).text);
    // Cache the synthesized audio for the robot's own speaker to pick up
    // on its next command-poll cycle — see audio/PendingSpeechCache.ts and
    // protocol/CommandPoller.cpp. The HTTP response below still carries it
    // too, for a dashboard preview player.
    if (result.audioBase64 && result.format && result.sampleRateHz) {
      setPendingSpeech(ctx.robotId, {
        audioBase64: result.audioBase64,
        mimeType: result.mimeType ?? "audio/mpeg",
        format: result.format,
        sampleRateHz: result.sampleRateHz,
      });
    }
    return result;
  },
  AUDIO_STOP: async () => audioService.stopAudio(),

  ULTRASONIC_READ: async () => ({ ...ultrasonicController.read() }),
  ULTRASONIC_CALIBRATE: async ({ params }) => ({ thresholds: ultrasonicController.calibrate(params as any) }),
  ULTRASONIC_ENABLE: async () => { ultrasonicController.enable(); return { enabled: true }; },
  ULTRASONIC_DISABLE: async () => { ultrasonicController.disable(); return { enabled: false }; },

  SERVOS_SAFE: async () => { servoManager.allSafe(); return { safe: true }; },
  EMERGENCY_STOP: async ({ ctx }) => {
    safetyManager.setEmergency(true);
    const event = emergencyStop.trigger(ctx.robotId, "Manual/AI-triggered emergency stop");
    // allSafe() (inside EmergencyStop) also recentres the head servo to 90°.
    return { ...event };
  },
  // The only way to resume hardware commands after EMERGENCY_STOP. ADMIN-only
  // (see ADMIN_ONLY_COMMANDS) and requires a reason — clearing an emergency
  // stop is a deliberate "I checked, it's safe now" judgment call, not a
  // one-click undo. Does NOT re-arm any servo motion by itself; it only lifts
  // the SafetyManager gate, so the robot stays in its safe position until a
  // fresh command is issued.
  EMERGENCY_CLEAR: async ({ params, ctx }) => {
    safetyManager.setEmergency(false);
    return { cleared: true, reason: (params as { reason: string }).reason, robotId: ctx.robotId };
  },

  // A local empty-buffer "capture" here would always fail decode and do
  // nothing useful — the server has no camera of its own. The real fix:
  // flag an immediate capture request that GET /api/camera/schedule
  // surfaces, which firmware's CaptureScheduler already polls — this is
  // how "capture now" from the dashboard actually reaches hardware the
  // server can't address directly.
  CAMERA_CAPTURE: async ({ ctx }) => {
    getAttentionControllerFor(ctx.robotId).requestImmediateCapture();
    return { requested: true, message: "The robot will capture on its next schedule poll" };
  },
  CAMERA_START_TRACKING: async () => ({ tracking: true }),
  CAMERA_STOP_TRACKING: async () => ({ tracking: false }),

  BRAIN_OBSERVE: async ({ ctx }) => ({ ...(await brainOrchestrator.observeAndReact(Buffer.from(""), ctx.robotId)) }),
  BRAIN_PROCESS: async ({ params }) => ({ observationId: (params as any).observationId, processed: true }),

  MEMORY_SEARCH: async ({ params }) => ({ ...(await memoryManager.lookup((params as any).query ?? "")) }),
  MEMORY_LEARN: async ({ params }) => {
    const p = params as { title: string; content: string; source?: string };
    const record = createDynamicMemory({ id: crypto.randomUUID(), title: p.title, content: p.content, source: p.source ?? "PI_SCRIPT", confidence: 0.6 });
    memoryManager.dynamicMemory.add(record);
    return { ...record };
  },

  TASK_START: async ({ ctx, params }) => ({ ...taskManager.create({ robotId: ctx.robotId, taskType: (params as any).taskType, input: (params as any).input }) }),
  TASK_CANCEL: async ({ params }) => ({ ...(taskManager.cancel((params as any).taskId) ?? { cancelled: false }) }),

  // "Vision, find Sam" — starts a bounded wander-and-scan mission (see
  // people/PersonSearchRunner.ts for exactly what "find" and "bring back"
  // mean on hardware with no real navigation) and returns immediately with
  // a taskId; the mission itself runs in the background. Poll its progress
  // via GET /api/tasks or cancel it via POST /api/tasks/:id/cancel.
  //
  // If the name matches more than one registered person, Vision asks out
  // loud and resolves it from a photo shown to its own camera — see
  // people/PendingDisambiguation.ts. There's no way to pre-supply a photo
  // here; a plaintext command has nowhere to put one.
  FIND_PERSON: async ({ ctx, params }) => {
    const name = ((params as any).name ?? (params as any).text) as string;
    const task = taskManager.create({ robotId: ctx.robotId, taskType: "FIND_PERSON", input: { name }, personId: ctx.personId, description: `Find ${name}` });
    runPersonSearch(task.id, ctx.robotId, name, ctx.personId).catch((err) => taskManager.updateStatus(task.id, "FAILED", { error: (err as Error).message }));
    return { taskId: task.id, status: "PENDING", message: `Started searching for ${name}` };
  },

  // "Vision, play a song and dance" (no specific uploaded track named) —
  // fixed-tempo choreography plus a spoken announcement. To dance synced
  // to a specific uploaded track's real beats, see routes/music.routes.ts's
  // POST /music/tracks/:id/play, which calls runDanceToBeats instead.
  DANCE: async ({ ctx, params }) => {
    const durationMs = (params as any).durationMs as number | undefined;
    const trackId = ((params as any).trackId ?? (params as any).text) as string | undefined;
    const task = taskManager.create({ robotId: ctx.robotId, taskType: "DANCE", input: { trackId, durationMs }, description: "Dance" });
    runDance(task.id, ctx.robotId, durationMs, trackId).catch((err) => taskManager.updateStatus(task.id, "FAILED", { error: (err as Error).message }));
    return { taskId: task.id, status: "PENDING" };
  },

  // "Vision, turn on the living room lamp" — resolves a device registered
  // by name (ADMIN-only registration, see routes/smartDevices.routes.ts)
  // and sends exactly the HTTP request configured for it. See
  // integrations/HttpSmartDevice.ts for what this can and can't do (any
  // HTTP-triggerable device — Shelly, Tasmota, Home Assistant webhooks,
  // IFTTT — not a vendor-specific SDK).
  SMART_DEVICE_TRIGGER: async ({ params }) => {
    const name = ((params as any).name ?? (params as any).text) as string;
    const device = await smartDevicesRepository.findByName(name);
    if (!device) return { success: false, error: `No smart device named "${name}" is registered` };
    return triggerSmartDevice(device);
  },

  // Real, first-class dispatch path for "Vision, play [song]" — previously
  // only reachable via the PLAY_SONG voice intent (conversation.routes.ts),
  // now also usable from a Vision Script, the dashboard, or a manual
  // command. See music/PlaySongService.ts for the full search + getting-
  // to-know-you conversation + beat-synced-dance pipeline this kicks off.
  PLAY_SONG_REQUEST: async ({ ctx, params }) => {
    const text = ((params as any).text) as string;
    const personId = ((params as any).personId as string | undefined) ?? ctx.personId;
    const playRequest = await startPlayRequest(ctx.robotId, personId ?? null, text);
    return { playRequestId: playRequest.id, status: playRequest.status };
  },

  // Real, first-class dispatch path for "Ram, don't dance" / "ok dance" —
  // previously only reachable via the DANCE_PREFERENCE voice intent. See
  // music/PlaySongService.ts's finishWithResult for where this preference
  // actually gets checked before deciding whether to dance.
  SET_DANCE_PREFERENCE: async ({ params }) => {
    const personId = (params as any).personId as string;
    const enabled = (params as any).enabled as boolean;
    await peopleRepository.update(personId, { autonomousDanceEnabled: enabled });
    return { personId, autonomousDanceEnabled: enabled };
  },

  // Real, first-class dispatch path for "that's not me" — previously only
  // reachable via the NOT_ME voice intent. Clears every registered face
  // for this person; the next real detection (perception/faceEmbedding.ts)
  // registers a fresh embedding from scratch.
  RESET_PERSON_FACE: async ({ params }) => {
    const personId = (params as any).personId as string;
    const deletedCount = await personFacesRepository.deleteAllForPerson(personId);
    return { personId, deletedCount };
  },

  // SCRIPT_COMPILE / SCRIPT_EXECUTE are intentionally NOT handled here — a Vision
  // Script recursively compiling/executing another script has no safe bound
  // on recursion depth. Those two commands are only reachable via the
  // dedicated /api/scripts/* routes (see routes/scripts.routes.ts), which
  // enforce the same compiler-enabled kill switch.
};

export class CommandExecutor {
  async execute(args: CommandHandlerArgs) {
    const handler = handlers[args.type];
    if (!handler) throw new Error(`No executor registered for command ${args.type}`);
    return handler(args);
  }
}

export const commandExecutor = new CommandExecutor();
export { gaitController, emergencyStop };
