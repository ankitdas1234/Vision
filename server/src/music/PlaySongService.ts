import { searchJamendo, fetchJamendoAudio } from "./JamendoMusicService";
import { musicUploadService } from "./MusicUploadService";
import { musicTracksRepository } from "../repositories/musicTracks.repository";
import { playRequestsRepository, type PlayRequestRow } from "../repositories/playRequests.repository";
import { peopleRepository } from "../repositories/people.repository";
import { proposeSongQuestion } from "./SongQuestionProposer";
import { askMusicQuestion, clearPendingMusicQuestion } from "../people/PendingMusicQuestion";
import { commandRegistry } from "../commands/CommandRegistry";
import { runDanceToBeats } from "../performance/DanceRunner";
import { taskManager } from "../tasks/TaskManager";
import { logger } from "../logging/Logger";

/**
 * PLAY SONG SERVICE
 * ------------------
 * "Vision, play [song]" end to end:
 *   1. Logs the request (who asked, what they asked for) to play_requests.
 *   2. Kicks off a REAL search+fetch against Jamendo's licensed catalog
 *      (JamendoMusicService.ts) as a background task — never YouTube/
 *      Spotify extraction, see docs/music.md.
 *   3. AT THE SAME TIME, starts a genuine getting-to-know-you conversation
 *      (SongQuestionProposer.ts) — asked one question at a time via
 *      AUDIO_SPEAK, answered via the robot's mic and logged onto the same
 *      play_requests row. This is real turn-taking over separate HTTP
 *      requests (see routes/conversation.routes.ts's pending-question
 *      interception), not a blocking wait — the search result is simply
 *      checked each time an answer comes back, so the conversation and
 *      the fetch genuinely run concurrently rather than sequentially.
 *   4. Once the current question/answer exchange finishes AND the track
 *      is ready, Vision wraps up naturally and starts playback — reusing
 *      the exact same PCM pipeline and (if beat-synced dancing is
 *      appropriate) DanceRunner.runDanceToBeats already built for
 *      uploaded tracks.
 *   5. If nothing licensed matches what was asked for, Vision says so
 *      honestly — never silently fails, never fakes a substitute.
 */

const MAX_QUESTIONS = 3;

interface ActiveRequest {
  playRequestId: string;
  robotId: string;
  personId: string | null;
  searchPromise: Promise<{ found: boolean; track?: Awaited<ReturnType<typeof musicUploadService.uploadTrack>>["track"]; fileBuffer?: Buffer }>;
  searchSettled: boolean;
  searchResult: { found: boolean; track?: Awaited<ReturnType<typeof musicUploadService.uploadTrack>>["track"]; fileBuffer?: Buffer } | null;
}

const activeByRobot = new Map<string, ActiveRequest>();

async function dispatchSpeak(robotId: string, text: string) {
  await commandRegistry.dispatch({ type: "AUDIO_SPEAK", params: { text }, source: "SYSTEM", robotId, isAdmin: true });
}

/** Runs the real Jamendo search + fetch + analysis + storage pipeline.
 * Never throws — a failure at any stage resolves to `{ found: false }`
 * so the conversation side always has a definite answer to act on. */
async function runSearchAndFetch(requestedText: string, uploadedByUserId: string | null): Promise<{ found: boolean; track?: Awaited<ReturnType<typeof musicUploadService.uploadTrack>>["track"]; fileBuffer?: Buffer }> {
  try {
    const results = await searchJamendo(requestedText, 1);
    if (results.length === 0) return { found: false };

    const best = results[0];
    const fileBuffer = await fetchJamendoAudio(best);
    const filename = `${best.artistName} - ${best.name}.mp3`;
    const { track } = await musicUploadService.uploadTrack(fileBuffer, filename, uploadedByUserId);
    return { found: true, track, fileBuffer };
  } catch (err) {
    logger.warn("Song search/fetch failed (non-fatal, will report as not found)", { requestedText, error: (err as Error).message });
    return { found: false };
  }
}

/**
 * Starts a new play-song request: logs it, kicks off the real search in
 * the background, and asks the first getting-to-know-you question.
 * Returns immediately — the rest happens across subsequent replies (see
 * handleConversationReply) and, eventually, playback.
 */
export async function startPlayRequest(robotId: string, personId: string | null, requestedText: string): Promise<PlayRequestRow> {
  const playRequest = await playRequestsRepository.create({ personId, robotId, requestedText });

  const searchPromise = runSearchAndFetch(requestedText, personId);
  const active: ActiveRequest = { playRequestId: playRequest.id, robotId, personId, searchPromise, searchSettled: false, searchResult: null };
  activeByRobot.set(robotId, active);
  searchPromise.then((result) => {
    active.searchSettled = true;
    active.searchResult = result;
  });

  await askNextQuestionOrFinish(playRequest.id, robotId, personId, 0);
  return playRequest;
}

async function askNextQuestionOrFinish(playRequestId: string, robotId: string, personId: string | null, questionIndex: number): Promise<void> {
  const active = activeByRobot.get(robotId);

  if (active?.searchSettled) {
    await finishWithResult(playRequestId, robotId, personId, active.searchResult);
    return;
  }

  if (questionIndex >= MAX_QUESTIONS) {
    // The search still hasn't resolved even after the full conversation —
    // rather than block this call (and the HTTP request behind it)
    // indefinitely waiting on a promise with no timeout of its own, tell
    // the person honestly and let it finish asynchronously whenever it
    // actually settles. The eventual resolution still updates the DB and
    // starts playback — it just doesn't hold this call open to do it.
    await dispatchSpeak(robotId, "I'm still looking for that one — I'll let you know as soon as I find it!");
    if (active) {
      active.searchPromise.then((result) => finishWithResult(playRequestId, robotId, personId, result)).catch((err) => logger.warn("Deferred song search completion failed", { robotId, error: (err as Error).message }));
    }
    return;
  }

  const request = await playRequestsRepository.findById(playRequestId);
  const proposal = await proposeSongQuestion({ requestedText: request?.requestedText ?? "", questionIndex });

  await dispatchSpeak(robotId, proposal.question);
  await playRequestsRepository.appendConversationTurn(playRequestId, { question: proposal.question, answer: null, askedAt: new Date().toISOString() });
  askMusicQuestion(robotId, playRequestId, personId, questionIndex);
}

/**
 * Called from routes/conversation.routes.ts when a reply comes back for
 * a pending music question. Logs the answer, then either asks another
 * question or wraps up, depending on whether the search has finished.
 */
export async function handleConversationReply(robotId: string, playRequestId: string, personId: string | null, questionIndex: number, transcript: string): Promise<void> {
  clearPendingMusicQuestion(robotId);
  await playRequestsRepository.recordAnswerForLatestTurn(playRequestId, transcript);
  await askNextQuestionOrFinish(playRequestId, robotId, personId, questionIndex + 1);
}

async function finishWithResult(playRequestId: string, robotId: string, personId: string | null, result: ActiveRequest["searchResult"]): Promise<void> {
  activeByRobot.delete(robotId);

  if (!result?.found || !result.track || !result.fileBuffer) {
    await playRequestsRepository.updateStatus(playRequestId, "NOT_FOUND");
    await dispatchSpeak(robotId, "I looked, but I don't have a licensed copy of that one to play. Sorry!");
    return;
  }

  await playRequestsRepository.updateStatus(playRequestId, "FOUND", result.track.id);
  await dispatchSpeak(robotId, `Found it — ${result.track.title}!`);

  // "Ram, don't dance" — per-person preference (people.autonomous_dance_enabled,
  // set via the DANCE_PREFERENCE intent in conversation.routes.ts). Music
  // always plays either way; only the dancing is gated. Defaults to true
  // (dance) so this only changes behavior for someone who's actually
  // opted out, and it's re-checked on every request — not a one-time
  // setting — so "ok dance" later takes effect immediately.
  const person = personId ? await peopleRepository.findById(personId) : null;
  const shouldDance = person?.autonomousDanceEnabled ?? true;

  if (shouldDance) {
    const task = taskManager.create({ robotId, taskType: "DANCE", input: { trackId: result.track.id, title: result.track.title }, description: `Play ${result.track.title} (requested)` });
    runDanceToBeats(task.id, robotId, result.track, result.fileBuffer).catch((err) => taskManager.updateStatus(task.id, "FAILED", { error: (err as Error).message }));
  } else {
    logger.debug("Dance skipped by per-person preference", { personId, trackId: result.track.id });
    await musicUploadService.queueForPlayback(robotId, result.fileBuffer);
  }

  await playRequestsRepository.updateStatus(playRequestId, "PLAYED", result.track.id);
}

/** Test-only escape hatch. */
export function __resetPlaySongStateForTests(): void {
  activeByRobot.clear();
}
