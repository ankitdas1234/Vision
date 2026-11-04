import type { StaticMemory } from "./StaticMemory";

export function staticMemoryLookup(memory: StaticMemory, query: string) {
  const results = memory.search(query);
  return { sufficient: results.length > 0, results };
}
