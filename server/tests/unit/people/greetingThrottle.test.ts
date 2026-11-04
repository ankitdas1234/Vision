import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { shouldGreet, recordGreeted } from "../../../src/people/GreetingThrottle";

describe("GreetingThrottle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("allows greeting someone never greeted before", () => {
    expect(shouldGreet("person-never-seen")).toBe(true);
  });

  it("suppresses a repeat greeting within the cooldown window", () => {
    recordGreeted("person-a");
    expect(shouldGreet("person-a")).toBe(false);
  });

  it("allows greeting again once the cooldown has passed", () => {
    recordGreeted("person-b");
    vi.advanceTimersByTime(6 * 60 * 1000);
    expect(shouldGreet("person-b")).toBe(true);
  });

  it("tracks different people independently", () => {
    recordGreeted("person-c");
    expect(shouldGreet("person-d")).toBe(true);
  });
});
