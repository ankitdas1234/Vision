import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The compiler's file system: create, edit, rename, duplicate, delete, import.
 * Files live in this browser (localStorage, one set per signed-in user), so they
 * survive a reload. Nothing is sent to the server until you press Compile or Run.
 */

export const MAX_NAME = 60;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _.\-]*$/;

export const dirOf = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
export const leafOf = (p) => p.slice(p.lastIndexOf("/") + 1);
const join = (dir, leaf) => (dir ? `${dir}/${leaf}` : leaf);

/** "patrol" -> "patrol.vs" inside `dir`. Returns { name: fullPath } or { error }. `skip` lets a rename keep its own path. */
export function checkName(raw, existing, skip, dir = "") {
  let leaf = String(raw ?? "").trim();
  if (!leaf) return { error: "Type a file name." };
  if (!/\.[A-Za-z0-9]+$/.test(leaf)) leaf += ".vs";
  if (leaf.length > MAX_NAME) return { error: `Keep the name under ${MAX_NAME} characters.` };
  if (!NAME_RE.test(leaf)) return { error: "Use letters, numbers, spaces, - _ and . only." };
  const name = join(dir, leaf);
  if (existing.some((n) => n !== skip && n.toLowerCase() === name.toLowerCase())) return { error: `"${leaf}" already exists here.` };
  return { name };
}

/** Same checks for a folder name (no extension is added). */
export function checkFolderName(raw, existing, skip, dir = "") {
  const leaf = String(raw ?? "").trim();
  if (!leaf) return { error: "Type a folder name." };
  if (leaf.length > MAX_NAME) return { error: `Keep the name under ${MAX_NAME} characters.` };
  if (!NAME_RE.test(leaf)) return { error: "Use letters, numbers, spaces, - _ and . only." };
  const name = join(dir, leaf);
  if (existing.some((n) => n !== skip && n.toLowerCase() === name.toLowerCase())) return { error: `"${leaf}" already exists here.` };
  return { name };
}

/** untitled.vs, untitled-2.vs, ... (existing holds full paths; `dir` is where the new one goes) */
export function freshName(existing, base = "untitled", ext = ".vs", dir = "") {
  let n = 1;
  let leaf = base + ext;
  while (existing.some((x) => x.toLowerCase() === join(dir, leaf).toLowerCase())) leaf = `${base}-${++n}${ext}`;
  return leaf;
}

const read = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v.files !== "object" || Array.isArray(v.files)) return null;
    for (const k of Object.keys(v.files)) if (typeof v.files[k] !== "string") return null;
    v.folders = Array.isArray(v.folders) ? v.folders.filter((f) => typeof f === "string") : [];
    return v;
  } catch {
    return null;
  }
};

/** every folder that exists, including the parents of files (so "a/b/x.vs" implies "a" and "a/b") */
const allFolders = (s) => {
  const set = new Set(s.folders);
  for (const k of Object.keys(s.files)) { let d = dirOf(k); while (d) { set.add(d); d = dirOf(d); } }
  for (const f of [...set]) { let d = dirOf(f); while (d) { set.add(d); d = dirOf(d); } }
  return [...set];
};

const fromSaved = (saved) => {
  const names = Object.keys(saved.files);
  const tabs = (saved.tabs || []).filter((t) => names.includes(t));
  const active = names.includes(saved.active) ? saved.active : tabs[tabs.length - 1] ?? null;
  return { files: saved.files, folders: saved.folders || [], tabs, active };
};

export function useScriptFiles(storageKey, samples) {
  const [state, setState] = useState(() => {
    const saved = read(storageKey);
    if (saved) return fromSaved(saved);
    const first = Object.keys(samples)[0];
    return { files: { ...samples }, folders: [], tabs: [first], active: first };
  });
  const [savedAt, setSavedAt] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const latest = useRef(state);
  latest.current = state;

  const persist = useCallback(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(latest.current));
      setSavedAt(Date.now());
      setSaveError(false);
    } catch {
      setSaveError(true); // private window / storage full: the editor still works, just not saved
    }
  }, [storageKey]);

  // autosave shortly after any change
  useEffect(() => {
    const id = setTimeout(persist, 350);
    return () => clearTimeout(id);
  }, [state, persist]);

  // don't lose the last edit if the tab is closed or reloaded inside the autosave delay
  useEffect(() => {
    const flush = () => { try { localStorage.setItem(storageKey, JSON.stringify(latest.current)); } catch { /* ignore */ } };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", onHide); flush(); };
  }, [storageKey]);

  const { files, tabs, active } = state;
  const names = Object.keys(files);
  const folders = allFolders(state);

  const open = useCallback((name) => {
    setState((s) => (s.files[name] === undefined ? s : { ...s, tabs: s.tabs.includes(name) ? s.tabs : [...s.tabs, name], active: name }));
  }, []);

  const closeTab = useCallback((name) => {
    setState((s) => {
      const i = s.tabs.indexOf(name);
      if (i < 0) return s;
      const next = s.tabs.filter((t) => t !== name);
      const active = s.active === name ? next[Math.min(i, next.length - 1)] ?? null : s.active;
      return { ...s, tabs: next, active };
    });
  }, []);

  const setContent = useCallback((name, value) => {
    setState((s) => (s.files[name] === undefined ? s : { ...s, files: { ...s.files, [name]: value } }));
  }, []);

  const taken = () => [...Object.keys(latest.current.files), ...allFolders(latest.current)];

  const create = useCallback((raw, content = "", dir = "") => {
    const r = checkName(raw, taken(), undefined, dir);
    if (r.error) return r;
    setState((s) => ({ ...s, files: { ...s.files, [r.name]: content }, tabs: [...s.tabs, r.name], active: r.name }));
    return r;
  }, []);

  const createFolder = useCallback((raw, dir = "") => {
    const r = checkFolderName(raw, taken(), undefined, dir);
    if (r.error) return r;
    setState((s) => ({ ...s, folders: [...s.folders, r.name] }));
    return r;
  }, []);

  const rename = useCallback((oldName, raw) => {
    const r = checkName(raw, taken(), oldName, dirOf(oldName));
    if (r.error) return r;
    if (r.name === oldName) return r;
    setState((s) => {
      const files = {};
      for (const k of Object.keys(s.files)) files[k === oldName ? r.name : k] = s.files[k]; // keeps the order
      const swap = (n) => (n === oldName ? r.name : n);
      return { ...s, files, tabs: s.tabs.map(swap), active: s.active ? swap(s.active) : s.active };
    });
    return r;
  }, []);

  const renameFolder = useCallback((oldPath, raw) => {
    const r = checkFolderName(raw, taken(), oldPath, dirOf(oldPath));
    if (r.error) return r;
    if (r.name === oldPath) return r;
    const swap = (n) => (n === oldPath ? r.name : n.startsWith(oldPath + "/") ? r.name + n.slice(oldPath.length) : n);
    setState((s) => {
      const files = {};
      for (const k of Object.keys(s.files)) files[swap(k)] = s.files[k];
      return { files, folders: s.folders.map(swap), tabs: s.tabs.map(swap), active: s.active ? swap(s.active) : s.active };
    });
    return r;
  }, []);

  const remove = useCallback((name) => {
    setState((s) => {
      if (s.files[name] === undefined) return s;
      const files = { ...s.files };
      delete files[name];
      const i = s.tabs.indexOf(name);
      const tabs = s.tabs.filter((t) => t !== name);
      const active = s.active === name ? tabs[Math.min(Math.max(i, 0), tabs.length - 1)] ?? null : s.active;
      return { ...s, files, tabs, active };
    });
  }, []);

  /** delete a folder and everything inside it */
  const removeFolder = useCallback((path) => {
    const inside = (n) => n === path || n.startsWith(path + "/");
    setState((s) => {
      const files = {};
      for (const k of Object.keys(s.files)) if (!inside(k)) files[k] = s.files[k];
      const tabs = s.tabs.filter((t) => !inside(t));
      const active = s.active && inside(s.active) ? tabs[tabs.length - 1] ?? null : s.active;
      return { files, folders: s.folders.filter((f) => !inside(f)), tabs, active };
    });
  }, []);

  /**
   * Copy (or, with `move`, move) a file or folder into the folder `destDir` ("" = top level).
   * A clash gets a "-copy" name instead of overwriting. Returns the new path, or { error }.
   */
  const copyTo = useCallback((src, destDir = "", move = false) => {
    const cur = latest.current;
    const isFile = cur.files[src] !== undefined;
    if (!isFile && !allFolders(cur).includes(src)) return { error: "That item no longer exists." };
    if (!isFile && (destDir === src || destDir.startsWith(src + "/"))) return { error: "You can't put a folder inside itself." };
    const leaf = leafOf(src);
    const taken0 = [...Object.keys(cur.files), ...allFolders(cur)];
    let target = join(destDir, leaf);
    if (move && target === src) return { name: src };
    if (taken0.some((n) => n.toLowerCase() === target.toLowerCase())) {
      const dot = isFile ? leaf.lastIndexOf(".") : -1;
      const base = dot > 0 ? leaf.slice(0, dot) : leaf;
      const ext = dot > 0 ? leaf.slice(dot) : "";
      let n = 1;
      do { target = join(destDir, `${base}-copy${n > 1 ? `-${n}` : ""}${ext}`); n++; } while (taken0.some((x) => x.toLowerCase() === target.toLowerCase()));
    }
    setState((s) => {
      const files = { ...s.files };
      let folders = [...s.folders];
      let tabs = s.tabs;
      let active = s.active;
      if (isFile) {
        files[target] = s.files[src];
        if (move) { delete files[src]; tabs = tabs.map((t) => (t === src ? target : t)); if (active === src) active = target; }
        else { tabs = [...tabs, target]; active = target; }
      } else {
        const swap = (n) => target + n.slice(src.length);
        for (const k of Object.keys(s.files)) if (k.startsWith(src + "/")) { files[swap(k)] = s.files[k]; if (move) delete files[k]; }
        const sub = allFolders(s).filter((f) => f === src || f.startsWith(src + "/"));
        folders = move ? folders.filter((f) => !(f === src || f.startsWith(src + "/"))) : folders;
        folders.push(...sub.map(swap));
        if (move) { tabs = tabs.map((t) => (t.startsWith(src + "/") ? swap(t) : t)); if (active && active.startsWith(src + "/")) active = swap(active); }
      }
      return { files, folders, tabs, active };
    });
    return { name: target };
  }, []);

  const duplicate = useCallback((name) => {
    const r = copyTo(name, dirOf(name), false);
    return r.error ? null : r.name;
  }, [copyTo]);

  /** Add a file from outside (upload). Renames on clash instead of overwriting. */
  const importFile = useCallback((rawName, content, dir = "") => {
    const cur = [...Object.keys(latest.current.files), ...allFolders(latest.current)];
    let r = checkName(rawName, cur, undefined, dir);
    if (r.error) {
      const dot = String(rawName).lastIndexOf(".");
      const ext = dot > 0 ? String(rawName).slice(dot).replace(/[^A-Za-z0-9.]/g, "") || ".vs" : ".vs";
      r = { name: join(dir, freshName(cur, "imported", ext, dir)) };
    }
    setState((s) => ({ ...s, files: { ...s.files, [r.name]: content }, tabs: [...s.tabs, r.name], active: r.name }));
    return r.name;
  }, []);

  /** Put back any sample file that is missing. Never overwrites a file you edited. */
  const restoreSamples = useCallback(() => {
    setState((s) => {
      const files = { ...s.files };
      let added = 0;
      for (const k of Object.keys(samples)) if (files[k] === undefined) { files[k] = samples[k]; added++; }
      return added ? { ...s, files } : s;
    });
  }, [samples]);

  /** Re-read the saved files (saves first, so nothing typed is lost) and rebuild the list. */
  const refresh = useCallback(() => {
    persist();
    const saved = read(storageKey);
    if (saved) setState(fromSaved(saved));
  }, [persist, storageKey]);

  return { files, names, folders, tabs, active, savedAt, saveError, open, closeTab, setContent, create, createFolder, rename, renameFolder, remove, removeFolder, copyTo, duplicate, importFile, restoreSamples, refresh, saveNow: persist };
}
