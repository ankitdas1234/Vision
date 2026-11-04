const lastGreetedAtMs = new Map<string, number>();

/** Don't say hello again to someone already greeted within this window —
 * without it, a person standing in frame for ten consecutive ~1s brain
 * cycles would get "hello!" ten times in a row. */
const GREETING_COOLDOWN_MS = 5 * 60 * 1000;

export function shouldGreet(personId: string): boolean {
  const last = lastGreetedAtMs.get(personId);
  return !last || Date.now() - last > GREETING_COOLDOWN_MS;
}

export function recordGreeted(personId: string) {
  lastGreetedAtMs.set(personId, Date.now());
}
