import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from "react";
import { scriptsApi } from "../api/scripts";
import { settingsApi } from "../api/settings";
import { useControlMode } from "../hooks/useControlMode";
import { useSimMode } from "../hooks/useSimMode";
import { simulationApi } from "../api/simulation";
import Card from "../components/common/Card";
import Badge from "../components/common/Badge";
import { useAuthStore } from "../auth/authStore";
import { useScriptFiles } from "../components/compiler/useScriptFiles";
import Explorer, { NewFileIcon, FileIcon, DownloadIcon, CompileIcon, RunIcon } from "../components/compiler/Explorer";

/** iOS-style toggle switch (same look as the Settings page). onChange gets the NEXT value. */
function Switch({ checked, onChange, disabled = false, busy = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || busy}
      onClick={() => onChange?.(!checked)}
      className="relative w-[40px] h-[24px] rounded-full transition-colors duration-200 ease-out shrink-0 border-0 cursor-pointer p-0 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ backgroundColor: checked ? "#34c759" : "#e9e9eb" }}
    >
      <span
        className="absolute top-[2px] w-[20px] h-[20px] rounded-full bg-white transition-all duration-200 ease-out pointer-events-none"
        style={{
          left: checked ? "18px" : "2px",
          boxShadow: "0px 2px 6px rgba(0, 0, 0, 0.15), 0px 2px 1px rgba(0, 0, 0, 0.06)",
        }}
      />
    </button>
  );
}

const SAMPLES = {
  "look-around.vs": `# Look around, walk a little, say hi
EYE_CENTER
WAIT 500
REPEAT 2 TIMES AS $step
  SET $a $step * 45 + 45
  EYE_SET $a
  WAIT 600
END
WALK_FORWARD 1000
WALK_STOP
AUDIO_SPEAK "Hello!"`,
  "walk-and-talk.vs": `# Announce, walk, glance both ways, finish
AUDIO_SPEAK "Here I go"
WALK_FORWARD 1000
WALK_STOP
EYE_SET 45
WAIT 400
EYE_SET 135
WAIT 400
EYE_CENTER
AUDIO_SPEAK "All done"`,
  "patrol.vs": `# Walk a square
REPEAT 4 TIMES
  WALK_FORWARD 1000
  WALK_STOP
  TURN_RIGHT 300
  WALK_STOP
END
PRINT "patrol done"`,
};

/* ------------------------------------------------------------------ */
/* Editor helpers (VS Code "Quiet Light" look)                         */
/* ------------------------------------------------------------------ */

const LINE_H = 22; // px — shared by gutter, highlight layer and textarea
const KEYWORDS = new Set(["SET", "REPEAT", "TIMES", "AS", "END", "IF", "ELSE", "THEN", "RANDOM", "PRINT", "WAIT"]);
const TOKEN_RE = /(#.*$)|("(?:[^"\\]|\\.)*"?)|(\$[A-Za-z_]\w*)|(\b\d+(?:\.\d+)?\b)|(\b[A-Z][A-Z0-9_]*\b)|(>=|<=|==|!=|[><+\-*/])/g;
// VS Code "Quiet Light" palette (values from the theme's quietlight-color-theme.json)
const COLORS = {
  comment: "#9A9A94",
  string: "#2B6CB0",
  variable: "#3F7F6B",
  number: "#1D5FB4",
  keyword: "#9A5B2B",
  command: "#2F6F8F",
  operator: "#6B6B66",
};
const QL = { bg: "#F7F8F6", fg: "#2A2A28", line: "#ECEEEA", num: "#A3A39C", numActive: "#3A3A38", cursor: "#171717", err: "#D94452" };

function highlightLine(line) {
  const out = [];
  let last = 0;
  let first = true; // first word on the line is the command / statement
  const text = line;
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    let color;
    if (m[1]) color = COLORS.comment;
    else if (m[2]) color = COLORS.string;
    else if (m[3]) color = COLORS.variable;
    else if (m[4]) color = COLORS.number;
    else if (m[5]) color = KEYWORDS.has(m[5]) ? COLORS.keyword : first ? COLORS.command : COLORS.keyword;
    else color = COLORS.operator;
    const style = { color };
    if (m[1]) style.fontStyle = "italic";
    else if (m[5] && color === COLORS.command) style.fontWeight = 600;
    out.push(<span key={m.index} style={style}>{m[0]}</span>);
    last = m.index + m[0].length;
    if (!m[1]) first = false;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const monoFont = { fontFamily: "ui-monospace, SFMono-Regular, 'Cascadia Code', Menlo, Consolas, monospace", fontSize: 13.5, lineHeight: `${LINE_H}px` };

function CodeEditor({ value, onChange, disabled, problems, onCursor, onRun, onCompile, onSave }) {
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const [active, setActive] = useState(1);
  const lines = useMemo(() => value.split("\n"), [value]);
  // Caret moves requested by the editor itself (auto-indent, Tab, END). They are applied right after React
  // writes the new text, before the browser handles the next key, so fast typing can't land in the wrong place.
  const caretNext = useRef(null);
  useLayoutEffect(() => {
    const pos = caretNext.current;
    const ta = taRef.current;
    if (pos == null || !ta) return;
    caretNext.current = null;
    ta.selectionStart = ta.selectionEnd = pos;
    syncCursor();
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const errorLines = useMemo(() => new Set(problems.map((p) => p.line)), [problems]);

  const syncCursor = () => {
    const ta = taRef.current;
    if (!ta) return;
    const upto = ta.value.slice(0, ta.selectionStart);
    const ln = upto.split("\n").length;
    const col = upto.length - upto.lastIndexOf("\n");
    setActive(ln);
    onCursor?.({ ln, col });
    // keep the caret line visible — the textarea itself never scrolls
    const sc = scrollRef.current;
    if (sc) {
      const top = (ln - 1) * LINE_H + 8;
      if (top < sc.scrollTop) sc.scrollTop = top - 8;
      else if (top + LINE_H + 8 > sc.scrollTop + sc.clientHeight) sc.scrollTop = top + LINE_H + 8 - sc.clientHeight;
    }
  };

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); onRun?.(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") { e.preventDefault(); onCompile?.(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); onSave?.(); return; }
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // new line keeps the indent of the line above; one level deeper after REPEAT
      const ta = e.target;
      const { selectionStart: s, selectionEnd: en } = ta;
      const lineStart = ta.value.lastIndexOf("\n", s - 1) + 1;
      const before = ta.value.slice(lineStart, s);
      const indent = (before.match(/^[ \t]*/) || [""])[0];
      const deeper = /^\s*REPEAT\b/i.test(before) ? "  " : "";
      if (indent || deeper) {
        e.preventDefault();
        const ins = "\n" + indent + deeper;
        caretNext.current = s + ins.length;
        onChange(ta.value.slice(0, s) + ins + ta.value.slice(en));
        return;
      }
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.target;
      const { selectionStart: s, selectionEnd: en } = ta;
      caretNext.current = s + 2;
      onChange(ta.value.slice(0, s) + "  " + ta.value.slice(en));
    }
  };

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto" style={{ minHeight: 0, background: QL.bg }}>
      <div className="flex min-h-full" style={{ ...monoFont, width: "max-content", minWidth: "100%" }}>
        {/* gutter */}
        <div className="sticky left-0 z-10 shrink-0 select-none text-right pr-3 pl-4 py-2" style={{ color: QL.num, background: QL.bg }} aria-hidden="true">
          {lines.map((_, i) => (
            <div
              key={i}
              style={{ height: LINE_H, color: errorLines.has(i + 1) ? QL.err : i + 1 === active ? QL.numActive : QL.num }}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* code: highlight layer in flow (sets the size), textarea on top */}
        <div className="relative flex-1 py-2 pr-6">
          <div aria-hidden="true" className="pointer-events-none" style={{ whiteSpace: "pre", color: QL.fg }}>
            {lines.map((l, i) => (
              <div
                key={i}
                style={{
                  height: LINE_H,
                  background: errorLines.has(i + 1) ? "#FBE4E6" : i + 1 === active && !disabled ? QL.line : "transparent",
                  boxShadow: errorLines.has(i + 1) ? "inset 3px 0 #D94452" : "none",
                }}
              >
                {l.length ? highlightLine(l) : "​"}
              </div>
            ))}
          </div>
          <textarea
            ref={taRef}
            value={value}
            disabled={disabled}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            aria-label="Vision Script editor"
            onChange={(e) => {
              const ta = e.target; let v = ta.value; const pos = ta.selectionStart;
              // typing END on an indented line steps it back out to line up with its REPEAT
              const ls = v.lastIndexOf("\n", pos - 1) + 1;
              const m = /^( {2,})END$/i.exec(v.slice(ls, pos));
              if (m && (v[pos] === undefined || v[pos] === "\n")) {
                v = v.slice(0, ls) + m[1].slice(2) + v.slice(ls + m[1].length);
                caretNext.current = pos - 2;
                onChange(v);
                return;
              }
              onChange(v);
            }}
            onKeyDown={onKeyDown}
            onKeyUp={syncCursor}
            onClick={syncCursor}
            onSelect={syncCursor}
            className="absolute left-0 top-2 w-full outline-none resize-none border-0 bg-transparent p-0 overflow-hidden"
            style={{ ...monoFont, height: lines.length * LINE_H, whiteSpace: "pre", color: "transparent", caretColor: QL.cursor }}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const stamp = () => new Date().toLocaleTimeString([], { hour12: false });

/**
 * Vision Script compiler — ADMIN-only (see App.jsx RoleRoute + the server's
 * requireRole("ADMIN") on /api/scripts/*). One editor for the whole script:
 *   - Compile (Ctrl/Cmd+B): dry-run (source -> AST -> IR), never touches
 *     hardware, always allowed regardless of Control Mode.
 *   - Run (Ctrl/Cmd+Enter): compiles AND executes every line in order.
 *     Requires Manual Mode, same as any direct hardware control.
 * The editor + terminal are laid out like VS Code (editor on top, bottom
 * panel with TERMINAL / PROBLEMS, status bar underneath).
 */
export default function Compiler({ standalone = false }) {
  const { mode, isManual, loading, refresh } = useControlMode();
  const sim = useSimMode();

  const [toggling, setToggling] = useState(false);
  const { user } = useAuthStore();
  const fs = useScriptFiles(`vision.compiler.files.v1.${user?.id ?? user?.email ?? "anon"}`, SAMPLES);
  const { tabs, active: activeFile } = fs;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // {name, kind} waiting for "Delete?" confirmation
  const [flash, setFlash] = useState(null);
  const uploadRef = useRef(null);
  const source = activeFile ? fs.files[activeFile] ?? "" : "";
  const setSource = (v) => activeFile && fs.setContent(activeFile, v);
  const openFile = (name) => {
    fs.open(name);
    setProblems([]);
    setCursor({ ln: 1, col: 1 });
  };
  const closeTab = (name) => { fs.closeTab(name); if (name === activeFile) { setProblems([]); setCursor({ ln: 1, col: 1 }); } };
  // toast: a small card in the bottom-right corner. Kind (good / problem / plain) is picked from the words.
  const toastSeq = useRef(0);
  const toastKind = (t) => (/^✖|couldn't|can't|too big|failed|problem|error/i.test(t) ? "error" : /^(created|deleted|renamed|moved|pasted|copied|imported|saved|compiled|run finished|files refreshed|sample files)/i.test(t) ? "ok" : "info");
  const note = (text, kind) => { setFlash({ id: ++toastSeq.current, text: String(text).replace(/^✖\s*/, ""), kind: kind || toastKind(String(text)), leaving: false }); };
  const dismissToast = () => setFlash((f) => (f ? { ...f, leaving: true } : f));
  const TOAST_MS = 3200;
  useEffect(() => {
    if (!flash) return undefined;
    if (flash.leaving) {
      const id = setTimeout(() => setFlash(null), 180);
      return () => clearTimeout(id);
    }
    const id = setTimeout(dismissToast, flash.kind === "error" ? TOAST_MS + 1800 : TOAST_MS);
    return () => clearTimeout(id);
  }, [flash?.id, flash?.leaving]);

  const createFile = (name, dir = "") => { const r = fs.create(name, `# ${name}\n`, dir); if (!r.error) { setProblems([]); setCursor({ ln: 1, col: 1 }); note(`Created ${r.name}`); } return r; };
  const renameFile = (from, to) => { const r = fs.rename(from, to); if (!r.error && r.name !== from) note(`Renamed to ${r.name}`); return r; };
  const askDelete = (name, kind = "file") => setConfirmDelete({ name, kind });
  const doDelete = () => {
    const target = confirmDelete;
    setConfirmDelete(null);
    if (!target) return;
    const { name, kind } = target;
    if (kind === "folder") fs.removeFolder(name); else fs.remove(name);
    if (activeFile && (name === activeFile || (kind === "folder" && activeFile.startsWith(name + "/")))) { setProblems([]); setCursor({ ln: 1, col: 1 }); }
    note(`Deleted ${name}`);
  };
  const createFolder = (name, dir = "") => { const r = fs.createFolder(name, dir); if (!r.error) note(`Created folder ${r.name}`); return r; };
  const renameFolder = (from, to) => { const r = fs.renameFolder(from, to); if (!r.error && r.name !== from) note(`Renamed to ${r.name}`); return r; };
  const pasteInto = (src, dir, cut) => {
    const r = fs.copyTo(src, dir, cut);
    if (r.error) note(r.error); else { setProblems([]); note(cut ? `Moved to ${r.name}` : `Pasted ${r.name}`); }
    return r;
  };
  const duplicateItem = (path, kind) => {
    const r = fs.copyTo(path, path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "", false);
    if (r.error) note(r.error); else { if (kind === "file") setProblems([]); note(`Created ${r.name}`); }
  };
  const refreshFiles = () => { fs.refresh(); note("Files refreshed"); };
  const downloadFile = (name) => {
    try {
      const url = URL.createObjectURL(new Blob([fs.files[name] ?? ""], { type: "text/plain" }));
      const a = document.createElement("a");
      a.href = url; a.download = name.slice(name.lastIndexOf("/") + 1); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { note("Couldn't download that file"); }
  };
  const onUploadPicked = async (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    for (const f of picked.slice(0, 10)) {
      if (f.size > 200_000) { note(`${f.name} is too big (max 200 KB)`); continue; }
      try { const name = fs.importFile(f.name, await f.text()); note(`Imported ${name}`); } catch { note(`Couldn't read ${f.name}`); }
    }
  };
  const saveNow = () => { fs.saveNow(); note(fs.saveError ? "Couldn't save in this browser" : "Saved"); };
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState([]); // scrollback of {type, text, time}
  const [problems, setProblems] = useState([]); // [{line, message}]
  const [panelTab, setPanelTab] = useState("terminal");
  const [panelOpen, setPanelOpen] = useState(false); // the terminal only shows when you ask for it
  const [panelPos, setPanelPosState] = useState(() => { try { return localStorage.getItem("vision.compiler.panelPos") === "right" ? "right" : "bottom"; } catch { return "bottom"; } });
  const setPanelPos = (v) => { setPanelPosState(v); try { localStorage.setItem("vision.compiler.panelPos", v); } catch { /* ignore */ } };
  const frameRef = useRef(null);
  const [cursor, setCursor] = useState({ ln: 1, col: 1 });
  const [lastResult, setLastResult] = useState(null); // "ok" | "error" | null
  const [modeToast, setModeToast] = useState(null);
  const scrollRef = useRef(null);

  // Admin-only kill switch — separate from Control Mode. When off, BOTH
  // compiling and executing are rejected server-side for everyone,
  // including admins; this is an emergency "shut the whole feature off",
  // not a hardware gate. See docs/vision-script.md.
  const [compilerEnabled, setCompilerEnabled] = useState(true);
  const [compilerLoading, setCompilerLoading] = useState(true);
  const [killSwitchBusy, setKillSwitchBusy] = useState(false);

  const loadCompilerEnabled = useCallback(async () => {
    try {
      const { enabled } = await settingsApi.getCompilerEnabled();
      setCompilerEnabled(enabled);
    } finally {
      setCompilerLoading(false);
    }
  }, []);

  useEffect(() => { loadCompilerEnabled(); }, [loadCompilerEnabled]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [output, panelTab]);

  const toggleCompilerEnabled = async () => {
    setKillSwitchBusy(true);
    try {
      const { enabled } = await settingsApi.setCompilerEnabled(!compilerEnabled);
      setCompilerEnabled(enabled);
      setModeToast(enabled ? "Compiler re-enabled" : "Compiler disabled — nobody can compile or run scripts until it's re-enabled");
    } finally {
      setKillSwitchBusy(false);
    }
  };

  // "Manual Mode" is what this toggle actually flips — from this page it's
  // referred to as Compiler Mode ON; the other state is Autonomous Mode.
  const toggleMode = async () => {
    setToggling(true);
    try {
      const nextManual = !isManual;
      await settingsApi.setManualMode(nextManual);
      refresh();
      setModeToast(nextManual ? "Compiler mode activated" : "Autonomous mode activated");
    } finally {
      setToggling(false);
    }
  };

  useEffect(() => {
    if (!modeToast) return undefined;
    const id = setTimeout(() => setModeToast(null), 3000);
    return () => clearTimeout(id);
  }, [modeToast]);

  const log = (entry) => setOutput((h) => [...h, { ...entry, time: stamp() }]);

  // In ROBOT_MODE=simulation, hand the compiled script to the simulator's Compiler view
  // (the server compiles it again; nothing here touches the robot). Silent when not simulating.
  const sendToSimulator = async (autoplay) => {
    if (!sim.available) return;
    try {
      await simulationApi.pushProgram(source, activeFile.slice(activeFile.lastIndexOf("/") + 1), autoplay);
      log({ type: "output", text: autoplay ? "Sent to the simulator and playing." : "Sent to the simulator — press Play there." });
    } catch (err) {
      // 422 = it didn't compile; the simulator still shows which stage stopped it
      if (err.status !== 422) log({ type: "error", text: `Simulator: ${err.message || "couldn't load the program"}` });
    }
  };

  const showDiagnostics = (diagnostics) => {
    const list = (diagnostics || []).map((d) => ({ line: d.line, message: d.message }));
    setProblems(list);
    setLastResult("error");
    log({ type: "error", text: list.map((d) => `line ${d.line}: ${d.message}`).join("\n") });
    setPanelTab("problems");
    note(`✖ ${list.length} problem${list.length === 1 ? "" : "s"} — click ✖ in the status bar to see ${list.length === 1 ? "it" : "them"}`);
  };

  const handleCompile = async () => {
    if (busy || !compilerEnabled || compilerLoading || !activeFile) return;
    setBusy(true);
    setPanelTab("terminal");
    log({ type: "action", text: `vision compile ${activeFile}` });
    try {
      const compiled = await scriptsApi.compile(source);
      if (compiled.success) {
        setProblems([]);
        setLastResult("ok");
        log({ type: "output", text: `Compiled OK — ${compiled.ir?.instructions?.length ?? 0} instruction(s).` });
        note(`Compiled OK — ${compiled.ir?.instructions?.length ?? 0} instruction(s)`);
        await sendToSimulator(false);
      } else {
        showDiagnostics(compiled.diagnostics);
        await sendToSimulator(false);
      }
    } catch (err) {
      setLastResult("error");
      log({ type: "error", text: err.message || "Compile failed" });
      note(err.message || "Compile failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRun = async () => {
    if (busy || !compilerEnabled || compilerLoading || !isManual || !activeFile) return;
    setBusy(true);
    setPanelTab("terminal");
    log({ type: "action", text: `vision run ${activeFile}` });
    try {
      const { compiled, executionResults } = await scriptsApi.execute(source);
      if (!compiled.success) {
        showDiagnostics(compiled.diagnostics);
        await sendToSimulator(false);
      } else {
        setProblems([]);
        setLastResult("ok");
        const summary = executionResults
          .map((r, i) => `[${i + 1}] ${r.type}: ${r.status}${r.error ? ` (${r.error.message})` : ""}`)
          .join("\n") || "(no-op)";
        log({ type: "output", text: summary });
        note("Run finished — open the terminal to see each step");
        await sendToSimulator(true);
      }
    } catch (err) {
      setLastResult("error");
      log({ type: "error", text: err.message || "Run failed" });
      note(err.message || "Run failed");
    } finally {
      setBusy(false);
    }
  };

  const onSourceChange = (v) => {
    setSource(v);
    if (problems.length) setProblems([]); // stale once the text changes
  };

  const disabled = !compilerEnabled || compilerLoading;
  const runDisabled = disabled || !isManual || !activeFile;

  const toggleTerminal = () => {
    if (panelOpen && panelTab === "terminal") { setPanelOpen(false); return; }
    setPanelTab("terminal");
    setPanelOpen(true);
  };

  // Shortcuts that work anywhere on this page (not only inside the editor):
  //   Ctrl/Cmd+T or Ctrl/Cmd+`  show / hide the terminal
  //   Ctrl/Cmd+C                compile (only when nothing is selected, so normal copy still works)
  //   Ctrl/Cmd+R                run
  // The listener always calls the newest handlers through this ref.
  const keysRef = useRef({});
  keysRef.current = { handleCompile, handleRun, toggleTerminal };
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      const t = e.target;
      const tag = t?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable;
      if (typing && !frameRef.current?.contains(t)) return; // a text box elsewhere on the page keeps its own keys
      const k = e.key.toLowerCase();
      const k2 = keysRef.current;
      if (k === "t" || k === "`") { e.preventDefault(); k2.toggleTerminal(); }
      else if (k === "r") { e.preventDefault(); k2.handleRun(); }
      else if (k === "c") {
        const selected = (typeof t?.selectionStart === "number" && t.selectionStart !== t.selectionEnd) || String(window.getSelection?.() ?? "").length > 0;
        if (selected) return; // let the browser copy
        e.preventDefault();
        k2.handleCompile();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const lineCount = source.split("\n").length;

  return (
    <div className={standalone ? "h-screen bg-[#EFEFED] flex flex-col x1" : "space-y-6 x1"}>
      <style>{`
        @keyframes toastIn{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}
        @keyframes toastOut{to{opacity:0;transform:translateY(8px) scale(.97)}}
        @keyframes toastBar{from{transform:scaleX(1)}to{transform:scaleX(0)}}
        @keyframes compilerFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
      `}</style>

      {modeToast && (
        <div className="rounded-lg bg-vision-hover/10 text-sm text-vision-text px-4 py-2" role="status">{modeToast}</div>
      )}

      {!standalone && <div className="grid gap-4 md:grid-cols-2">
        <Card title="Control Mode">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <Badge tone={isManual ? "ok" : "warn"}>{loading ? "…" : mode}</Badge>
              <p className="text-xs text-vision-muted max-w-xs">
                {isManual
                  ? "Manual: scripts and dashboard controls move the robot directly."
                  : "Autonomous: the brain drives. Switch on Manual to run scripts."}
              </p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Switch checked={isManual} onChange={toggleMode} disabled={loading} busy={toggling} label="Manual mode" />
              <span className="text-[10px] uppercase tracking-wide text-vision-muted">{isManual ? "Manual" : "Auto"}</span>
            </div>
          </div>
        </Card>

        <Card title="Compiler">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <Badge tone={compilerEnabled ? "ok" : "danger"}>
                {compilerLoading ? "…" : compilerEnabled ? "ENABLED" : "DISABLED"}
              </Badge>
              <p className="text-xs text-vision-muted max-w-xs">
                Emergency switch: when off, nobody can compile or run scripts.
              </p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Switch checked={compilerEnabled} onChange={toggleCompilerEnabled} disabled={compilerLoading} busy={killSwitchBusy} label="Compiler enabled" />
              <span className="text-[10px] uppercase tracking-wide text-vision-muted">{compilerEnabled ? "On" : "Off"}</span>
            </div>
          </div>
        </Card>
      </div>}

      {!standalone && compilerEnabled && !compilerLoading && (
        <div className="flex justify-end -mb-3">
          <a href="/compiler" target="_blank" rel="noreferrer" className="text-xs text-vision-muted hover:text-vision-text no-underline">Open on its own page ↗</a>
        </div>
      )}

      {compilerEnabled && !compilerLoading ? (
        <div
          ref={frameRef}
          className={`relative overflow-hidden bg-[#EFEFED] text-[#2A2A28] flex flex-col ${standalone ? "" : "rounded-[20px] border border-[#E2E2DF] shadow-[0_2px_4px_rgba(0,0,0,.04),0_18px_48px_rgba(0,0,0,.09)]"}`}
          style={{ animation: "compilerFadeIn .25s ease-out", height: standalone ? "100%" : 700, minHeight: standalone ? 0 : 480, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}
        >
          <div className="flex flex-1 min-h-0">
            {/* tool rail: small thin icons, name + shortcut on hover */}
            <div className="w-11 shrink-0 flex flex-col items-center gap-0.5 pt-3 pb-2 select-none" role="toolbar" aria-label="Compiler tools" aria-orientation="vertical">
              {(() => {
                const svg = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.35, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
                const termOn = panelOpen && panelTab === "terminal";
                const base = "relative group w-[30px] h-[30px] rounded-lg flex items-center justify-center transition duration-150 outline-none focus-visible:ring-1 focus-visible:ring-[#2A2A28]/30 disabled:opacity-35 disabled:cursor-not-allowed";
                const tone = (on) => (on ? "text-[#2A2A28] bg-white shadow-[0_1px_2px_rgba(0,0,0,.09)] border border-[#E4E4E0]" : "text-[#8A8A84] border border-transparent hover:text-[#2A2A28] hover:bg-white hover:border-[#E4E4E0] hover:shadow-[0_1px_2px_rgba(0,0,0,.06)]");
                const Tip = ({ label, keys }) => (
                  <span role="tooltip" className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 whitespace-nowrap rounded-md bg-white px-2 py-1 text-[11px] leading-none text-[#2A2A28] border border-[#E4E4E0] shadow-[0_4px_14px_rgba(0,0,0,.10)] opacity-0 -translate-x-0.5 transition duration-150 group-hover:opacity-100 group-hover:translate-x-0 group-hover:delay-300 group-focus-visible:opacity-100 group-focus-visible:translate-x-0">
                    {label}{keys && <span className="ml-1.5 text-[#9A9A94]">{keys}</span>}
                  </span>
                );
                return (
                  <>
                    <button type="button" onClick={() => setSidebarOpen((o) => !o)} aria-label="Files" aria-pressed={sidebarOpen} className={`${base} ${tone(sidebarOpen)}`}>
                      <svg {...svg}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" /></svg>
                      <Tip label="Files" />
                    </button>
                    <button type="button" onClick={toggleTerminal} aria-label="Terminal" aria-pressed={termOn} className={`${base} ${tone(termOn)}`}>
                      <svg {...svg}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M7.5 9.5 10 12l-2.5 2.5M12.5 15h4" /></svg>
                      <Tip label="Terminal" keys="Ctrl+T" />
                    </button>

                    <button type="button" onClick={handleCompile} disabled={busy || !activeFile} aria-label="Compile" className={`${base} ${tone(false)}`}>
                      <CompileIcon size={16} sw={1.35} />
                      <Tip label="Compile" keys="Ctrl+C" />
                    </button>
                    <button type="button" onClick={handleRun} disabled={runDisabled || busy} aria-label="Run" className={`${base} ${tone(false)} disabled:hover:bg-transparent disabled:hover:border-transparent disabled:hover:shadow-none`}>
                      {busy ? (
                        <span className="w-3.5 h-3.5 rounded-full border-[1.5px] border-[#2A2A28]/20 border-t-[#2A2A28] animate-spin" />
                      ) : (
                        <RunIcon size={16} sw={1.35} />
                      )}
                      <Tip label={!isManual ? "Run needs Manual mode" : "Run"} keys={isManual ? "Ctrl+R" : null} />
                    </button>
                  </>
                );
              })()}
            </div>

            {/* explorer */}
            {sidebarOpen && (
              <Explorer
                names={fs.names}
                folders={fs.folders}
                active={activeFile}
                creating={creating}
                setCreating={setCreating}
                onOpen={openFile}
                onCreate={createFile}
                onCreateFolder={createFolder}
                onRename={renameFile}
                onRenameFolder={renameFolder}
                onRequestDelete={askDelete}
                onDuplicate={duplicateItem}
                onPaste={pasteInto}
                onRefresh={refreshFiles}
                onNote={note}
                onDownload={downloadFile}
                onUpload={() => uploadRef.current?.click()}
                onRestore={() => { fs.restoreSamples(); note("Sample files restored (your edits were kept)"); }}
                onCollapse={() => setSidebarOpen(false)}
              />
            )}

            {/* editor column */}
            <div className="flex-1 min-w-0 flex flex-col py-2 pr-2">
              <div className="flex-1 min-h-0 min-w-0 flex flex-col rounded-[14px] bg-[#F7F8F6] border border-[#E2E4DF] overflow-hidden">
              {/* tab strip */}
              <div className="flex h-11 shrink-0 select-none px-2 pt-2 pb-1 gap-1">
                <div className="flex flex-1 min-w-0 overflow-x-auto gap-1" role="tablist">
                {tabs.map((name) => (
                  <div
                    key={name}
                    role="tab"
                    aria-selected={activeFile === name}
                    onClick={() => openFile(name)}
                    onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(name); } }}
                    className={`group flex items-center gap-2 pl-3 pr-2 h-8 rounded-lg text-[13px] cursor-pointer shrink-0 transition ${
                      activeFile === name ? "bg-white text-[#2A2A28] shadow-[0_1px_2px_rgba(0,0,0,.08)] border border-[#E4E4E0]" : "text-[#6B6B66] border border-transparent hover:bg-white"
                    }`}
                  >
                    <span className="text-[#737373]"><FileIcon size={14} /></span>
                    {name}
                    {busy && activeFile === name ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#262626] animate-pulse" />
                    ) : (
                      <button
                        type="button"
                        aria-label={`Close ${name}`}
                        onClick={(e) => { e.stopPropagation(); closeTab(name); }}
                        className={`w-4 h-4 rounded flex items-center justify-center text-[12px] leading-none hover:text-[#171717] hover:bg-[#EDEDEA] ${activeFile === name ? "" : "opacity-0 group-hover:opacity-100"}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  title="New file"
                  aria-label="New file"
                  onClick={() => { setSidebarOpen(true); setCreating(true); }}
                  className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-[#6B6B66] hover:bg-white"
                >
                  <NewFileIcon size={15} />
                </button>
                </div>

              </div>

              <div className={`flex-1 min-h-0 flex ${panelPos === "right" ? "flex-row" : "flex-col"}`}>
                <div className="flex-1 min-w-0 min-h-0 flex flex-col">
              {activeFile ? (
                <>
                  {/* breadcrumb */}
                  <div className="h-9 shrink-0 flex items-center px-4 text-[12.5px] text-[#6B6B66] select-none border-y border-[#E6E8E3]">
                    <span className="text-[#9A9A94] mr-1.5">▾</span> <span className="text-[#2A2A28]">scripts/{activeFile}</span> <span className="ml-2 text-[#2F8F4E]">{lineCount} {lineCount === 1 ? "line" : "lines"}</span>
                    <button type="button" onClick={() => downloadFile(activeFile)} title="Download this file" aria-label="Download this file" className="ml-auto w-6 h-5 flex items-center justify-center rounded hover:text-[#171717] hover:bg-white">
                      <DownloadIcon size={14} />
                    </button>
                  </div>

                  {/* editor */}
                  <CodeEditor
                    key={activeFile}
                    value={source}
                    onChange={onSourceChange}
                    disabled={false}
                    problems={problems}
                    onCursor={setCursor}
                    onRun={handleRun}
                    onCompile={handleCompile}
                    onSave={saveNow}
                  />
                </>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center px-6 select-none">
                  <div className="text-[#E4E4E4] mb-3"><FileIcon size={56} /></div>
                  <div className="text-[18px] text-[#525252] mb-1">{fs.names.length ? "No file is open" : "No files yet"}</div>
                  <p className="text-[13px] text-[#737373] mb-4 max-w-xs">
                    {fs.names.length ? "Pick a file in the Explorer, or start a new one." : "Create your first Vision Script file to get started."}
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setSidebarOpen(true); setCreating(true); }} className="h-9 px-4 rounded-lg bg-white border border-[#DADAD6] text-[#2A2A28] text-[13px] hover:shadow-[0_1px_3px_rgba(0,0,0,.08)] transition">New file</button>
                    <button type="button" onClick={() => uploadRef.current?.click()} className="h-9 px-4 rounded-lg border border-[#DADAD6] bg-white text-[13px] text-[#333] hover:bg-[#F5F5F3]">Upload file</button>
                  </div>
                  <div className="mt-6 text-[12px] text-[#737373] leading-6">
                    <div><kbd className="px-1.5 py-0.5 rounded bg-[#F5F5F5] border border-[#E4E4E4]">Ctrl/Cmd+C</kbd> compile · <kbd className="px-1.5 py-0.5 rounded bg-[#F5F5F5] border border-[#E4E4E4]">Ctrl/Cmd+R</kbd> run · <kbd className="px-1.5 py-0.5 rounded bg-[#F5F5F5] border border-[#E4E4E4]">Ctrl/Cmd+T</kbd> terminal · <kbd className="px-1.5 py-0.5 rounded bg-[#F5F5F5] border border-[#E4E4E4]">Ctrl/Cmd+S</kbd> save</div>
                    <div><kbd className="px-1.5 py-0.5 rounded bg-[#F5F5F5] border border-[#E4E4E4]">F2</kbd> rename · <kbd className="px-1.5 py-0.5 rounded bg-[#F5F5F5] border border-[#E4E4E4]">Del</kbd> delete (select a file first)</div>
                  </div>
                </div>
              )}
                </div>

                {/* terminal / problems panel: hidden until asked for; bottom or right */}
              {panelOpen && (
              <div className={`shrink-0 bg-white flex flex-col rounded-xl border border-[#E4E4E0] shadow-[0_1px_2px_rgba(0,0,0,.04)] ${panelPos === "right" ? "m-2 ml-0" : "m-2 mt-0"}`} style={panelPos === "right" ? { width: 380 } : { height: 210 }}>
                <div className="flex items-center justify-between h-9 px-4 shrink-0 select-none">
                  <div className="flex gap-5 text-[11px] tracking-wide whitespace-nowrap">
                    {[
                      ["problems", `PROBLEMS${problems.length ? ` ${problems.length}` : ""}`],
                      ["terminal", "TERMINAL"],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setPanelTab(id)}
                        className={`h-9 border-b-2 ${panelTab === id ? "text-[#2A2A28] border-[#2A2A28]" : "text-[#85857F] border-transparent hover:text-[#2A2A28]"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setOutput([]); setProblems([]); setLastResult(null); }}
                      title="Clear output"
                      className="text-[11px] text-[#525252] hover:text-[#262626] whitespace-nowrap shrink-0"
                    >
                      ⌫ Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => setPanelPos(panelPos === "right" ? "bottom" : "right")}
                      title={panelPos === "right" ? "Move panel to the bottom" : "Move panel to the right"}
                      aria-label={panelPos === "right" ? "Move panel to the bottom" : "Move panel to the right"}
                      className="ml-1 w-7 h-6 flex items-center justify-center rounded-md text-[#6B6B66] hover:text-[#171717] hover:bg-[#F1F1EF]"
                    >
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
                        <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
                        {panelPos === "right" ? <path d="M1.5 9.5h13" /> : <path d="M9.5 2.5v11" />}
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPanelOpen(false)}
                      title="Hide panel (Ctrl/Cmd+T)"
                      aria-label="Hide panel"
                      className="ml-2 w-6 h-6 flex items-center justify-center rounded-md text-[14px] leading-none text-[#525252] hover:text-[#171717] hover:bg-[#F1F1EF]"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 pb-2 text-[12px] space-y-1" style={monoFont}>
                  {panelTab === "terminal" ? (
                    <>
                      {output.length === 0 && (
                        <div className="text-[#737373]">Compile (Ctrl/Cmd+C) or Run (Ctrl/Cmd+R) — output appears here.</div>
                      )}
                      {output.map((entry, i) => (
                        <div
                          key={i}
                          className={`flex gap-2 rounded-md px-2 py-0.5 ${entry.type === "output" ? "bg-[#E3F1E7]" : entry.type === "error" ? "bg-[#FBE4E6]" : ""}`}
                          style={{ lineHeight: "18px" }}
                        >
                          <span className="text-[#A3A39C] shrink-0">{entry.time}</span>
                          {entry.type === "action" && <span className="text-[#1D5FB4]">$ {entry.text}</span>}
                          {entry.type === "output" && <span className="text-[#1E6B3A] whitespace-pre-wrap">✔ {entry.text}</span>}
                          {entry.type === "error" && <span className="text-[#B42334] whitespace-pre-wrap">✖ {entry.text}</span>}
                        </div>
                      ))}
                      {busy && <div className="text-[#2563EB] animate-pulse">…</div>}
                    </>
                  ) : problems.length === 0 ? (
                    <div className="text-[#737373]">No problems have been detected in the script.</div>
                  ) : (
                    problems.map((p, i) => (
                      <div key={i} className="flex items-start gap-2" style={{ lineHeight: "18px" }}>
                        <span className="text-[#D94452]">✖</span>
                        <span className="text-[#2A2A28]">{p.message}</span>
                        <span className="text-[#737373]">{activeFile} [Ln {p.line}]</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              )}
              </div>
              </div>
            </div>
          </div>

          <input ref={uploadRef} type="file" multiple accept=".vs,.txt,text/plain" className="hidden" onChange={onUploadPicked} />

          {flash && (() => {
            const tone = { ok: ["#E6F4EA", "#1E7B3A"], error: ["#FCE8EA", "#C0303D"], info: ["#ECECE9", "#55554F"] }[flash.kind];
            const dur = (flash.kind === "error" ? TOAST_MS + 1800 : TOAST_MS) / 1000;
            return (
              <div
                key={flash.id}
                role={flash.kind === "error" ? "alert" : "status"}
                aria-live="polite"
                className="absolute right-4 bottom-11 z-30 w-[300px] max-w-[calc(100%-32px)] overflow-hidden rounded-2xl bg-white border border-[#E4E4E0] shadow-[0_10px_30px_rgba(0,0,0,.14),0_2px_6px_rgba(0,0,0,.05)]"
                style={{ animation: flash.leaving ? "toastOut .18s ease-in forwards" : "toastIn .32s cubic-bezier(.2,.9,.3,1.15)" }}
              >
                <div className="flex items-start gap-3 pl-3 pr-2 py-3">
                  <span className="mt-px w-6 h-6 shrink-0 rounded-full flex items-center justify-center" style={{ background: tone[0], color: tone[1] }} aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      {flash.kind === "ok" ? <path d="m5 12.5 4.5 4.5L19 7.5" /> : flash.kind === "error" ? <path d="M12 6.5v7M12 17.5v.01" /> : <path d="M12 11v6M12 7.5v.01" />}
                    </svg>
                  </span>
                  <div className="flex-1 min-w-0 pt-0.5 text-[13px] leading-[18px] text-[#2A2A28] break-words">{flash.text}</div>
                  <button type="button" onClick={dismissToast} aria-label="Dismiss" className="w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-[#9A9A94] hover:text-[#2A2A28] hover:bg-[#F1F1EF] bg-transparent border-0 cursor-pointer">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                </div>
                <div className="h-[2px] bg-[#F1F1EF]"><div className="h-full origin-left" style={{ background: tone[1], opacity: 0.55, animation: `toastBar ${dur}s linear forwards` }} /></div>
              </div>
            );
          })()}

          {confirmDelete && (
            <div className="absolute inset-0 z-40 flex items-start justify-center pt-24 bg-black/20" onClick={() => setConfirmDelete(null)}>
              <div
                role="alertdialog"
                aria-labelledby="del-title"
                className="w-[420px] max-w-[92%] rounded-2xl bg-white border border-[#E4E4E0] shadow-[0_12px_40px_rgba(0,0,0,.22)] p-5"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.key === "Escape" && setConfirmDelete(null)}
              >
                <div id="del-title" className="text-[14px] font-semibold text-[#333] mb-1.5">Delete {confirmDelete.kind === "folder" ? "folder " : ""}“{confirmDelete.name}”?</div>
                <p className="text-[13px] text-[#525252] mb-4">{confirmDelete.kind === "folder" ? `This removes the folder and the ${fs.names.filter((n) => n.startsWith(confirmDelete.name + "/")).length} file(s) inside it from this browser. You can’t undo it.` : "This removes the file from this browser. You can’t undo it."}</p>
                <div className="flex justify-end gap-2">
                  <button type="button" autoFocus onClick={() => setConfirmDelete(null)} className="h-8 px-4 rounded-lg text-[13px] border border-[#DADAD6] hover:bg-[#F5F5F3]">Cancel</button>
                  <button type="button" onClick={doDelete} className="h-8 px-4 rounded-lg text-[13px] text-white bg-[#D94452] hover:bg-[#B93544]">Delete</button>
                </div>
              </div>
            </div>
          )}

          {/* status bar */}
          <div
            className="flex items-center justify-between h-7 px-4 text-[12px] text-[#85857F] shrink-0 select-none"
          >
            <div className="flex items-center gap-4">
              {standalone ? (
                <button type="button" onClick={toggleMode} disabled={loading || toggling} title={isManual ? "Manual: click to hand control back to the brain" : "Autonomous: click to switch to Manual so scripts can run"} className={`${isManual ? "" : "text-[#B45309] font-medium"} hover:text-[#2A2A28] bg-transparent border-0 p-0 cursor-pointer`}>{loading ? "…" : isManual ? "⎇ MANUAL" : "⎇ AUTONOMOUS"}</button>
              ) : (
                <span className={isManual ? "" : "text-[#B45309] font-medium"}>{loading ? "…" : isManual ? "⎇ MANUAL" : "⎇ AUTONOMOUS"}</span>
              )}
              <button type="button" onClick={() => { setPanelTab("problems"); setPanelOpen(true); }} title="Show problems" className="hover:bg-white px-1 rounded">
                {problems.length ? `✖ ${problems.length}` : lastResult === "ok" ? "✔ OK" : "✔ 0"}
              </button>
              {!isManual && <span className="opacity-90">Run needs Manual mode</span>}
            </div>
            <div className="flex items-center gap-4">
              <span title={fs.saveError ? "This browser blocked saving. Your work is kept only until you leave." : "Files are saved in this browser"}>
                {fs.saveError ? "⚠ Not saved" : fs.savedAt ? "✔ Saved" : "…"}
              </span>
              {activeFile && <span>Ln {cursor.ln}, Col {cursor.col}</span>}
              {activeFile && <span>{lineCount} {lineCount === 1 ? "line" : "lines"}</span>}
              <span>Spaces: 2</span>
              <span>Vision Script</span>
            </div>
          </div>
        </div>
      ) : (
        !compilerLoading && (
          <div className="rounded-xl border border-dashed border-vision-border/20 px-6 py-10 text-center text-sm text-vision-muted">
            The compiler is switched off. {standalone ? (<button type="button" onClick={() => toggleCompilerEnabled(true)} className="ml-1 underline bg-transparent border-0 p-0 cursor-pointer text-inherit">Turn it on</button>) : "Turn it on above"} to bring back the editor and terminal.
          </div>
        )
      )}
    </div>
  );
}