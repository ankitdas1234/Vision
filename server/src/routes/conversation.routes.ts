import { Router, type Request, type Response } from "express";
import { audioService } from "../audio/AudioService";
import { understandIntent } from "../audio/IntentEngine";
import { conversationArbiter } from "../audio/ConversationArbiter";
import { recordUtterance } from "../audio/RepetitionTracker";
import { noteAnnoyance } from "../mental/Annoyance";
import { noteAdminVoiceConfirmed, isAdminFacePresent } from "../people/AdminPresence";
import { openConfirmationWindow, clearPendingConfirmation, TURN_DURATION_MS } from "../people/PendingEmergencyStopConfirmation";
import { controlMode } from "../control/ControlMode";
import { playGesture } from "../reactions/GestureExecutor";
import { diarizationProvider, type SpeakerSegment } from "../audio/Diarization";
import { restrictionService } from "../restrictions/RestrictionService";
import { commandRegistry } from "../commands/CommandRegistry";
import { robotRepository } from "../repositories/robot.repository";
import { peopleRepository } from "../repositories/people.repository";
import { personFacesRepository } from "../repositories/personFaces.repository";
import { getPendingIntroduction, clearPendingIntroduction, extractNameFromTranscript } from "../people/Introductions";
import { getPendingMusicQuestion } from "../people/PendingMusicQuestion";
import { startPlayRequest, handleConversationReply } from "../music/PlaySongService";
import { getPendingBystanderQuestion, clearPendingBystanderQuestion } from "../people/PendingBystanderQuestion";
import { interpretBystanderReply } from "../people/BystanderResponses";
import { getPendingMemoryReview, clearPendingMemoryReview } from "../people/PendingMemoryReview";
import { interpretMemoryReviewReply } from "../people/MemoryReviewInterpreter";
import { memoryRepository } from "../repositories/memory.repository";
import { taskManager } from "../tasks/TaskManager";
import { requireAuth, requireRobotAuth, type AuthedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/authorization";
import { ROBOT_HARDWARE } from "../config/robot";

export const conversationRouter = Router();

/** Intents the repeated-question check applies to. Commands are
 * deliberately excluded: repeating "stop" or "turn left" means it didn't
 * work the first time, which is a completely reasonable thing to do and
 * must never be answered with irritation instead of action. */
const CONVERSATIONAL_INTENTS = new Set(["QUESTION", "SMALL_TALK", "GREETING", "UNKNOWN"]);

const MOVEMENT_INTENT_TO_COMMAND: Record<string, string> = {
  WALK_FORWARD: "WALK_FORWARD", WALK_BACKWARD: "WALK_BACKWARD",
  TURN_LEFT: "TURN_LEFT", TURN_RIGHT: "TURN_RIGHT", WALK_STOP: "WALK_STOP",
};

interface InboundSegment {
  /** Raw audio to run through speech-to-text. Optional when `transcript` is given. */
  audioBase64?: string;
  /** Text that is already transcribed (e.g. the browser's own speech recognition in
   * the 3D simulator, or a typed message). Skips STT; everything after is identical. */
  transcript?: string;
  speakerTag?: string;
  isAdmin?: boolean;
  personId?: string | null;
  startMs?: number;
  endMs?: number;
}

/**
 * One conversation "turn" from the robot's mic. Firmware/gateway posts here
 * (robot-secret auth, same as /heartbeat) whenever it has audio to hand off.
 *
 * TODAY: with the stock single mono mic and MockDiarization, `segments` will
 * almost always be exactly one buffer, and this behaves like a normal
 * single-speaker turn — no code changes needed later. The multi-speaker
 * arbitration path activates automatically the moment `diarizationProvider`
 * is swapped for a real one (see audio/Diarization.ts) that can split one
 * buffer into multiple speaker-tagged segments itself; callers can also
 * submit multiple pre-split segments directly (e.g. a gateway doing its own
 * per-speaker capture) without any server-side changes.
 */
export async function handleConversationTurn(req: Request, res: Response) {
  const body = req.body as { robotCode?: string; segments?: InboundSegment[] };
  const robotCode = body.robotCode || ROBOT_HARDWARE.robotCode;
  const inbound = Array.isArray(body.segments) ? body.segments : [];
  if (inbound.length === 0 || inbound.some((seg) => !seg.audioBase64 && typeof seg.transcript !== "string")) {
    return res.status(400).json({ code: "NO_AUDIO", message: "Each segment needs audioBase64 or a transcript." });
  }

  const robot = await robotRepository.findByCode(robotCode).catch(() => null);
  const robotDbId = robot?.id ?? null; // speech_events/admin_restrictions FK is nullable — fine if the robot row hasn't been seeded yet

  // Transcribe every segment first (STT), THEN arbitrate — arbitration needs
  // real transcripts to tell a direct admin command apart from ambient noise.
  const segments: SpeakerSegment[] = [];
  const intentBySpeaker = new Map<string, ReturnType<typeof understandIntent>>();
  for (const [i, seg] of inbound.entries()) {
    const transcript = typeof seg.transcript === "string"
      ? seg.transcript.trim()
      : (await audioService.processAudio(Buffer.from(seg.audioBase64 ?? "", "base64"), robotCode)).transcript;
    const speakerTag = seg.speakerTag ?? `spk_${i}`;
    const intent = understandIntent(transcript);
    intentBySpeaker.set(speakerTag, intent);
    segments.push({
      speakerTag, transcript, confidence: 1,
      startMs: seg.startMs ?? 0, endMs: seg.endMs ?? 1000,
      isAdmin: !!seg.isAdmin, personId: seg.personId ?? null,
    });
  }

  // If a real diarization provider is configured, it gets first crack at
  // re-splitting/re-tagging the raw audio; MockDiarization returns [] and we
  // fall through to the pre-split segments built above.
  // Diarization works on raw audio, so it only applies when the first segment actually has some.
  const diarized = inbound[0].audioBase64
    ? await diarizationProvider.diarize(Buffer.from(inbound[0].audioBase64, "base64")).catch(() => [])
    : [];
  const finalSegments = diarized.length > 0 ? diarized : segments;

  const arbitration = await conversationArbiter.arbitrate(robotDbId ?? robotCode, finalSegments);

  if (!arbitration.chosenSegment) {
    // Everyone got told to wait (e.g. admin-in-background case) — nothing to act on.
    return res.json({ acted: false, replies: arbitration.replies });
  }

  const chosen = arbitration.chosenSegment;
  const intent = intentBySpeaker.get(chosen.speakerTag) ?? understandIntent(chosen.transcript);

  // Any voice-verified-admin interaction refreshes live admin presence —
  // not just an explicit emergency-stop utterance. See people/AdminPresence.ts.
  if (arbitration.chosenIsAuthorizedAdmin) noteAdminVoiceConfirmed(robotCode);

  // Checked before every pending-flow intercept below (name introduction,
  // bystander search question, music question) — none of those get to
  // swallow an emergency stop. EMERGENCY_STOP is admin-only (see
  // ADMIN_ONLY_COMMANDS). Authorized by EITHER of:
  //   - arbitration.chosenIsAuthorizedAdmin — THIS utterance's own voice
  //     matched an enrolled admin (the exact same bar ADMIN_VETO uses).
  //     Deliberately not the looser isAdminPresent() check: that would let
  //     a stale confirmation from a different turn, possibly a different
  //     speaker, authorize a request it never actually verified.
  //   - isAdminFacePresent(robotCode) — the camera recently, fully
  //     confirmed an admin's face. See people/AdminPresence.ts.
  if (intent.type === "EMERGENCY_STOP_REQUEST") {
    if (!arbitration.chosenIsAuthorizedAdmin && !isAdminFacePresent(robotCode)) {
      // Not a dead end: instead of refusing outright, Vision holds the
      // request open for a short window and actively looks — see
      // people/PendingEmergencyStopConfirmation.ts. BrainOrchestrator
      // watches for a CONFIRMED admin face to show up in that window and
      // fires the stop then, without needing the phrase repeated. This
      // does NOT relax who can authorize a stop — it's still voice or
      // face, just checked once more, right when it's needed, instead of
      // only at the instant the phrase was heard.
      openConfirmationWindow(robotCode, chosen.personId ?? null);
      await playGesture(robotCode, "ADMIN_CHECK_SCAN");
      // A real body turn, not just the head — someone standing behind Vision
      // is outside the head's 180° sweep entirely. No
      // directional microphone exists (see audio/Diarization.ts) so which
      // way to turn first is a guess; BrainOrchestrator follows up with
      // the opposite side if this one doesn't find an admin in time.
      // Bounded (TURN_DURATION_MS) and firmware auto-stops it on-device —
      // see firmware/esp32-cam/src/gait/GaitController.cpp. Fire-and-forget:
      // the HTTP reply shouldn't wait out the physical turn, and skipped
      // entirely in Manual Mode so it can never fight a human's own driving.
      if (!(await controlMode.isManualModeEnabled())) {
        commandRegistry
          .dispatch({ type: "TURN_RIGHT", params: { durationMs: TURN_DURATION_MS }, source: "SYSTEM", robotId: robotCode, isAdmin: true })
          .catch(() => undefined);
      }
      const reply = "I heard that, but I need to check you're an admin first — could you step where I can see you clearly? I'll only stop if I can confirm it.";
      return res.json({ acted: false, transcript: chosen.transcript, intent, replies: [...arbitration.replies, { targetSpeakerTag: chosen.speakerTag, text: reply }] });
    }
    // Speaking it correctly settles the question immediately — no need to
    // leave a confirmation window open behind it.
    clearPendingConfirmation(robotCode);
    // source: "ADMIN" (not "AI") — CommandValidator refuses ADMIN_ONLY_COMMANDS
    // from AI/PI_SCRIPT sources outright, regardless of isAdmin, precisely so
    // the brain's own autonomous decisions can never self-issue one. This
    // dispatch is different: a human, just independently confirmed to be an
    // admin by voice, is the one actually issuing it — Vision is only relaying it.
    const result = await commandRegistry.dispatch({ type: "EMERGENCY_STOP", params: {}, source: "ADMIN", robotId: robotCode, isAdmin: true, personId: chosen.personId ?? undefined });
    const reply = "Emergency stop — everything's halted.";
    return res.json({ acted: true, dispatched: result, transcript: chosen.transcript, intent, replies: [...arbitration.replies, { targetSpeakerTag: chosen.speakerTag, text: reply }] });
  }

  // Vision asked "what's your name?" earlier this cycle (see
  // BrainOrchestrator/people/Introductions.ts) — the very next thing this
  // robot hears back is that answer, not a command or small talk. Checked
  // before intent dispatch so a name that happens to parse as something
  // else ("Wall-E", "Stop") never gets misrouted.
  const pendingIntroduction = getPendingIntroduction(robotCode);
  if (pendingIntroduction) {
    const name = extractNameFromTranscript(chosen.transcript);
    await peopleRepository.update(pendingIntroduction.personId, { name });
    clearPendingIntroduction(robotCode);
    const reply = `Nice to meet you, ${name}!`;
    await commandRegistry.dispatch({ type: "AUDIO_SPEAK", params: { text: reply }, source: "SYSTEM", robotId: robotCode, isAdmin: false });
    return res.json({
      acted: true,
      transcript: chosen.transcript,
      recordedName: name,
      personId: pendingIntroduction.personId,
      replies: [...arbitration.replies, { targetSpeakerTag: chosen.speakerTag, text: reply }],
    });
  }

  // Vision just asked the admin to fact-check something it learned (see
  // brain/BrainOrchestrator.ts + people/PendingMemoryReview.ts) — the
  // next thing heard back is the yes/no/correction answer to THAT, not
  // run through the normal intent classifier. Same ask-then-consume
  // shape as the name-introduction check above. This is the only place
  // a dynamic memory's verificationStatus/content actually changes from
  // a review — there is deliberately no dashboard button for it (see
  // routes/people.routes.ts's memories section).
  const pendingMemoryReview = getPendingMemoryReview(robotCode);
  if (pendingMemoryReview) {
    clearPendingMemoryReview(robotCode);
    const interpretation = await interpretMemoryReviewReply(chosen.transcript);
    if (interpretation.type === "CONFIRM") {
      await memoryRepository.dynamic.updateVerification(pendingMemoryReview.memoryId, "VERIFIED");
    } else if (interpretation.type === "REJECT") {
      await memoryRepository.dynamic.updateVerification(pendingMemoryReview.memoryId, "REJECTED");
    } else if (interpretation.type === "CORRECTION" && interpretation.correctedContent) {
      await memoryRepository.dynamic.correct(pendingMemoryReview.memoryId, { content: interpretation.correctedContent });
    }
    // UNCLEAR: leave the fact exactly as it was — still flagged, so
    // MemoryReviewSelector picks it up again another day rather than
    // Vision guessing at an answer it didn't actually get.
    await commandRegistry.dispatch({ type: "AUDIO_SPEAK", params: { text: interpretation.reply }, source: "SYSTEM", robotId: robotCode, isAdmin: false });
    return res.json({
      acted: true,
      transcript: chosen.transcript,
      memoryReviewInterpretation: interpretation.type,
      memoryId: pendingMemoryReview.memoryId,
      replies: [...arbitration.replies, { targetSpeakerTag: chosen.speakerTag, text: interpretation.reply }],
    });
  }

  // A search mission may have just asked THIS robot's bystander "have you
  // seen so-and-so?" (see people/PersonSearchRunner.ts
  // askBystanderAboutTarget) — the next thing heard back is interpreted as
  // an answer to that specific question, not run through the normal
  // intent/command pipeline. Keyword-based, not real NLU — see
  // people/BystanderResponses.ts for exactly what this can and can't
  // recognize. Only intercepts when a question was actually just asked
  // (not just "a search happens to be running somewhere"), same
  // ask-then-consume shape as the name-introduction check above.
  const pendingBystanderQuestion = getPendingBystanderQuestion(robotCode);
  if (pendingBystanderQuestion) {
    clearPendingBystanderQuestion(robotCode);
    const interpretation = await interpretBystanderReply(chosen.transcript, pendingBystanderQuestion.targetName);
    if (interpretation.locationHint) {
      const task = taskManager.get(pendingBystanderQuestion.taskId);
      taskManager.updateStatus(pendingBystanderQuestion.taskId, task?.status ?? "RUNNING", {
        result: { ...(task?.result ?? {}), lastBystanderHint: interpretation.locationHint },
      });
    }
    await commandRegistry.dispatch({ type: "AUDIO_SPEAK", params: { text: interpretation.reply }, source: "SYSTEM", robotId: robotCode, isAdmin: false });
    return res.json({
      acted: true,
      transcript: chosen.transcript,
      bystanderInterpretation: interpretation.type,
      locationHint: interpretation.locationHint ?? null,
      replies: [...arbitration.replies, { targetSpeakerTag: chosen.speakerTag, text: interpretation.reply }],
    });
  }

  // Vision just asked a getting-to-know-you question while searching for
  // a requested song (music/PlaySongService.ts) — the next thing heard
  // back is the answer to THAT, not run through the normal intent
  // classifier. Same ask-then-consume shape as the two checks above.
  const pendingMusicQuestion = getPendingMusicQuestion(robotCode);
  if (pendingMusicQuestion) {
    await handleConversationReply(robotCode, pendingMusicQuestion.playRequestId, pendingMusicQuestion.personId, pendingMusicQuestion.questionIndex, chosen.transcript);
    return res.json({
      acted: true,
      transcript: chosen.transcript,
      playRequestId: pendingMusicQuestion.playRequestId,
      replies: arbitration.replies,
    });
  }

  // Admin veto / lift — only honored when the chosen speaker is a
  // directly-addressing, voice-matched admin (see ConversationArbiterService).
  if (arbitration.chosenIsAuthorizedAdmin && intent.type === "ADMIN_VETO") {
    const last = commandRegistry.getLastCommand(robotCode);
    if (!last) {
      const reply = "I'm not sure which action you mean — nothing's been run recently for me to stop doing.";
      return res.json({ acted: false, transcript: chosen.transcript, intent, replies: [...arbitration.replies, { targetSpeakerTag: chosen.speakerTag, text: reply }] });
    }
    // req.user isn't available on the robot-authed path; the admin's identity
    // here comes from voice-match (segment.personId), not a login session.
    await restrictionService.ban(last.type as never, {
      scopedPersonId: last.personId ?? null,
      reason: `Vetoed by admin voice command: "${chosen.transcript}"`,
      createdByUserId: chosen.personId ?? "voice-admin",
    });
    const reply = `Understood — I won't do that again${last.personId ? " for that person" : ""} until you say otherwise.`;
    return res.json({ acted: true, restricted: last.type, transcript: chosen.transcript, intent, replies: [...arbitration.replies, { targetSpeakerTag: chosen.speakerTag, text: reply }] });
  }

  if (arbitration.chosenIsAuthorizedAdmin && intent.type === "ADMIN_LIFT_RESTRICTION") {
    const last = commandRegistry.getLastCommand(robotCode);
    if (last) await restrictionService.lift(last.type as never, last.personId ?? null);
    const reply = "Okay, that's allowed again.";
    return res.json({ acted: true, transcript: chosen.transcript, intent, replies: [...arbitration.replies, { targetSpeakerTag: chosen.speakerTag, text: reply }] });
  }

  // Asked the same thing several times over? Vision answers patiently for
  // a while and then stops pretending it hasn't noticed — see
  // audio/RepetitionTracker.ts for what counts as "the same question" and
  // how the pushback escalates. Checked AFTER commands and admin
  // veto/lift above, so none of those can ever be swallowed by it.
  if (CONVERSATIONAL_INTENTS.has(intent.type)) {
    const speakerKey = chosen.personId ?? `${robotCode}:${chosen.speakerTag}`;
    const repetition = recordUtterance(speakerKey, chosen.transcript);
    if (repetition.annoyed && repetition.reply) {
      // Irritation outlives this one reply: for the next minute the brain
      // loop reads it too, so Vision's mood and gestures match its tone
      // instead of it snapping and then instantly beaming again.
      noteAnnoyance(robotCode, repetition.level);
      await commandRegistry.dispatch({ type: "AUDIO_SPEAK", params: { text: repetition.reply }, source: "SYSTEM", robotId: robotCode, isAdmin: false });
      playGesture(robotCode, "ANNOYED_TURN_AWAY").catch(() => undefined);
      return res.json({
        acted: true,
        transcript: chosen.transcript,
        intent,
        repeatedQuestion: { count: repetition.repeatCount, level: repetition.level },
        replies: [...arbitration.replies, { targetSpeakerTag: chosen.speakerTag, text: repetition.reply }],
      });
    }
  }

  if (intent.type === "MOVEMENT_COMMAND") {
    const commandType = MOVEMENT_INTENT_TO_COMMAND[(intent.payload?.command as string) ?? ""];
    if (commandType) {
      try {
        const result = await commandRegistry.dispatch({
          type: commandType as never, params: {}, source: "AI",
          robotId: robotCode, isAdmin: arbitration.chosenIsAuthorizedAdmin,
          personId: chosen.personId ?? undefined,
        });
        return res.json({ acted: true, dispatched: result, transcript: chosen.transcript, intent, replies: arbitration.replies });
      } catch (err) {
        // A live admin restriction (or safety/control-mode block) lands here —
        // Vision explains why rather than silently ignoring the request.
        const reply = (err as Error).message;
        return res.json({ acted: false, transcript: chosen.transcript, intent, replies: [...arbitration.replies, { targetSpeakerTag: chosen.speakerTag, text: reply }] });
      }
    }
  }

  if (intent.type === "NOT_ME") {
    let reply = "Sorry about that! I'll learn your face again next time I see you.";
    if (chosen.personId) {
      const deletedCount = await personFacesRepository.deleteAllForPerson(chosen.personId);
      if (deletedCount === 0) reply = "Okay — I didn't actually have a face saved for that, but I'll be more careful.";
    } else {
      reply = "Sorry about that — I'm not sure who I mixed you up with, but I'll pay closer attention.";
    }
    await commandRegistry.dispatch({ type: "AUDIO_SPEAK", params: { text: reply }, source: "SYSTEM", robotId: robotCode, isAdmin: true });
    return res.json({ acted: true, transcript: chosen.transcript, intent, replies: arbitration.replies });
  }

  if (intent.type === "DANCE_PREFERENCE") {
    const enabled = Boolean(intent.payload?.enabled);
    if (chosen.personId) {
      await peopleRepository.update(chosen.personId, { autonomousDanceEnabled: enabled });
    }
    const reply = enabled ? "Got it — I'll dance again!" : "Got it, I won't dance — I'll still play the music.";
    await commandRegistry.dispatch({ type: "AUDIO_SPEAK", params: { text: reply }, source: "SYSTEM", robotId: robotCode, isAdmin: true });
    return res.json({ acted: true, transcript: chosen.transcript, intent, replies: arbitration.replies });
  }

  if (intent.type === "PLAY_SONG") {
    const requestedText = (intent.payload?.requestedText as string) ?? chosen.transcript;
    const playRequest = await startPlayRequest(robotCode, chosen.personId ?? null, requestedText);
    return res.json({ acted: true, transcript: chosen.transcript, intent, playRequestId: playRequest.id, replies: arbitration.replies });
  }

  return res.json({ acted: false, transcript: chosen.transcript, intent, replies: arbitration.replies });
}

conversationRouter.post("/audio/conversation-turn", requireRobotAuth, handleConversationTurn);

// ============================================================
// Admin restriction management (dashboard)
// ============================================================
export const restrictionsRouter = Router();
// Scoped to this router's own prefix — see audio.routes.ts for why an
// unscoped `.use(requireAuth)` would leak into every other router mounted
// on the same flat /api namespace.
restrictionsRouter.use("/restrictions", requireAuth);

restrictionsRouter.get("/restrictions", requireRole("TRUSTED"), async (_req, res) => {
  res.json(await restrictionService.list());
});

restrictionsRouter.post("/restrictions", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const { commandType, scopedPersonId, reason } = req.body ?? {};
  if (!commandType) return res.status(400).json({ code: "INVALID_INPUT", message: "commandType is required." });
  const row = await restrictionService.ban(commandType, { scopedPersonId: scopedPersonId ?? null, reason, createdByUserId: req.user!.id });
  res.status(201).json(row);
});

restrictionsRouter.post("/restrictions/lift", requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const { commandType, scopedPersonId } = req.body ?? {};
  if (!commandType) return res.status(400).json({ code: "INVALID_INPUT", message: "commandType is required." });
  await restrictionService.lift(commandType, scopedPersonId ?? null);
  res.json({ lifted: true });
});
