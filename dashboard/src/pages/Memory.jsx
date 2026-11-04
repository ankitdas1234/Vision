import { useCallback, useEffect, useState } from "react";
import { useAuthStore, hasRole } from "../auth/authStore";
import { memoryApi } from "../api/memory";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import MemoryResult from "../components/memory/MemoryResult";

export default function Memory() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);

  const [error, setError] = useState(null);
  const { user } = useAuthStore();
  const isAdmin = hasRole(user, "ADMIN");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tag, setTag] = useState("");
  const [kind, setKind] = useState("dynamic");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [notice, setNotice] = useState(null);
  const [learnError, setLearnError] = useState(null);
  const [statics, setStatics] = useState([]);
  const [dynamics, setDynamics] = useState([]);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState(null); // { isStatic, id, title, content, tag }

  const refresh = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([memoryApi.listStatic(), memoryApi.listDynamic()]);
      setStatics(Array.isArray(s) ? s : []);
      setDynamics(Array.isArray(d) ? d : []);
    } catch { /* list is a convenience; ignore */ }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const tagOf = (it, isStatic) => { const t = isStatic ? it.memoryType : it.tag; return t && t !== "ADMIN_FACT" ? t : ""; };
  const allTags = [...new Set([...statics.map((x) => tagOf(x, true)), ...dynamics.map((x) => tagOf(x, false))].filter(Boolean))].sort();
  const shown = (items, isStatic) => (filter ? items.filter((it) => tagOf(it, isStatic) === filter) : items);

  const run = async (fn) => { setLearnError(null); setNotice(null); try { await fn(); refresh(); } catch (e) { setLearnError(e.message || "Something went wrong"); } };
  const learn = () => run(async () => {
    if (bulkMode) {
      const r = await memoryApi.bulk(kind, bulkText);
      setNotice(`Imported ${r.saved} fact${r.saved === 1 ? "" : "s"}${r.skipped ? `, skipped ${r.skipped} (${r.errors.slice(0, 3).map((e) => `line ${e.line}: ${e.message}`).join("; ")})` : ""}${r.notPersisted ? `. ${r.notPersisted} could not be saved to the database and will be lost on restart` : ""}.`);
      if (!r.skipped) setBulkText("");
      return;
    }
    const saved = kind === "static" ? await memoryApi.teachStatic(title.trim(), content.trim(), tag.trim()) : await memoryApi.learn(title.trim(), content.trim(), tag.trim());
    setNotice(saved.persisted === false
      ? `Saved "${saved.title}" for now, but the database write failed, so it will be lost on restart.`
      : `Saved "${saved.title}" (${kind === "static" ? "static" : "dynamic, verified"}). Vision can answer it now.`);
    setTitle(""); setContent(""); setTag("");
  });
  const remove = (item, isStatic) => run(() => (isStatic ? memoryApi.removeStatic(item.memoryKey) : memoryApi.removeDynamic(item.id)));
  const decide = (item, verdict) => run(() => (verdict === "verify" ? memoryApi.verify(item.id) : memoryApi.reject(item.id)));
  const saveEdit = () => run(async () => {
    const e = editing;
    const patch = { title: e.title.trim(), content: e.content.trim(), tag: e.tag.trim() };
    await (e.isStatic ? memoryApi.editStatic(e.id, patch) : memoryApi.editDynamic(e.id, patch));
    setEditing(null);
  });
  const search = async () => {
    if (query.trim().length < 2) { setError("Type at least 2 characters."); return; }
    setError(null);
    try { setResult(await memoryApi.search(query.trim())); } catch (e) { setError(e.message || "Search failed"); }
  };

  return (
    <div className="space-y-4">
    <Card title="Memory lookup">
      <p className="text-xs text-vision-muted mb-3">Searches only what Vision has saved: Static, then Dynamic, then Conceptual memory. It says which one found it, or "Not found". The AI is never asked here.</p>
      <div className="flex gap-2 mb-4">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ask Vision's memory (e.g. apple)..." onKeyDown={(e) => e.key === "Enter" && search()} className="flex-1 bg-vision-hover/5 rounded-lg px-3 py-1.5 text-sm text-vision-text outline-none" />
        <Button onClick={search}>Search</Button>
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <MemoryResult result={result} />
    </Card>

    <Card title="Teach Vision a fact">
      {!isAdmin ? (
        <p className="text-xs text-vision-muted">Only an admin can teach Vision. Ask an admin to sign in and add it here.</p>
      ) : (
      <>
      <p className="text-xs text-vision-muted mb-3">Facts you teach are saved in the database, count as verified answers straight away, and are still there after a restart.</p>
      <div className="flex flex-wrap gap-2 mb-2 text-xs">
        {[["dynamic", "Learned fact"], ["static", "Permanent (static) fact"]].map(([k, label]) => (
          <button key={k} onClick={() => setKind(k)} className={`px-3 py-1 rounded-full ${kind === k ? "bg-gray-200 text-black" : "bg-vision-hover/5 text-vision-text"}`}>{label}</button>
        ))}
        <button onClick={() => setBulkMode(!bulkMode)} className={`px-3 py-1 rounded-full ml-auto ${bulkMode ? "bg-gray-200 text-black" : "bg-vision-hover/5 text-vision-text"}`}>Import many</button>
      </div>
      <div className="space-y-2">
        {bulkMode ? (
          <>
            <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={6} placeholder={"One fact per line:\nTitle | What Vision should know | optional tag\nDock code | The dock code is 4821 | safety"} className="w-full bg-vision-hover/5 rounded-lg px-3 py-1.5 text-sm text-vision-text outline-none font-mono" />
            <Button onClick={learn} disabled={bulkText.trim().length < 5}>Import</Button>
          </>
        ) : (
          <>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Wi-Fi password policy)" className="w-full bg-vision-hover/5 rounded-lg px-3 py-1.5 text-sm text-vision-text outline-none" />
            <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="What Vision should know" rows={3} className="w-full bg-vision-hover/5 rounded-lg px-3 py-1.5 text-sm text-vision-text outline-none" />
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Tag (optional, e.g. safety)" className="w-full bg-vision-hover/5 rounded-lg px-3 py-1.5 text-sm text-vision-text outline-none" />
            <Button onClick={learn} disabled={title.trim().length < 2 || content.trim().length < 2}>Teach Vision</Button>
          </>
        )}
        {notice && <p className="text-xs text-vision-muted">{notice}</p>}
        {learnError && <p className="text-xs text-red-600">{learnError}</p>}
      </div>
      </>
      )}
    </Card>

    <Card title="What Vision has been taught">
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3 text-xs">
          <button onClick={() => setFilter("")} className={`px-2 py-0.5 rounded-full ${!filter ? "bg-gray-200 text-black" : "bg-vision-hover/5 text-vision-text"}`}>all</button>
          {allTags.map((t) => <button key={t} onClick={() => setFilter(t)} className={`px-2 py-0.5 rounded-full ${filter === t ? "bg-gray-200 text-black" : "bg-vision-hover/5 text-vision-text"}`}>{t.toLowerCase().replace(/_/g, " ")}</button>)}
        </div>
      )}
      {[["Static facts", shown(statics, true), true], ["Learned facts", shown(dynamics, false), false]].map(([label, items, isStatic]) => (
        <div key={label} className="mb-4 last:mb-0">
          <p className="text-xs font-medium text-vision-text mb-1">{label} ({items.length})</p>
          {items.length === 0 && <p className="text-xs text-vision-muted">Nothing yet.</p>}
          <ul className="space-y-1 max-h-72 overflow-auto">
            {items.map((it) => {
              const id = isStatic ? it.memoryKey : it.id;
              const t = tagOf(it, isStatic);
              if (editing && editing.id === id && editing.isStatic === isStatic) {
                return (
                  <li key={id} className="space-y-1 bg-vision-hover/5 rounded-lg px-3 py-2">
                    <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="w-full bg-vision-hover/5 rounded px-2 py-1 text-xs text-vision-text outline-none" />
                    <textarea value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} rows={2} className="w-full bg-vision-hover/5 rounded px-2 py-1 text-xs text-vision-text outline-none" />
                    <input value={editing.tag} onChange={(e) => setEditing({ ...editing, tag: e.target.value })} placeholder="tag" className="w-full bg-vision-hover/5 rounded px-2 py-1 text-xs text-vision-text outline-none" />
                    <div className="flex gap-3 text-xs"><button onClick={saveEdit} className="text-emerald-600">Save</button><button onClick={() => setEditing(null)} className="text-vision-muted">Cancel</button></div>
                  </li>
                );
              }
              const pending = !isStatic && it.verificationStatus !== "VERIFIED" && it.verificationStatus !== "REJECTED";
              return (
                <li key={id} className="flex items-start justify-between gap-2 text-xs bg-vision-hover/5 rounded-lg px-3 py-1.5">
                  <span className="text-vision-text">
                    <b>{it.title}</b>: {it.content}
                    {t && <em className="ml-1 px-1.5 rounded-full bg-vision-hover/10 not-italic">{t.toLowerCase().replace(/_/g, " ")}</em>}
                    {!isStatic && <em className="text-vision-muted"> [{it.verificationStatus}{it.source && it.source !== "ADMIN" ? `, from ${it.source.toLowerCase()}` : ""}]</em>}
                  </span>
                  {isAdmin && (
                    <span className="flex gap-2 shrink-0">
                      {pending && <button onClick={() => decide(it, "verify")} className="text-emerald-600">Verify</button>}
                      {pending && <button onClick={() => decide(it, "reject")} className="text-amber-600">Reject</button>}
                      <button onClick={() => setEditing({ isStatic, id, title: it.title, content: it.content, tag: t.toLowerCase().replace(/_/g, " ") })} className="text-vision-text">Edit</button>
                      <button onClick={() => remove(it, isStatic)} className="text-red-600">Delete</button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </Card>
    </div>
  );
}
