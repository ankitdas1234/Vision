import { Router } from "express";
import { z } from "zod";
import { memoryManager } from "../memory/MemoryManager";
import { memoryRepository } from "../repositories/memory.repository";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/authorization";
import { createDynamicMemory } from "../memory/dynamic/learning";
import { logger } from "../logging/Logger";

export const memoryRouter = Router();
// Scoped to this router's own prefix — see audio.routes.ts for why an
// unscoped `.use(requireAuth)` would leak into every other router mounted
// on the same flat /api namespace.
memoryRouter.use("/memory", requireAuth);

const TagSchema = z.string().trim().max(40).optional();
const FactSchema = z.object({
  title: z.string().trim().min(2, "Title needs at least 2 characters").max(256),
  content: z.string().trim().min(2, "Content needs at least 2 characters").max(4000),
  tag: TagSchema,
});
const EditSchema = FactSchema.partial().refine((v) => v.title || v.content || v.tag !== undefined, "Nothing to change");

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100) || "fact";
/** Admin topic label -> the memory_type column (upper snake case). No tag = "ADMIN_FACT". */
const typeFromTag = (tag?: string) => (tag ? slug(tag).toUpperCase() : "ADMIN_FACT");

type Taught = { persisted: boolean };

/** Saves one admin-taught dynamic fact: VERIFIED at once, in memory and in Postgres. */
async function teachDynamic(title: string, content: string, tag?: string) {
  const record = createDynamicMemory({ id: crypto.randomUUID(), title, content, source: "ADMIN", confidence: 1, importance: 0.7, tag: tag ? typeFromTag(tag) : undefined });
  memoryManager.dynamicMemory.add(record);
  let persisted = true;
  try {
    await memoryRepository.dynamic.create({
      id: record.id, title: record.title, content: record.content, source: record.source, confidence: record.confidence,
      importance: record.importance, verificationStatus: record.verificationStatus, memoryType: record.tag ?? null,
    });
  } catch (err) {
    persisted = false;
    logger.warn("Failed to persist a taught dynamic memory to the database (kept in-memory for this session only)", { id: record.id, error: (err as Error).message });
  }
  return { ...record, persisted };
}

/** Adds or replaces one static fact. Keyed by a slug of the title, so teaching the same title again replaces it. */
async function teachStatic(title: string, content: string, tag?: string) {
  const memoryKey = `admin.${slug(title)}`;
  const record: { id: string; memoryKey: string; memoryType: string; title: string; content: string; importance: number } =
    { id: crypto.randomUUID(), memoryKey, memoryType: typeFromTag(tag), title, content, importance: 0.8 };
  let persisted = true;
  try {
    const row = await memoryRepository.static.upsert({ memoryKey, memoryType: record.memoryType, title, content, importance: record.importance });
    if (row?.id) record.id = row.id as string;
  } catch (err) {
    persisted = false;
    logger.warn("Failed to persist a static memory to the database (kept in-memory for this session only)", { memoryKey, error: (err as Error).message });
  }
  memoryManager.staticMemory.upsert(record);
  return { ...record, persisted } as typeof record & Taught;
}

memoryRouter.post("/memory/search", async (req, res) => {
  const result = await memoryManager.lookup(req.body?.query ?? "", undefined, { useAI: false });
  res.json(result);
});

/** Admin teaches a fact as DYNAMIC memory (VERIFIED immediately, so it answers lookups). `persisted:false` = DB write failed. */
memoryRouter.post("/memory/learn", requireRole("ADMIN"), async (req, res) => {
  const parsed = FactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: "INVALID_FACT", message: parsed.error.issues[0].message });
  res.json(await teachDynamic(parsed.data.title, parsed.data.content, parsed.data.tag));
});

/** Admin adds/replaces a STATIC fact (highest priority in the lookup chain). */
memoryRouter.post("/memory/static", requireRole("ADMIN"), async (req, res) => {
  const parsed = FactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: "INVALID_FACT", message: parsed.error.issues[0].message });
  res.json(await teachStatic(parsed.data.title, parsed.data.content, parsed.data.tag));
});

/**
 * Bulk import. Body: { kind: "dynamic" | "static", text } where each line is `Title | Content | optional tag`
 * (blank lines and lines starting with # are ignored), or { kind, items: [{title, content, tag?}] }. Max 200 per call.
 */
memoryRouter.post("/memory/bulk", requireRole("ADMIN"), async (req, res) => {
  const kind = req.body?.kind === "static" ? "static" : req.body?.kind === "dynamic" ? "dynamic" : null;
  if (!kind) return res.status(400).json({ code: "INVALID_KIND", message: 'kind must be "dynamic" or "static"' });
  let rows: unknown[] = [];
  if (Array.isArray(req.body?.items)) rows = req.body.items;
  else if (typeof req.body?.text === "string") {
    rows = req.body.text.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string) => l && !l.startsWith("#")).map((l: string) => {
      const [title, content, tag] = l.split("|").map((x) => x.trim());
      return { title, content, tag };
    });
  } else return res.status(400).json({ code: "NO_ITEMS", message: "Send `text` (one fact per line: Title | Content | tag) or `items`." });
  if (rows.length > 200) return res.status(400).json({ code: "TOO_MANY", message: "At most 200 facts per import." });
  let saved = 0, notPersisted = 0;
  const errors: { line: number; message: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const parsed = FactSchema.safeParse(rows[i]);
    if (!parsed.success) { errors.push({ line: i + 1, message: parsed.error.issues[0].message }); continue; }
    const r = kind === "static" ? await teachStatic(parsed.data.title, parsed.data.content, parsed.data.tag) : await teachDynamic(parsed.data.title, parsed.data.content, parsed.data.tag);
    saved++; if (!r.persisted) notPersisted++;
  }
  res.json({ saved, skipped: errors.length, notPersisted, errors: errors.slice(0, 20) });
});

/** Edit a taught fact. Static keeps its key; a dynamic fact becomes VERIFIED (a human just rewrote it). */
memoryRouter.put("/memory/static/:key", requireRole("ADMIN"), async (req, res) => {
  const parsed = EditSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: "INVALID_FACT", message: parsed.error.issues[0].message });
  const cur = memoryManager.staticMemory.all().find((r) => r.memoryKey === req.params.key);
  if (!cur) return res.status(404).json({ code: "NOT_FOUND" });
  const next = { ...cur, ...(parsed.data.title ? { title: parsed.data.title } : {}), ...(parsed.data.content ? { content: parsed.data.content } : {}), ...(parsed.data.tag !== undefined ? { memoryType: typeFromTag(parsed.data.tag) } : {}) };
  let persisted = true;
  try { await memoryRepository.static.upsert({ memoryKey: next.memoryKey, memoryType: next.memoryType, title: next.title, content: next.content, importance: next.importance }); }
  catch (err) { persisted = false; logger.warn("Failed to persist an edited static memory", { key: next.memoryKey, error: (err as Error).message }); }
  memoryManager.staticMemory.upsert(next);
  res.json({ ...next, persisted });
});

memoryRouter.put("/memory/dynamic/:id", requireRole("ADMIN"), async (req, res) => {
  const parsed = EditSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: "INVALID_FACT", message: parsed.error.issues[0].message });
  const rec = memoryManager.dynamicMemory.get(req.params.id);
  if (!rec) return res.status(404).json({ code: "NOT_FOUND" });
  if (parsed.data.title) rec.title = parsed.data.title;
  if (parsed.data.content) rec.content = parsed.data.content;
  if (parsed.data.tag !== undefined) rec.tag = parsed.data.tag ? typeFromTag(parsed.data.tag) : undefined;
  rec.verificationStatus = "VERIFIED";
  let persisted = true;
  try { await memoryRepository.dynamic.correct(rec.id, { title: rec.title, content: rec.content, memoryType: rec.tag }); }
  catch (err) { persisted = false; logger.warn("Failed to persist an edited dynamic memory", { id: rec.id, error: (err as Error).message }); }
  res.json({ ...rec, persisted });
});

/** An admin confirms or rejects a fact Vision learned on its own (it only answers lookups once VERIFIED). */
for (const action of ["verify", "reject"] as const) {
  memoryRouter.post(`/memory/dynamic/:id/${action}`, requireRole("ADMIN"), async (req, res) => {
    const rec = memoryManager.dynamicMemory.get(req.params.id);
    if (!rec) return res.status(404).json({ code: "NOT_FOUND" });
    if (action === "verify") memoryManager.dynamicMemory.verify(rec.id); else memoryManager.dynamicMemory.reject(rec.id);
    let persisted = true;
    try { await memoryRepository.dynamic.updateVerification(rec.id, action === "verify" ? "VERIFIED" : "REJECTED"); }
    catch (err) { persisted = false; logger.warn("Failed to persist a verification decision", { id: rec.id, error: (err as Error).message }); }
    res.json({ ...rec, persisted });
  });
}

memoryRouter.delete("/memory/static/:key", requireRole("ADMIN"), async (req, res) => {
  const key = req.params.key;
  const existed = memoryManager.staticMemory.remove(key);
  try { await memoryRepository.static.deleteByKey(key); } catch (err) {
    logger.warn("Failed to delete a static memory from the database", { key, error: (err as Error).message });
  }
  if (!existed) return res.status(404).json({ code: "NOT_FOUND" });
  res.json({ ok: true });
});

memoryRouter.delete("/memory/dynamic/:id", requireRole("ADMIN"), async (req, res) => {
  const id = req.params.id;
  const existed = memoryManager.dynamicMemory.remove(id);
  try { await memoryRepository.dynamic.delete(id); } catch (err) {
    logger.warn("Failed to delete a dynamic memory from the database", { id, error: (err as Error).message });
  }
  if (!existed) return res.status(404).json({ code: "NOT_FOUND" });
  res.json({ ok: true });
});

memoryRouter.get("/memory/static", (_req, res) => res.json(memoryManager.staticMemory.all()));
memoryRouter.get("/memory/dynamic", (_req, res) => res.json(memoryManager.dynamicMemory.all()));
memoryRouter.get("/memory/conceptual", (_req, res) => res.json({ note: "Conceptual memory is populated per-observation; use POST /api/memory/search with feature context, or GET /api/objects for known concepts." }));
