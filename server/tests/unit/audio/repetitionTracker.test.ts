import { describe, it, expect, beforeEach } from "vitest";
import {
  recordUtterance,
  resetRepetition,
  normalizeTranscript,
  FREE_REPEATS,
  REPETITION_WINDOW_MS,
} from "../../../src/audio/RepetitionTracker";

const SPEAKER = "person-1";

function ask(text: string, times: number, startAt = 1000) {
  let result = recordUtterance(SPEAKER, text, startAt);
  for (let i = 1; i < times; i++) result = recordUtterance(SPEAKER, text, startAt + i * 1000);
  return result;
}

describe("normalizeTranscript", () => {
  it("strips punctuation and conversational filler", () => {
    expect(normalizeTranscript("Hey Vision, what's your name again?")).toEqual(["what", "s", "name"]);
  });
});

describe("recordUtterance", () => {
  beforeEach(() => resetRepetition());

  it("stays patient for the first few asks", () => {
    for (let i = 1; i <= FREE_REPEATS; i++) {
      const result = recordUtterance(SPEAKER, "what time is it", 1000 + i);
      expect(result.repeatCount).toBe(i);
      expect(result.annoyed).toBe(false);
      expect(result.reply).toBeNull();
    }
  });

  it("pushes back once the same question goes past the free repeats", () => {
    const result = ask("what time is it", FREE_REPEATS + 1);
    expect(result.annoyed).toBe(true);
    expect(result.level).toBe(1);
    expect(result.reply).toMatch(/already answered/i);
  });

  it("gets sharper the longer it goes on", () => {
    const sharper = ask("what time is it", FREE_REPEATS + 2);
    expect(sharper.level).toBe(2);
    const refusing = ask("what time is it", FREE_REPEATS + 4);
    expect(refusing.level).toBe(3);
    expect(refusing.reply).toMatch(/not answering that again/i);
  });

  it("matches rephrasings of the same question", () => {
    recordUtterance(SPEAKER, "what is your name", 1000);
    recordUtterance(SPEAKER, "Vision, what's your name?", 2000);
    recordUtterance(SPEAKER, "so what's your name again", 3000);
    const result = recordUtterance(SPEAKER, "hey, what is your name please", 4000);
    expect(result.repeatCount).toBe(4);
  });

  it("does not conflate different questions that share filler", () => {
    recordUtterance(SPEAKER, "what time is it", 1000);
    const other = recordUtterance(SPEAKER, "what day is it", 2000);
    expect(other.repeatCount).toBe(1);
    expect(other.annoyed).toBe(false);
  });

  it("tracks each speaker separately", () => {
    ask("what time is it", FREE_REPEATS + 1);
    const other = recordUtterance("person-2", "what time is it", 9000);
    expect(other.repeatCount).toBe(1);
    expect(other.annoyed).toBe(false);
  });

  it("forgets a question once the window has passed", () => {
    const lastAskedAt = 1000 + (FREE_REPEATS - 1) * 1000;
    ask("what time is it", FREE_REPEATS);
    const later = recordUtterance(SPEAKER, "what time is it", lastAskedAt + REPETITION_WINDOW_MS + 1);
    expect(later.repeatCount).toBe(1);
    expect(later.annoyed).toBe(false);
  });

  it("ignores utterances that are nothing but filler", () => {
    const result = recordUtterance(SPEAKER, "um, hey Vision, so...", 1000);
    expect(result.repeatCount).toBe(0);
    expect(result.annoyed).toBe(false);
  });
});
