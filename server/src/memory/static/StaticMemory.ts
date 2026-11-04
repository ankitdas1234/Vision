export interface StaticMemoryRecord {
  id: string;
  memoryKey: string;
  memoryType: string;
  title: string;
  content: string;
  importance: number;
}

/**
 * Static Memory is administrator-controlled predefined knowledge:
 * identity, capabilities, hardware, safety rules, known facts.
 * Highest priority in the memory lookup chain — see memory/MemoryManager.ts.
 */
export class StaticMemory {
  constructor(private records: StaticMemoryRecord[] = []) {}

  upsert(record: StaticMemoryRecord) {
    const idx = this.records.findIndex((r) => r.memoryKey === record.memoryKey);
    if (idx >= 0) this.records[idx] = record; else this.records.push(record);
  }

  search(query: string): StaticMemoryRecord[] {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return []; // one letter would match everything
    return this.records.filter((r) => r.title.toLowerCase().includes(q) || r.content.toLowerCase().includes(q) || r.memoryKey.toLowerCase().includes(q));
  }

  remove(memoryKey: string): boolean {
    const idx = this.records.findIndex((r) => r.memoryKey === memoryKey);
    if (idx < 0) return false;
    this.records.splice(idx, 1);
    return true;
  }

  all() { return this.records; }
}
