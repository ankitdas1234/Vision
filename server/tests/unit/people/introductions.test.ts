import { describe, it, expect, beforeEach } from "vitest";
import { askForName, getPendingIntroduction, clearPendingIntroduction, extractNameFromTranscript } from "../../../src/people/Introductions";

describe("extractNameFromTranscript", () => {
  it("returns a bare name as-is (capitalized)", () => {
    expect(extractNameFromTranscript("sam")).toBe("Sam");
  });

  it("strips 'my name is' framing", () => {
    expect(extractNameFromTranscript("my name is Alex")).toBe("Alex");
  });

  it("strips 'I'm' framing", () => {
    expect(extractNameFromTranscript("I'm Priya")).toBe("Priya");
  });

  it("strips 'call me' framing", () => {
    expect(extractNameFromTranscript("call me Jordan")).toBe("Jordan");
  });

  it("capitalizes multi-word names", () => {
    expect(extractNameFromTranscript("mary jane")).toBe("Mary Jane");
  });
});

describe("pending introduction tracking", () => {
  beforeEach(() => {
    clearPendingIntroduction("robot-x");
  });

  it("has nothing pending by default", () => {
    expect(getPendingIntroduction("robot-x")).toBeNull();
  });

  it("returns what was asked", () => {
    askForName("robot-x", "person-123");
    const pending = getPendingIntroduction("robot-x");
    expect(pending?.personId).toBe("person-123");
  });

  it("clears after being answered", () => {
    askForName("robot-x", "person-123");
    clearPendingIntroduction("robot-x");
    expect(getPendingIntroduction("robot-x")).toBeNull();
  });

  it("keeps different robots' pending introductions independent", () => {
    askForName("robot-x", "person-123");
    expect(getPendingIntroduction("robot-y")).toBeNull();
  });
});
