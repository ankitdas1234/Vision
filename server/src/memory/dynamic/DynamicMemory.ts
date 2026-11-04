import type { DynamicMemoryRecord } from "./learning";

/**
 * Dynamic Memory holds knowledge Vision learns over time. Every record carries
 * provenance + a verification status. Only VERIFIED records participate in
 * the STATIC -> DYNAMIC -> CONCEPTUAL -> AI priority chain as "sufficient".
 */
export class DynamicMemory {
  constructor(private records: DynamicMemoryRecord[] = []) {}

  add(record: DynamicMemoryRecord) { this.records.push(record); }

  searchVerified(query: string): DynamicMemoryRecord[] {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return []; // one letter would match everything
    return this.records.filter((r) => r.verificationStatus === "VERIFIED" && (r.title.toLowerCase().includes(q) || r.content.toLowerCase().includes(q)));
  }

  searchAll(query: string): DynamicMemoryRecord[] {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return this.records.filter((r) => r.title.toLowerCase().includes(q) || r.content.toLowerCase().includes(q));
  }

  /** In-memory only — no admin verify/reject endpoint calls this yet.
   * Whoever builds one MUST also call
   * repositories/memory.repository.ts's dynamic.updateVerification(id,
   * "VERIFIED"), or the change won't survive a restart (memory/
   * MemoryPersistence.ts reloads verificationStatus from the database,
   * so an in-memory-only change here would silently revert). */
  verify(id: string) {
    const r = this.records.find((x) => x.id === id);
    if (r) r.verificationStatus = "VERIFIED";
  }

  /** See the persistence note on verify() above — same applies here with
   * dynamic.updateVerification(id, "REJECTED"). */
  reject(id: string) {
    const r = this.records.find((x) => x.id === id);
    if (r) r.verificationStatus = "REJECTED";
  }

  get(id: string) { return this.records.find((x) => x.id === id); }

  remove(id: string): boolean {
    const idx = this.records.findIndex((x) => x.id === id);
    if (idx < 0) return false;
    this.records.splice(idx, 1);
    return true;
  }

  all() { return this.records; }
}
