/**
 * PENDING MUSIC QUESTION
 * -----------------------
 * While a song search is in flight (music/PlaySongService.ts), Vision
 * asks the requester a real question about their own music taste (see
 * music/SongQuestionProposer.ts — never about the song's lyrics/content).
 * The next transcript that comes back through conversation.routes.ts for
 * that robot is treated as the answer, not run through the normal
 * intent classifier — same ask-then-consume shape as
 * people/Introductions.ts and people/PendingBystanderQuestion.ts.
 */

export interface PendingMusicQuestion {
  playRequestId: string;
  personId: string | null;
  questionIndex: number;
  askedAtMs: number;
}

const PENDING_TIMEOUT_MS = 45_000;

const pendingByRobot = new Map<string, PendingMusicQuestion>();

export function askMusicQuestion(robotId: string, playRequestId: string, personId: string | null, questionIndex: number) {
  pendingByRobot.set(robotId, { playRequestId, personId, questionIndex, askedAtMs: Date.now() });
}

export function getPendingMusicQuestion(robotId: string): PendingMusicQuestion | null {
  const pending = pendingByRobot.get(robotId);
  if (!pending) return null;
  if (Date.now() - pending.askedAtMs > PENDING_TIMEOUT_MS) {
    pendingByRobot.delete(robotId);
    return null;
  }
  return pending;
}

export function clearPendingMusicQuestion(robotId: string) {
  pendingByRobot.delete(robotId);
}
