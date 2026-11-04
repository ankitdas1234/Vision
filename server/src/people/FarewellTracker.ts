/**
 * FAREWELLS
 * ---------
 * Vision already greets someone who approaches (see BrainOrchestrator +
 * people/GreetingThrottle.ts) but had no acknowledgment of the other half
 * of a normal social interaction — someone leaving. This tracks, per
 * robot, who was most recently actually interacted with (approaching +
 * recognized), so a "left near field" ultrasonic event
 * (ultrasonic/PresenceDetector.ts LEFT_NEAR_FIELD) can trigger a goodbye
 * instead of being silently ignored.
 */

export interface RecentInteraction {
  personId: string;
  name: string | null;
  atMs: number;
}

/** How long after the last interaction a departure still counts as "the
 * same visit" worth saying goodbye to — a LEFT_NEAR_FIELD event long after
 * the conversation ended (e.g. they came back near later for something
 * unrelated) shouldn't trigger a stale goodbye. */
const FAREWELL_WINDOW_MS = 5 * 60 * 1000;

const recentByRobot = new Map<string, RecentInteraction>();
const farewellSaidFor = new Set<string>(); // `${robotId}:${personId}` — avoid repeating a goodbye

export function recordInteraction(robotId: string, personId: string, name: string | null) {
  recentByRobot.set(robotId, { personId, name, atMs: Date.now() });
  farewellSaidFor.delete(`${robotId}:${personId}`);
}

/** Returns the person to say goodbye to, if any, and marks it said so it
 * only happens once per departure rather than on every subsequent
 * LEFT_NEAR_FIELD reading. */
export function takeFarewellTarget(robotId: string): RecentInteraction | null {
  const recent = recentByRobot.get(robotId);
  if (!recent) return null;
  if (Date.now() - recent.atMs > FAREWELL_WINDOW_MS) return null;

  const key = `${robotId}:${recent.personId}`;
  if (farewellSaidFor.has(key)) return null;
  farewellSaidFor.add(key);
  return recent;
}

export function clearFor(robotId: string) {
  recentByRobot.delete(robotId);
}
