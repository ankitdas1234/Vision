import { describe, it, expect } from "vitest";
import { interpretMemoryReviewReplyKeywords } from "../../../src/people/MemoryReviewInterpreter";

describe("interpretMemoryReviewReplyKeywords", () => {
  it("recognizes a plain confirmation", () => {
    expect(interpretMemoryReviewReplyKeywords("Yes").type).toBe("CONFIRM");
    expect(interpretMemoryReviewReplyKeywords("yeah that's right").type).toBe("CONFIRM");
    expect(interpretMemoryReviewReplyKeywords("Correct").type).toBe("CONFIRM");
  });

  it("recognizes a bare rejection with nothing left over", () => {
    expect(interpretMemoryReviewReplyKeywords("No").type).toBe("REJECT");
    expect(interpretMemoryReviewReplyKeywords("nope").type).toBe("REJECT");
    expect(interpretMemoryReviewReplyKeywords("Incorrect").type).toBe("REJECT");
  });

  it("recognizes a rejection with a correction attached", () => {
    const result = interpretMemoryReviewReplyKeywords("No, actually he likes it loud");
    expect(result.type).toBe("CORRECTION");
    expect(result.correctedContent).toBe("He likes it loud");
  });

  it("recognizes 'not really, ...' as a correction (not a bare rejection)", () => {
    const result = interpretMemoryReviewReplyKeywords("not really, he prefers rock");
    expect(result.type).toBe("CORRECTION");
    expect(result.correctedContent?.toLowerCase()).toContain("he prefers rock");
  });

  it("recognizes 'that's wrong, ...' as a correction", () => {
    const result = interpretMemoryReviewReplyKeywords("that's wrong, it's actually soft music");
    expect(result.type).toBe("CORRECTION");
    expect(result.correctedContent).toBeTruthy();
  });

  it("treats an unrelated reply as UNCLEAR rather than guessing", () => {
    expect(interpretMemoryReviewReplyKeywords("what's for dinner").type).toBe("UNCLEAR");
    expect(interpretMemoryReviewReplyKeywords("").type).toBe("UNCLEAR");
  });

  it("always returns a spoken reply string for every outcome", () => {
    for (const t of ["yes", "no", "no, actually loud music", "banana"]) {
      expect(interpretMemoryReviewReplyKeywords(t).reply.length).toBeGreaterThan(0);
    }
  });
});
