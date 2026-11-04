import { processObservation } from "./observationProcessor";
import { decideAndStoreMedia } from "../camera/mediaCapture";
import { memoryManager } from "../memory/MemoryManager";
import { mentalIntelligence } from "../mental/MentalIntelligence";
import { decisionMaker } from "../decisions/DecisionMaker";
import { reactionEngine } from "../reactions/ReactionEngine";
import { commandRegistry } from "../commands/CommandRegistry";
import { safetyManager } from "../safety/SafetyManager";
import { ultrasonicController } from "../ultrasonic/UltrasonicController";
import { trackPresence } from "../ultrasonic/PresenceDetector";
import { getAttentionControllerFor } from "../attention/AttentionController";
import { decideHeadCommand, type HeadCommand } from "../attention/HeadOrientationController";
import { getScanDirectionFor, setScanDirectionFor } from "../attention/headState";
import { getHeadAngle } from "../attention/HeadController";
import { servoManager } from "../servos/ServoManager";
import { LEG_CHANNELS } from "../servos/ServoConfiguration";

/** True while either leg servo is being driven (walking or turning). */
function legsAreDriving(): boolean {
  return [LEG_CHANNELS.left, LEG_CHANNELS.right].some((ch) => servoManager.getContinuous(ch).state.direction !== "STOP");
}
import { controlMode } from "../control/ControlMode";
import { personEncounterService } from "../people/PersonEncounterService";
import { personSearchService } from "../people/PersonSearchService";
import { askBystanderAboutTarget } from "../people/PersonSearchRunner";
import { askForName, getPendingIntroduction } from "../people/Introductions";
import { shouldGreet, recordGreeted } from "../people/GreetingThrottle";
import { askAboutMemory } from "../people/PendingMemoryReview";
import { shouldOfferMemoryReview, recordMemoryReviewOffered, pickMemoryReviewCandidate } from "../people/MemoryReviewSelector";
import { recordInteraction, takeFarewellTarget } from "../people/FarewellTracker";
import { getPendingDisambiguation, isTimedOut, resolveDisambiguation } from "../people/PendingDisambiguation";
import { tick as explorationTick, recordObservation as recordExplorationObservation } from "../curiosity/ExplorationController";
import { taskManager } from "../tasks/TaskManager";
import { computeFaceEmbedding, faceDistance, NoFaceDetectedError } from "../perception/faceEmbedding";
import { extractFeatures } from "../perception/featureExtraction";
import type { VisualFeatures } from "../perception/featureExtraction";
import { personFacesRepository } from "../repositories/personFaces.repository";
import { RECOGNITION_MATCH_THRESHOLD_DISTANCE } from "../perception/personRecognition";
import { playEmbodiedGesture, playIdleFidget, playGesture, type GestureName } from "../reactions/GestureExecutor";
import { evaluateLowLight } from "../perception/LowLightAssistance";
import { shouldReactToProximityContact } from "../people/TouchProximityAssistance";
import { shouldAttemptFaceVisibilityHelp, resetFaceVisibilityState } from "../people/FaceVisibilityAssistance";
import { runFaceVisibilitySequence } from "../people/FaceVisibilityRunner";
import { getAnnoyance } from "../mental/Annoyance";
import { noteAdminFaceConfirmed } from "../people/AdminPresence";
import { isConfirmationPending, hasConfirmationExpired, getPendingConfirmation, markTimedOutMessageSent, clearPendingConfirmation, shouldAttemptSecondTurn, markSecondTurnDone, TURN_DURATION_MS } from "../people/PendingEmergencyStopConfirmation";
import { logger } from "../logging/Logger";
import type { BrainCycleResult, PerceptionSummary } from "./brainTypes";
import type { CommandResult, UltrasonicState } from "../packages/types";

const CLOSE_ULTRASONIC_STATES: ReadonlySet<UltrasonicState> = new Set(["NEAR", "WARNING", "OBSTACLE", "VERY_CLOSE"]);

/**
 * "Is this person actually approaching to interact, or just visible in
 * frame while walking past / standing off to the side?" Gates whether
 * Vision speaks at all — every detected person still gets logged with a
 * photo either way (see PersonEncounterService), but only someone centered
 * in view AND within conversational distance gets greeted or asked their
 * name. Distance comes from the ultrasonic sensor, which is fixed to the
 * same head mount as the camera (docs/ultrasonic.md), so it only means what
 * it says while the head is roughly facing them — which TRACK/HOLD
 * (attention/HeadController.ts) already ensures by the time this is checked.
 */
const CONVERSATION_DISTANCE_MM = 1200;
const FRAME_CENTER_TOLERANCE_FRACTION = 0.22;

function isApproaching(personCenterX: number | undefined, frameWidth: number, ultrasonicDistanceMm: number): boolean {
  if (personCenterX === undefined || frameWidth === 0) return false;
  const centered = Math.abs(personCenterX - frameWidth / 2) <= frameWidth * FRAME_CENTER_TOLERANCE_FRACTION;
  return centered && ultrasonicDistanceMm <= CONVERSATION_DISTANCE_MM;
}

/**
 * Coordinates perception -> memory -> mental intelligence -> decision ->
 * reaction -> command, WITHOUT implementing any subsystem itself.
 *
 * This is the single entry point the whole robot runs through: whenever
 * the ESP32-S3 posts a captured frame (see camera.routes.ts
 * POST /camera/capture -> CameraService -> here), everything happens
 * automatically in one pass — quality/motion gating, detection, identity
 * recognition (recall a known person or register a new one), memory,
 * mental state, decision, reaction, head orientation, and person-encounter
 * logging. Nothing needs to call back into the robot or poll for a
 * separate "now think about it" step; the brain runs continuously for as
 * long as the hardware keeps sending frames — i.e. until it loses power.
 */
export class BrainOrchestrator {
  async observeAndReact(imageBuffer: Buffer, robotId: string): Promise<BrainCycleResult> {
    const observationId = crypto.randomUUID();

    // Peripheral sense: read the current ultrasonic state and turn it into
    // an orienting-relevant event (did something just get close?).
    const ultrasonicReading = ultrasonicController.read();
    const presenceEvent = trackPresence(robotId, ultrasonicReading);

    const perceptionResult = await processObservation(imageBuffer, robotId);

    // Store (or discard/skip) the frame exactly once, using the quality/
    // motion analysis processObservation already computed — see
    // camera/mediaCapture.ts for why this must not re-run that analysis.
    const media = await decideAndStoreMedia(imageBuffer, robotId, perceptionResult.quality, perceptionResult.motion);

    // "Show me a photo of who you mean" (see people/PendingDisambiguation.ts):
    // deliberately independent of the normal detection pipeline above,
    // because a photo HELD UP to the camera is typically held steady —
    // exactly what the motion gate would otherwise treat as "nothing
    // changed" and skip. Runs on any usable frame regardless of
    // perceptionResult.detectionSkipped. Never throws into the main cycle.
    await this.tryResolveDisambiguation(robotId, imageBuffer, perceptionResult.frameDiscarded);

    // "I sense something close but can't see it" is itself meaningful
    // signal (occlusion, darkness, something below/above camera FOV) and
    // should raise curiosity rather than being silently dropped.
    const somethingCloseOnUltrasonic = CLOSE_ULTRASONIC_STATES.has(ultrasonicReading.status);
    const visionFoundNothing = !perceptionResult.person.personDetected && perceptionResult.objects.length === 0;
    const sensorsDisagree = somethingCloseOnUltrasonic && visionFoundNothing && !perceptionResult.frameDiscarded;

    // Real fix for a previously-orphaned method: mentalIntelligence's idle
    // clock (what exploration's 10-minute threshold measures against) only
    // moves forward if something actually resets it — noteHumanInteraction()
    // existed but nothing called it, so the idle timer never reset even
    // while people were regularly detected. A person being seen in frame
    // is what "not alone" means here, so this resets it every cycle
    // someone's present — exploration correctly can't start (and
    // immediately stops if already running) whenever anyone's around, and
    // only resumes counting once they're gone.
    if (perceptionResult.person.personDetected) {
      mentalIntelligence.noteHumanInteraction();
    }

    const attention = getAttentionControllerFor(robotId).update({
      presenceEvent: presenceEvent.type,
      frameHadInterest: perceptionResult.motion.present && !perceptionResult.frameDiscarded,
      personDetected: perceptionResult.person.personDetected,
      sensorsDisagree,
    });

    // REAL BUG FIX: the STATIC -> DYNAMIC -> CONCEPTUAL -> AI priority
    // chain is fully implemented in MemoryManager.lookup(), but CONCEPTUAL
    // never actually ran in production — this call always passed a
    // person-name query with no `features`, and MemoryManager only
    // attempts a conceptual comparison `if (features)`. So every lookup
    // that didn't resolve via STATIC/DYNAMIC skipped straight past
    // CONCEPTUAL to AI, contradicting both this chain's own contract and
    // perception/objectDetection.ts's docstring, which explicitly says a
    // detected object's shape/size is "real, useful signal for
    // MemoryManager's conceptual-memory matching."
    //
    // Fix: a detected PERSON still looks up by name only (conceptual
    // shape/colour comparison isn't meaningful for face identity — that's
    // what perception/personRecognition.ts's face embeddings already do,
    // via a completely different, more precise comparison). But when
    // there's no person and there IS a detected OBJECT, look it up by
    // name/category AND pass its real extracted visual features — this is
    // exactly the case CONCEPTUAL memory exists for: "I don't have a
    // learned fact about this by name, but does it look like something I
    // do know?"
    let lookupQuery = perceptionResult.recognition?.name ?? "unknown_person";
    let lookupFeatures: VisualFeatures | undefined;
    if (!perceptionResult.person.personDetected && perceptionResult.objects.length > 0) {
      const topObject = perceptionResult.objects.reduce((a, b) => (b.confidence > a.confidence ? b : a));
      lookupQuery = topObject.name;
      lookupFeatures = await extractFeatures(imageBuffer, topObject);
    }
    const memoryResult = await memoryManager.lookup(lookupQuery, lookupFeatures);

    // Combined physical safety: emergency stop AND live ultrasonic obstacle state.
    const isSafe = !safetyManager.isEmergencyActive() && ultrasonicController.isMovementSafe();

    // Real signal, not a placeholder: any other RUNNING task for this
    // robot (a dance, a person search, a script run) means exploration
    // shouldn't start or continue — it would fight the active task for
    // the same servos. The EXPLORATION task itself is excluded, since
    // its own presence shouldn't block its own continuation.
    const conflictingCriticalTask = taskManager
      .list()
      .some((t) => t.robotId === robotId && t.status === "RUNNING" && t.taskType !== "EXPLORATION");

    // Keeps a rolling, real picture of what's actually been detected
    // (genuine COCO-80 labels — see perception/objectDetectionModel.ts)
    // building up the whole time Vision is awake, not just once
    // exploration starts — otherwise the goal proposer's first decision
    // would always be made with zero context just because nothing
    // happened to be in frame at the exact instant exploration began.
    recordExplorationObservation(robotId, perceptionResult.objects.map((o) => o.name));

    const mentalOutput = mentalIntelligence.evaluate({
      personCategory: perceptionResult.recognition?.category,
      memoryConfidence: memoryResult.confidence,
      isSafe,
      curiosityInput: {
        isUnknownObject: perceptionResult.objects.length > 0,
        isUnknownPerson: perceptionResult.recognition?.category === "UNKNOWN",
        isUnexpectedEvent: sensorsDisagree,
        hasConflictingMemory: false,
        isUnfamiliarEnvironment: false,
        recentlyInvestigated: false,
      },
      exploration: { activeConversation: false, conflictingCriticalTask, hardwareHealthy: true },
      // Irritation set by the conversation layer (a repeated question, or
      // someone talking over a turn) shows up here as an ANNOYED mood and
      // a turn-away gesture for as long as it lasts — see mental/Annoyance.ts.
      annoyance: getAnnoyance(robotId),
    });

    // The piece that was missing: MentalIntelligence already computes
    // explorationActive correctly (see mental/MentalIntelligence.ts) but
    // nothing previously consumed it. This turns "Vision is alone and
    // it's been a while" into actual goal-directed movement — see
    // curiosity/ExplorationController.ts for the full lifecycle
    // (start/continue/instantly-preempt). Never awaited-and-blocking in a
    // way that could stall the rest of the cycle: any failure inside is
    // caught and logged there, not here.
    explorationTick(robotId, mentalOutput.state.explorationActive).catch((err) =>
      logger.warn("Exploration tick failed (non-fatal)", { robotId, error: (err as Error).message }),
    );

    const decision = decisionMaker.decide({
      observationId,
      memorySource: memoryResult.source as import("./../packages/types").MemorySource, // the brain always allows the AI, so never "NONE"
      memoryConfidence: memoryResult.confidence,
      mentalState: mentalOutput.state,
      personDetected: perceptionResult.person.personDetected,
    });

    const reaction = reactionEngine.select(decision, mentalOutput.behaviorTone);

    const commandResults: CommandResult[] = [];
    // The brain always PERCEIVES and DECIDES every cycle (visible on the
    // Brain/Decisions/Reactions dashboard pages regardless of mode) — but it
    // only ACTS physically while in AUTONOMOUS mode. While a human has
    // Manual Mode on, the brain steps back rather than fighting them for the
    // same servos. See docs/control-mode.md.
    const autonomous = !(await controlMode.isManualModeEnabled());

    // Checked FIRST, before low-light/exploration/anything else physical
    // this cycle: an immediate "back off" reaction takes priority over
    // slower, considered behaviors. See
    // people/TouchProximityAssistance.ts for exactly what this is (and
    // isn't — there's no touch sensor on this hardware, this is a
    // proximity proxy) a signal for.
    if (autonomous && shouldReactToProximityContact({ robotId, veryCloseOnUltrasonic: ultrasonicReading.status === "VERY_CLOSE" })) {
      commandResults.push(
        await commandRegistry.dispatch({ type: "AUDIO_SPEAK", params: { text: "Please don't touch me." }, source: "SYSTEM", robotId, isAdmin: true }),
      );
      await playGesture(robotId, "DONT_TOUCH_RECOIL");
    }

    // Too dark to work with, and someone is right there who could fix it —
    // ask them rather than silently discarding frame after frame. Presence
    // counts from EITHER the camera or the ultrasonic, because the case
    // this exists for is precisely the one where it's too dark to see the
    // person being asked. See perception/LowLightAssistance.ts for the
    // cooldown/escalation rules that stop this becoming nagging.
    let lowLightPrompt: string | null = null;
    if (autonomous) {
      const prompt = evaluateLowLight({
        robotId,
        meanBrightness: perceptionResult.quality.meanBrightness,
        frameReadable: perceptionResult.quality.isReadable,
        personDetected: perceptionResult.person.personDetected,
        someoneCloseOnUltrasonic: somethingCloseOnUltrasonic,
      });
      if (prompt) {
        lowLightPrompt = prompt.text;
        commandResults.push(
          await commandRegistry.dispatch({ type: "AUDIO_SPEAK", params: { text: prompt.text }, source: "SYSTEM", robotId, isAdmin: true }),
        );
          await playGesture(robotId, "LOW_LIGHT_PEER");
      }
    }

    // A body is detected but no usable face came out of it — see
    // people/FaceVisibilityAssistance.ts for exactly which cases this
    // covers (only genuinely distance-related ones) and
    // people/FaceVisibilityRunner.ts for the actual turn/check/back-away/
    // ask sequence. Fire-and-forget like explorationTick above: the
    // sequence takes several real seconds (two turns, maybe a walk), so
    // it must not block this cycle's return. Any failure inside is
    // caught and logged there, not here.
    const faceSkipReason = perceptionResult.recognition?.skipReason ?? null;
    if (autonomous && shouldAttemptFaceVisibilityHelp({ robotId, personDetected: perceptionResult.person.personDetected, skipReason: faceSkipReason })) {
      runFaceVisibilitySequence(robotId).catch((err) =>
        logger.warn("Face-visibility sequence failed to start (non-fatal)", { robotId, error: (err as Error).message }),
      );
    } else if (perceptionResult.recognition && faceSkipReason === null) {
      // A usable face WAS seen this cycle (recognized or not) — re-arm,
      // same as LowLightAssistance resetting once the light recovers.
      resetFaceVisibilityState(robotId);
    }

    // The confirmation window from an unverified emergency-stop request
    // ran out with no admin ever confirming — say so once, plainly, so
    // nobody assumes it worked when it didn't. Unconditional on person
    // detection: this must still fire and close out even if nobody (or
    // nobody recognizable) is in frame when the window lapses.
    if (hasConfirmationExpired(robotId)) {
      const pending = getPendingConfirmation(robotId);
      if (pending && !pending.timedOutMessageSent) {
        markTimedOutMessageSent(robotId);
        commandResults.push(
          await commandRegistry.dispatch({ type: "AUDIO_SPEAK", params: { text: "I couldn't confirm an admin in time, so I didn't do the emergency stop." }, source: "SYSTEM", robotId, isAdmin: true }),
        );
      }
      clearPendingConfirmation(robotId);
    } else if (autonomous && shouldAttemptSecondTurn(robotId)) {
      // The first turn (fired immediately when the window opened — see
      // routes/conversation.routes.ts) picked a side with no way to know
      // if it was the right one. Nobody's confirmed yet, so cover the
      // other side before the window runs out. Gated on `autonomous` for
      // the same reason as every other body movement in this file: never
      // fight a human who currently has Manual Mode.
      markSecondTurnDone(robotId);
      commandResults.push(
        await commandRegistry.dispatch({ type: "TURN_LEFT", params: { durationMs: TURN_DURATION_MS * 2 }, source: "SYSTEM", robotId, isAdmin: true }),
      );
    }

    // Every detected person is logged — photo, when, where — whether or
    // not they stop to interact. See PersonEncounterService for what
    // "logged" means (recall a known face or register a brand-new one).
    let approaching = false;
    let encounter = null as Awaited<ReturnType<typeof personEncounterService.recordEncounter>>;
    if (perceptionResult.person.personDetected) {
      approaching = isApproaching(perceptionResult.person.centerX, perceptionResult.quality.width, ultrasonicReading.filteredDistanceMm);

      // Fully confirmed (not a single-frame guess — see personRecognition.ts's
      // IdentityStatus) admin face in view is one of the two ways
      // EMERGENCY_STOP can be authorized — see people/AdminPresence.ts.
      const recognition = perceptionResult.recognition;
      if (recognition?.status === "CONFIRMED" && recognition.category === "ADMIN") {
        noteAdminFaceConfirmed(robotId);
      }

      // Someone asked for an emergency stop but wasn't verified at that
      // instant — Vision is actively watching, this cycle, for an admin's
      // face to resolve it. See people/PendingEmergencyStopConfirmation.ts.
      if (isConfirmationPending(robotId) && recognition?.status === "CONFIRMED" && recognition.category === "ADMIN") {
        clearPendingConfirmation(robotId);
        commandResults.push(
          await commandRegistry.dispatch({ type: "EMERGENCY_STOP", params: {}, source: "ADMIN", robotId, isAdmin: true, personId: recognition.personId ?? undefined }),
        );
        commandResults.push(
          await commandRegistry.dispatch({ type: "AUDIO_SPEAK", params: { text: "Confirmed — emergency stop." }, source: "SYSTEM", robotId, isAdmin: true }),
        );
      }

      encounter = await personEncounterService.recordEncounter({
        robotId,
        recognition: perceptionResult.recognition ?? { personId: null, name: null, category: "UNKNOWN", confidence: 0, status: "UNKNOWN", skipReason: null },
        boundingBox: perceptionResult.person.boundingBox,
        faceImageBuffer: imageBuffer,
        mediaId: media.mediaId,
        talkedTo: approaching,
        confidence: perceptionResult.person.confidence ?? 0,
        context: {
          presenceEvent: presenceEvent.type,
          ultrasonicDistanceMm: ultrasonicReading.filteredDistanceMm,
          panAngleDeg: getHeadAngle(), // head servo (CH0) angle — see attention/HeadController.ts
        },
      });

      if (autonomous && approaching && encounter) {
        recordInteraction(robotId, encounter.personId, encounter.name);
        if (encounter.isNewPerson) {
          askForName(robotId, encounter.personId);
          commandResults.push(
            await commandRegistry.dispatch({
              type: "AUDIO_SPEAK",
              params: { text: "Hi! I don't think we've met yet — what's your name?" },
              source: "SYSTEM",
              robotId,
              isAdmin: true,
            }),
          );
        } else if (shouldGreet(encounter.personId)) {
          recordGreeted(encounter.personId);
          const greeting = encounter.name ? `Welcome back, ${encounter.name}!` : "Hello again!";
          commandResults.push(
            await commandRegistry.dispatch({ type: "AUDIO_SPEAK", params: { text: greeting }, source: "SYSTEM", robotId, isAdmin: true }),
          );
        } else if (
          // Vision only brings up a fact-check with the ADMIN — not just
          // anyone TRUSTED — since "is this right about Ram?" is a
          // household-management conversation, not small talk with
          // whoever happens to be standing there. `recognition.status
          // === "CONFIRMED"` (not PROVISIONAL) matters here for the same
          // reason it matters for EMERGENCY_STOP a few lines up: this is
          // the one thing that turns into an actual database write.
          recognition?.status === "CONFIRMED" &&
          recognition.category === "ADMIN" &&
          !getPendingIntroduction(robotId) &&
          shouldOfferMemoryReview(robotId)
        ) {
          const candidate = await pickMemoryReviewCandidate();
          // Recorded regardless of whether anything was found — otherwise,
          // on every cycle there's genuinely nothing to ask about, the
          // cooldown never engages and this hits the DB every ~1s brain
          // cycle for as long as the admin stays in frame.
          recordMemoryReviewOffered(robotId);
          if (candidate) {
            askAboutMemory(robotId, candidate.memory);
            commandResults.push(
              await commandRegistry.dispatch({ type: "AUDIO_SPEAK", params: { text: candidate.question }, source: "SYSTEM", robotId, isAdmin: true }),
            );
          }
        }
      }

      // "Vision, find Sam" — if a search mission is active for this robot,
      // every recognized face gets checked against the target. This never
      // dispatches movement itself (PersonSearchRunner owns that); it only
      // flips the mission to FOUND so the runner's own loop picks it up,
      // or prompts a "have you seen them?" to someone else nearby.
      if (perceptionResult.recognition) {
        const sighting = personSearchService.reportSighting(robotId, perceptionResult.recognition, approaching);
        if (sighting?.event === "ASK_BYSTANDER") {
          await askBystanderAboutTarget(robotId, sighting.mission.taskId, sighting.mission.targetName);
        }
      }
    }

    // Say goodbye if someone Vision was just talking to just left — the
    // other half of the greeting behavior above. Checked regardless of
    // whether a person is in frame this cycle (they may have already left
    // the camera's view too, which is exactly when this matters).
    if (autonomous && presenceEvent.type === "LEFT_NEAR_FIELD") {
      const farewellTarget = takeFarewellTarget(robotId);
      if (farewellTarget) {
        commandResults.push(
          await commandRegistry.dispatch({
            type: "AUDIO_SPEAK",
            params: { text: farewellTarget.name ? `See you later, ${farewellTarget.name}!` : "See you later!" },
            source: "SYSTEM",
            robotId,
            isAdmin: true,
          }),
        );
      }
    }

    // Embodied expression: MentalIntelligence/EmotionEngine already decide
    // *that* Vision is curious/happy/confused/surprised — this is what
    // makes that actually visible as a small, brief head movement instead
    // of only appearing in an API response. Self-gating (returns null for
    // most states) so this doesn't fire every single cycle.
    let gesturePlayed: GestureName | null = null;
    if (autonomous) {
      gesturePlayed = await playEmbodiedGesture(robotId, mentalOutput.emotion.emotion, decision.decision);
      // A long stretch of nothing happening still gets an occasional small
      // fidget — "still here, just bored" rather than looking frozen.
      // Throttled well below every cycle so it reads as idle behavior, not a tic.
      if (!gesturePlayed && attention.state === "HABITUATED" && attention.consecutiveEmptyFrames % 8 === 0) {
        await playIdleFidget(robotId);
      }
    }

    // Orient the shared camera+ultrasonic head: scan when idle, hold when
    // something is worth watching, fine-track when a person is confirmed.
    // This is independent of the TRACK_PERSON decision below — the head can
    // (and should) keep scanning/orienting even on cycles where the brain
    // ultimately decides not to act on what it saw.
    let headCommand: HeadCommand | null = null;
    // Exception: while the legs are driving, the head stays pointed forward. The
    // ultrasonic sensor rides on it, and looking away would trip the movement
    // safety rule and stop the robot mid-walk (docs/ultrasonic.md).
    if (autonomous && !legsAreDriving()) {
      const currentAngle = getHeadAngle();
      headCommand = decideHeadCommand({
        attentionState: attention.state,
        currentAngle,
        scanDirection: getScanDirectionFor(robotId),
        personCenterX: perceptionResult.person.centerX,
      });
      setScanDirectionFor(robotId, headCommand.scanDirection);

      if (headCommand.angle !== currentAngle) {
        commandResults.push(
          await commandRegistry.dispatch(
            headCommand.type === "TRACK"
              ? { type: "EYE_TRACK_PERSON", params: { targetAngle: headCommand.angle }, source: "SYSTEM", robotId, isAdmin: true }
              : { type: "EYE_SET", params: { angle: headCommand.angle }, source: "SYSTEM", robotId, isAdmin: true },
          ),
        );
      }
    }

    const perception: PerceptionSummary = {
      frameWidth: perceptionResult.quality.width,
      frameHeight: perceptionResult.quality.height,
      checksum: perceptionResult.quality.checksum,
      frameDiscarded: perceptionResult.frameDiscarded,
      discardReason: perceptionResult.quality.discardReason,
      detectionSkipped: perceptionResult.detectionSkipped,
      meanBrightness: perceptionResult.quality.meanBrightness,
      contrast: perceptionResult.quality.contrast,
      sharpness: perceptionResult.quality.sharpness,
      motionDetected: perceptionResult.motion.present,
      motionMagnitude: perceptionResult.motion.magnitude,
      motionRoi: perceptionResult.motion.roi,
      personDetected: perceptionResult.person.personDetected,
      objectCount: perceptionResult.objects.length,
      presenceEvent: presenceEvent.type,
      sensorsDisagree,
      attention,
      headCommand,
      gesturePlayed,
      lowLightPrompt,
    };

    return { observationId, decision, reaction, mentalState: mentalOutput.state, commandResults, perception, media, encounter };
  }

  /**
   * Checks for a pending "please show me a photo" disambiguation (see
   * people/PendingDisambiguation.ts and people/PersonSearchRunner.ts) and,
   * if one is active, tries matching the whole frame against just the
   * candidates being disambiguated between — matching the same
   * appearance-embedding approach as ordinary recognition
   * (EmbeddingPersonRecognizer), just scoped to a specific candidate set
   * instead of everyone registered. Whole-frame rather than a detected
   * face region is a deliberate simplification: the person's been asked
   * to hold a photo up to the camera, so it's reasonable to assume it
   * fills most of the frame — see docs/people.md.
   */
  private async tryResolveDisambiguation(robotId: string, imageBuffer: Buffer, frameDiscarded: boolean): Promise<void> {
    if (frameDiscarded) return; // an unusable frame can't show a photo either
    const pending = getPendingDisambiguation(robotId);
    if (!pending || pending.resolvedPersonId || isTimedOut(pending)) return;

    try {
      const embedding = await computeFaceEmbedding(imageBuffer);
      let best: { personId: string; distance: number } | null = null;
      for (const candidateId of pending.candidateIds) {
        const faces = await personFacesRepository.forPerson(candidateId);
        for (const face of faces) {
          if (!Array.isArray(face.embedding)) continue;
          const distance = faceDistance(embedding, face.embedding as number[]);
          if (!best || distance < best.distance) best = { personId: candidateId, distance };
        }
      }
      if (best && best.distance <= RECOGNITION_MATCH_THRESHOLD_DISTANCE) {
        resolveDisambiguation(robotId, best.personId);
      }
    } catch (err) {
      if (err instanceof NoFaceDetectedError) return; // no face in the held-up photo — nothing to match, non-fatal
      logger.debug("Disambiguation photo match attempt failed (non-fatal)", { error: (err as Error).message });
    }
  }
}

export const brainOrchestrator = new BrainOrchestrator();
