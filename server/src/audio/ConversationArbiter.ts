import type { SpeakerSegment } from "./Diarization";
import { speechEventsRepository } from "../repositories/speechEvents.repository";
import { peopleRepository } from "../repositories/people.repository";
import { noteAnnoyance } from "../mental/Annoyance";

/** Interruptions by the same person, inside this window, before the
 * "could you hold on?" line stops being polite. Being cut off once is an
 * accident; the fifth time in ten minutes is a habit. */
const REPEAT_INTERRUPTION_LIMIT = 4;
const INTERRUPTION_WINDOW_MINUTES = 10;

const WAKE_OR_COMMAND_HINTS = ["vision", "don't do that", "do not do that", "stop doing that", "stop that", "emergency stop", "stop everything now", "shut down now"];

export interface SpokenReply {
  /** Which segment/speaker this reply is directed at (for TTS routing if the
   * hardware ever supports directional audio — today it's just logged and
   * spoken over the single onboard speaker). */
  targetSpeakerTag: string;
  text: string;
}

export interface ArbitrationResult {
  /** The one segment Vision will actually treat as its input this turn — feed
   * this transcript into understandIntent()/command dispatch. Null if every
   * segment was told to wait (e.g. admin-in-background case). */
  chosenSegment: SpeakerSegment | null;
  replies: SpokenReply[];
  /** True when the chosen segment is a directly-addressing ADMIN — callers
   * should honor ADMIN_VETO/ADMIN_LIFT_RESTRICTION intents from it. */
  chosenIsAuthorizedAdmin: boolean;
}

function overlaps(a: SpeakerSegment, b: SpeakerSegment): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

// Keep this list in sync with audio/IntentEngine.ts's EMERGENCY_STOP_PHRASES —
// an emergency-stop phrase that isn't recognized as "directly addressing
// Vision" here would silently never be able to reach chosenIsAuthorizedAdmin,
// no matter how clearly an admin's voice matched it.
function addressesVisionDirectly(transcript: string): boolean {
  const t = transcript.toLowerCase();
  return WAKE_OR_COMMAND_HINTS.some((hint) => t.includes(hint));
}

/**
 * Resolves overlapping speech into: one speaker Vision listens to, and a
 * polite spoken line for everyone else. Three cases this implements, in the
 * words the person asked for:
 *
 *  1. Single speaker, no overlap -> normal turn, nothing special.
 *  2. Two non-admins talking over each other -> the lower-priority one is
 *     asked to wait; their interruption is logged (repeated interruptions
 *     lower their priority further next time — the "talks too much" signal).
 *  3. An ADMIN's voice overlaps someone else's WITHOUT directly addressing
 *     Vision (no wake word / command phrase) -> Vision defers to nobody and
 *     instead tells the admin: "Sir, I can't listen properly right now —
 *     could you wait a moment?" A directly-addressing admin (says "Vision"
 *     or issues a recognizable command/veto) always wins immediately —
 *     admin authority isn't something ambient background noise should block.
 */
class ConversationArbiterService {
  async arbitrate(robotId: string, segments: SpeakerSegment[]): Promise<ArbitrationResult> {
    const usable = segments.filter((s) => s.transcript.trim().length > 0);
    if (usable.length === 0) return { chosenSegment: null, replies: [], chosenIsAuthorizedAdmin: false };

    if (usable.length === 1) {
      const only = usable[0];
      await this.logTurn(robotId, only);
      return { chosenSegment: only, replies: [], chosenIsAuthorizedAdmin: !!only.isAdmin && addressesVisionDirectly(only.transcript) };
    }

    const hasOverlap = usable.some((a, i) => usable.some((b, j) => i !== j && overlaps(a, b)));
    if (!hasOverlap) {
      // Sequential, non-overlapping turns arriving in the same batch — treat
      // the earliest as this turn's input, log the rest as ordinary turns too.
      const sorted = [...usable].sort((a, b) => a.startMs - b.startMs);
      for (const s of sorted) await this.logTurn(robotId, s);
      const first = sorted[0];
      return { chosenSegment: first, replies: [], chosenIsAuthorizedAdmin: !!first.isAdmin && addressesVisionDirectly(first.transcript) };
    }

    // Overlapping speech from here on.
    const adminSegments = usable.filter((s) => s.isAdmin);
    const directAdmin = adminSegments.find((s) => addressesVisionDirectly(s.transcript));

    if (directAdmin) {
      // Admin is actively commanding/vetoing — always wins, no matter who else is talking.
      const others = usable.filter((s) => s !== directAdmin);
      const replies = await this.quietOthers(robotId, others, directAdmin);
      await this.logTurn(robotId, directAdmin);
      return { chosenSegment: directAdmin, replies, chosenIsAuthorizedAdmin: true };
    }

    if (adminSegments.length > 0) {
      // Admin is present but only speaking in the background/ambient — don't
      // guess at a possibly-garbled instruction. Defer to the admin politely
      // and don't act on anyone's speech this turn.
      const replies: SpokenReply[] = [];
      for (const admin of adminSegments) {
        replies.push({ targetSpeakerTag: admin.speakerTag, text: "Sir, I can't listen properly right now — could you wait a bit?" });
        await speechEventsRepository.record({
          robotId, personId: admin.personId ?? null, eventType: "ADMIN_BACKGROUND",
          transcript: admin.transcript, wasAdmin: true,
          respondedWith: "Sir, I can't listen properly right now — could you wait a bit?",
        }).catch(() => undefined);
      }
      return { chosenSegment: null, replies, chosenIsAuthorizedAdmin: false };
    }

    // No admin involved — pick a priority speaker among non-admins and ask
    // the rest to wait. Priority: fewest recent interruptions (least "talks
    // too much") first, then higher trust score, then earliest start time.
    const ranked = await this.rankByPriority(usable);
    const winner = ranked[0];
    const others = usable.filter((s) => s !== winner);
    const replies = await this.quietOthers(robotId, others, winner);
    await this.logTurn(robotId, winner);
    return { chosenSegment: winner, replies, chosenIsAuthorizedAdmin: false };
  }

  private async rankByPriority(segments: SpeakerSegment[]): Promise<SpeakerSegment[]> {
    const scored = await Promise.all(
      segments.map(async (s) => {
        const interruptions = s.personId ? await speechEventsRepository.interruptionCount(s.personId, 30).catch(() => 0) : 0;
        const person = s.personId ? await peopleRepository.findById(s.personId).catch(() => null) : null;
        const trust = person?.trustScore ?? 0;
        // Lower interruption count is better (less "talks too much"); higher trust is better.
        const score = trust - interruptions * 2;
        return { segment: s, score, startMs: s.startMs };
      })
    );
    scored.sort((a, b) => b.score - a.score || a.startMs - b.startMs);
    return scored.map((s) => s.segment);
  }

  private async quietOthers(robotId: string, others: SpeakerSegment[], winner: SpeakerSegment): Promise<SpokenReply[]> {
    const replies: SpokenReply[] = [];
    for (const other of others) {
      // The interruption count was already being recorded and used for
      // speaker priority; this is the other thing it's good for. Someone
      // who keeps cutting in while a conversation is in progress stops
      // getting the polite version of the same request.
      const priorInterruptions = other.personId
        ? await speechEventsRepository.interruptionCount(other.personId, INTERRUPTION_WINDOW_MINUTES).catch(() => 0)
        : 0;
      const persistent = priorInterruptions >= REPEAT_INTERRUPTION_LIMIT;
      if (persistent) noteAnnoyance(robotId, 2);
      const text = persistent
        ? "You keep cutting in while someone else is talking. I've asked you to wait several times now — please let them finish."
        : "Could you hold on a second, please? I'm listening to someone else right now.";
      replies.push({ targetSpeakerTag: other.speakerTag, text });
      await speechEventsRepository.record({
        robotId, personId: other.personId ?? null, eventType: "INTERRUPTION",
        transcript: other.transcript, wasAdmin: false, respondedWith: text,
      }).catch(() => undefined);
    }
    return replies;
  }

  private async logTurn(robotId: string, segment: SpeakerSegment) {
    await speechEventsRepository.record({
      robotId, personId: segment.personId ?? null, eventType: "TURN",
      transcript: segment.transcript, wasAdmin: !!segment.isAdmin, respondedWith: null,
    }).catch(() => undefined);
  }

  /** Rolling "talks too much" signal for a person's dashboard/profile card. */
  async interruptionCount(personId: string, windowMinutes = 30): Promise<number> {
    return speechEventsRepository.interruptionCount(personId, windowMinutes);
  }
}

export const conversationArbiter = new ConversationArbiterService();
