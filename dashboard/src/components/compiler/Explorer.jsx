import { useEffect, useMemo, useRef, useState } from "react";
import { checkFolderName, checkName, dirOf, freshName, leafOf } from "./useScriptFiles";

const Ico = ({ d, size = 16, sw = 1.5, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d ? <path d={d} /> : children}
  </svg>
);
const FILE = "M14 3H7.5A1.5 1.5 0 0 0 6 4.5v15A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V7z";

export const FileIcon = (p) => <Ico {...p}><path d={FILE} /><path d="M14 3v4h4" /></Ico>;
/** file with a "+" badge */
export const NewFileIcon = (p) => <Ico {...p}><path d="M13 21H7.5A1.5 1.5 0 0 1 6 19.5v-15A1.5 1.5 0 0 1 7.5 3H13l5 5v3" /><path d="M13 3v5h5M18 15v6M15 18h6" /></Ico>;
/** folder with a "+" badge */
export const NewFolderIcon = (p) => <Ico {...p}><path d="M12 19H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.5.7L11 6h8a2 2 0 0 1 2 2v3" /><path d="M18 15v6M15 18h6" /></Ico>;
export const FolderIcon = (p) => <Ico {...p}><path d="M3 7a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.5.7L11 7h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" /></Ico>;
export const FolderOpenIcon = (p) => <Ico {...p}><path d="M4 19a2 2 0 0 1-1-1.7V6a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.5.7L11 6h7a2 2 0 0 1 2 2v2" /><path d="M4.2 19h13.4a2 2 0 0 0 1.9-1.4l1.6-5A1.5 1.5 0 0 0 19.7 11H8.2a2 2 0 0 0-1.9 1.4L4.2 19z" /></Ico>;
export const ChevronIcon = ({ open, size = 12 }) => <Ico size={size} sw={1.8}><path d={open ? "M6 9l6 6 6-6" : "M9 6l6 6-6 6"} /></Ico>;
export const RefreshIcon = (p) => <Ico {...p}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4.5V11h-6.5" /></Ico>;
export const CollapseAllIcon = (p) => <Ico {...p}><path d="M7 4h10a2 2 0 0 1 2 2v10M5 8h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8z" /><path d="M8.5 14h5" /></Ico>;
export const UploadIcon = (p) => <Ico {...p}><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></Ico>;
export const DownloadIcon = (p) => <Ico {...p}><path d="M12 4v12M7 11l5 5 5-5M5 20h14" /></Ico>;
export const TrashIcon = (p) => <Ico {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.2A1.5 1.5 0 0 0 8.5 20.5h7a1.5 1.5 0 0 0 1.5-1.3L18 7M9 7V4.5h6V7" /></Ico>;
export const RenameIcon = (p) => <Ico {...p}><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" /></Ico>;
export const CopyIcon = (p) => <Ico {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></Ico>;
export const CutIcon = (p) => <Ico {...p}><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M7.6 16 18 4M16.4 16 6 4" /></Ico>;
export const PasteIcon = (p) => <Ico {...p}><rect x="5" y="5" width="14" height="16" rx="2" /><path d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 12h6M9 16h4" /></Ico>;
export const LinkIcon = (p) => <Ico {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" /></Ico>;
export const OpenIcon = (p) => <Ico {...p}><path d={FILE} /><path d="M14 3v4h4M9 13h6M9 16.5h4" /></Ico>;
export const RestoreIcon = (p) => <Ico {...p}><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" /></Ico>;
/** compile: braces with a tick */
export const CompileIcon = (p) => <Ico {...p}><path d="M8.5 4C6.8 4 6 5 6 6.7v2.1c0 1.3-.7 2.5-2 3.2 1.3.7 2 1.9 2 3.2v2.1C6 19 6.8 20 8.5 20M15.5 4c1.7 0 2.5 1 2.5 2.7v2.1c0 1.3.7 2.5 2 3.2-1.3.7-2 1.9-2 3.2v2.1c0 1.7-.8 2.7-2.5 2.7" /><path d="m9.8 12.2 1.6 1.7 3-3.5" /></Ico>;
/** run: soft rounded play triangle */
export const RunIcon = ({ size = 16, sw = 1.5 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" fillOpacity=".14" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7.5 5.9v12.2a1 1 0 0 0 1.5.86l10.3-6.1a1 1 0 0 0 0-1.72L9 5.04a1 1 0 0 0-1.5.86z" />
  </svg>
);

/** A small icon button for the explorer header. */
function Tool({ title, onClick, children }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} className="w-7 h-7 flex items-center justify-center rounded-md text-[#8A8A84] transition-colors duration-150 hover:text-[#171717] hover:bg-white hover:shadow-[0_1px_2px_rgba(0,0,0,.06)] focus-visible:ring-1 focus-visible:ring-[#2A2A28]/30 outline-none">
      {children}
    </button>
  );
}

/** Text box used for new file, new folder and rename. Enter saves, Escape cancels, a bad name shows a red tip. */
function NameBox({ initial, validate, onSubmit, onCancel, folder, depth }) {
  const ref = useRef(null);
  const [val, setVal] = useState(initial);
  const [err, setErr] = useState(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = folder ? -1 : initial.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : initial.length); // select the name, not ".vs"
  }, [initial, folder]);

  const finish = (commit) => {
    if (done.current) return;
    if (!commit) { done.current = true; onCancel(); return; }
    const r = validate(val);
    if (r.error) { setErr(r.error); return; }
    done.current = true;
    onSubmit(val);
  };

  return (
    <div className="relative px-2">
      <div style={{ marginLeft: depth * 14 }} className={`flex items-center gap-1.5 pl-3 pr-2 h-[30px] rounded-lg border ${err ? "border-[#DC2626] bg-[#fff]" : "border-[#2A2A28] bg-white"}`}>
        {folder ? <FolderIcon size={14} /> : <FileIcon size={14} />}
        <input
          ref={ref}
          value={val}
          spellCheck={false}
          maxLength={80}
          aria-label={folder ? "Folder name" : "File name"}
          aria-invalid={!!err}
          onChange={(e) => { setVal(e.target.value); setErr(null); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); finish(true); }
            else if (e.key === "Escape") { e.preventDefault(); finish(false); }
            e.stopPropagation();
          }}
          onBlur={() => (val.trim() && !err ? finish(true) : finish(false))}
          className="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-[#000]"
        />
      </div>
      {err && (
        <div role="alert" className="absolute left-2 right-2 top-[26px] z-30 px-2 py-1 text-[12px] leading-4 text-[#7a1f1f] bg-[#ffeaea] border border-[#DC2626] rounded">
          {err}
        </div>
      )}
    </div>
  );
}

/**
 * VS Code-style Explorer for the script files: folders you can open and close, and a right-click
 * menu (new file, new folder, cut, copy, paste, copy path, rename, duplicate, delete, refresh...).
 * Light theme.
 */
export default function Explorer({
  names, folders = [], active, creating, setCreating,
  onOpen, onCreate, onCreateFolder, onRename, onRenameFolder, onRequestDelete, onDuplicate, onPaste,
  onDownload, onUpload, onRestore, onRefresh, onNote, onCollapse,
}) {
  const [renaming, setRenaming] = useState(null); // {path, kind}
  const [adding, setAdding] = useState(null); // {kind:"file"|"folder", dir}
  const [menu, setMenu] = useState(null); // {x, y, target: {path, kind} | null}
  const [open, setOpen] = useState(() => new Set());
  const [selDirRaw, setSelDir] = useState(""); // folder that "New file" goes into
  const selDir = folders.includes(selDirRaw) ? selDirRaw : ""; // a renamed or deleted folder falls back to the top level
  const [clip, setClip] = useState(null); // {path, kind, cut}
  const box = useRef(null);

  const taken = useMemo(() => [...names, ...folders], [names, folders]);

  // the "+" in the tab strip and the empty-state button ask for a new file through `creating`
  useEffect(() => {
    if (creating) { startAdd("file", selDir); setCreating(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creating]);

  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    const esc = (e) => e.key === "Escape" && setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", esc);
    window.addEventListener("blur", close);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", esc); window.removeEventListener("blur", close); };
  }, [menu]);

  // make sure the folder that holds the active file is open
  useEffect(() => {
    if (!active || !active.includes("/")) return;
    setOpen((o) => {
      const n = new Set(o);
      let d = dirOf(active);
      while (d) { n.add(d); d = dirOf(d); }
      return n.size === o.size ? o : n;
    });
  }, [active]);

  const startAdd = (kind, dir) => {
    setRenaming(null);
    if (dir) setOpen((o) => new Set(o).add(dir));
    setAdding({ kind, dir });
  };
  const toggle = (path) => setOpen((o) => { const n = new Set(o); n.has(path) ? n.delete(path) : n.add(path); return n; });

  // children of a folder: sub-folders first (A–Z), then files in the order they were made
  const childrenOf = (dir) => ({
    dirs: folders.filter((f) => dirOf(f) === dir).sort((a, b) => leafOf(a).localeCompare(leafOf(b))),
    files: names.filter((n) => dirOf(n) === dir),
  });
  const countInside = (path) => names.filter((n) => n.startsWith(path + "/")).length;

  const openMenu = (e, target) => {
    e.preventDefault();
    e.stopPropagation();
    const r = box.current.getBoundingClientRect();
    setMenu({ x: Math.max(4, Math.min(e.clientX - r.left, r.width - 196)), y: Math.max(4, Math.min(e.clientY - r.top, r.height - 40)), target });
    if (target?.kind === "folder") setSelDir(target.path);
    else if (target) setSelDir(dirOf(target.path));
  };

  const copyPath = async (path) => {
    try { await navigator.clipboard.writeText(path); onNote?.(`Copied path ${path}`); } catch { onNote?.("Couldn't copy the path"); }
  };
  const doPaste = (dir) => {
    if (!clip) return;
    const r = onPaste(clip.path, dir, clip.cut);
    if (r?.name && clip.cut) setClip(null);
    if (dir) setOpen((o) => new Set(o).add(dir));
  };

  const menuItems = (t) => {
    const dir = !t ? "" : t.kind === "folder" ? t.path : dirOf(t.path);
    const pasteOk = !!clip;
    const common = [
      ["New file", () => startAdd("file", dir), null, <NewFileIcon size={14} />],
      ["New folder", () => startAdd("folder", dir), null, <NewFolderIcon size={14} />],
    ];
    if (!t) {
      return [
        common,
        [["Paste", () => doPaste(""), null, <PasteIcon size={14} />, !pasteOk]],
        [["Upload a file", onUpload, null, <UploadIcon size={14} />], ["Refresh", onRefresh, null, <RefreshIcon size={14} />], ["Collapse all folders", () => setOpen(new Set()), null, <CollapseAllIcon size={14} />]],
      ];
    }
    const clipboard = [
      ["Cut", () => setClip({ path: t.path, kind: t.kind, cut: true }), null, <CutIcon size={14} />],
      ["Copy", () => setClip({ path: t.path, kind: t.kind, cut: false }), null, <CopyIcon size={14} />],
      ["Paste", () => doPaste(dir), null, <PasteIcon size={14} />, !pasteOk],
    ];
    const paths = [["Copy path", () => copyPath(t.path), null, <LinkIcon size={14} />]];
    if (t.kind === "file") paths.push(["Download", () => onDownload(t.path), null, <DownloadIcon size={14} />]);
    const edit = [
      ["Rename", () => { setRenaming(t); setAdding(null); }, "F2", <RenameIcon size={14} />],
      ["Duplicate", () => onDuplicate(t.path, t.kind), null, <CopyIcon size={14} />],
      ["Delete", () => onRequestDelete(t.path, t.kind), "Del", <TrashIcon size={14} />],
    ];
    const tail = [["Refresh", onRefresh, null, <RefreshIcon size={14} />]];
    if (t.kind === "file") return [[["Open", () => onOpen(t.path), null, <OpenIcon size={14} />]], common, clipboard, paths, edit, tail];
    return [common, clipboard, paths, edit, [...tail, ["Collapse all folders", () => setOpen(new Set()), null, <CollapseAllIcon size={14} />]]];
  };

  const renderAdd = (dir, depth) =>
    adding && adding.dir === dir ? (
      adding.kind === "file" ? (
        <NameBox
          key="add-file"
          depth={depth}
          initial={freshName(taken, "untitled", ".vs", dir)}
          validate={(v) => checkName(v, taken, undefined, dir)}
          onSubmit={(n) => { onCreate(n, dir); setAdding(null); }}
          onCancel={() => setAdding(null)}
        />
      ) : (
        <NameBox
          key="add-folder"
          folder
          depth={depth}
          initial={freshName(taken, "new-folder", "", dir)}
          validate={(v) => checkFolderName(v, taken, undefined, dir)}
          onSubmit={(n) => { onCreateFolder(n, dir); setAdding(null); }}
          onCancel={() => setAdding(null)}
        />
      )
    ) : null;

  const renderFile = (name, depth) =>
    renaming?.path === name ? (
      <NameBox
        key={name}
        depth={depth}
        initial={leafOf(name)}
        validate={(v) => checkName(v, taken, name, dirOf(name))}
        onSubmit={(n) => { onRename(name, n); setRenaming(null); }}
        onCancel={() => setRenaming(null)}
      />
    ) : (
      <div
        key={name}
        role="treeitem"
        tabIndex={0}
        onClick={() => { setSelDir(dirOf(name)); onOpen(name); }}
        onDoubleClick={() => setRenaming({ path: name, kind: "file" })}
        onContextMenu={(e) => openMenu(e, { path: name, kind: "file" })}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen(name);
          else if (e.key === "F2") { e.preventDefault(); setRenaming({ path: name, kind: "file" }); }
          else if (e.key === "Delete") { e.preventDefault(); onRequestDelete(name, "file"); }
        }}
        style={{ paddingLeft: 12 + depth * 14 }}
        className={`group flex items-center gap-2 mx-2 pr-1 h-[30px] rounded-lg text-[14px] cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[#2A2A28]/40 ${
          active === name ? "bg-[#E3E3E0] text-[#171717]" : "text-[#3A3A38] hover:bg-white"
        } ${clip?.cut && clip.path === name ? "opacity-50" : ""}`}
        title={`${name} — double-click or F2 to rename, right-click for more`}
      >
        <span className="w-3 shrink-0" />
        <span className="text-[#737373] shrink-0"><FileIcon size={14} /></span>
        <span className="truncate flex-1">{leafOf(name)}</span>
        <span className="hidden group-hover:flex items-center shrink-0">
          <button type="button" title="Rename" aria-label={`Rename ${name}`} onClick={(e) => { e.stopPropagation(); setRenaming({ path: name, kind: "file" }); }} className="w-5 h-5 flex items-center justify-center rounded hover:bg-white"><RenameIcon size={13} /></button>
          <button type="button" title="Delete" aria-label={`Delete ${name}`} onClick={(e) => { e.stopPropagation(); onRequestDelete(name, "file"); }} className="w-5 h-5 flex items-center justify-center rounded hover:bg-white"><TrashIcon size={13} /></button>
        </span>
      </div>
    );

  const renderDir = (dir, depth) => {
    const { dirs, files } = childrenOf(dir);
    return (
      <>
        {renderAdd(dir, depth)}
        {dirs.map((f) => {
          const isOpen = open.has(f);
          return renaming?.path === f ? (
            <NameBox
              key={f}
              folder
              depth={depth}
              initial={leafOf(f)}
              validate={(v) => checkFolderName(v, taken, f, dirOf(f))}
              onSubmit={(n) => { onRenameFolder(f, n); setRenaming(null); }}
              onCancel={() => setRenaming(null)}
            />
          ) : (
            <div key={f} role="group">
              <div
                role="treeitem"
                aria-expanded={isOpen}
                tabIndex={0}
                onClick={() => { toggle(f); setSelDir(f); }}
                onDoubleClick={(e) => { e.preventDefault(); }}
                onContextMenu={(e) => openMenu(e, { path: f, kind: "folder" })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(f); }
                  else if (e.key === "F2") { e.preventDefault(); setRenaming({ path: f, kind: "folder" }); }
                  else if (e.key === "Delete") { e.preventDefault(); onRequestDelete(f, "folder"); }
                }}
                style={{ paddingLeft: 12 + depth * 14 }}
                className={`group flex items-center gap-2 mx-2 pr-1 h-[30px] rounded-lg text-[14px] cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[#2A2A28]/40 text-[#3A3A38] hover:bg-white ${selDir === f ? "bg-[#EDEDEA]" : ""} ${clip?.cut && clip.path === f ? "opacity-50" : ""}`}
                title={`${f} — right-click for more`}
              >
                <span className="w-3 shrink-0 text-[#8A8A84] flex justify-center"><ChevronIcon open={isOpen} /></span>
                <span className="text-[#737373] shrink-0">{isOpen ? <FolderOpenIcon size={14} /> : <FolderIcon size={14} />}</span>
                <span className="truncate flex-1">{leafOf(f)}</span>
                <span className="hidden group-hover:flex items-center shrink-0">
                  <button type="button" title="New file here" aria-label={`New file in ${f}`} onClick={(e) => { e.stopPropagation(); startAdd("file", f); }} className="w-5 h-5 flex items-center justify-center rounded hover:bg-white"><NewFileIcon size={13} /></button>
                  <button type="button" title="Delete folder" aria-label={`Delete folder ${f}`} onClick={(e) => { e.stopPropagation(); onRequestDelete(f, "folder"); }} className="w-5 h-5 flex items-center justify-center rounded hover:bg-white"><TrashIcon size={13} /></button>
                </span>
              </div>
              {isOpen && (
                <>
                  {renderDir(f, depth + 1)}
                  {countInside(f) === 0 && childrenOf(f).dirs.length === 0 && !(adding && adding.dir === f) && (
                    <div style={{ paddingLeft: 12 + (depth + 1) * 14 + 20 }} className="mx-2 h-6 flex items-center text-[12px] text-[#A3A39C]">Empty folder</div>
                  )}
                </>
              )}
            </div>
          );
        })}
        {files.map((n) => renderFile(n, depth))}
      </>
    );
  };

  const groups = menu ? menuItems(menu.target) : [];

  return (
    <div ref={box} className="relative w-[224px] shrink-0 flex flex-col select-none">
      <div className="h-11 pl-3 pr-2 pt-1 flex items-center justify-between text-[13px] font-medium text-[#6B6B66]">
        <span>Files</span>
        <button type="button" onClick={onCollapse} title="Hide files" aria-label="Hide files" className="w-7 h-7 rounded-md text-[#8A8A84] text-[15px] leading-none transition-colors duration-150 hover:text-[#171717] hover:bg-white">«</button>
      </div>

      <div className="px-3 h-7 flex items-center justify-between">
        <span className="text-[12px] text-[#9A9A94] flex items-center gap-1">Scripts <span>({names.length})</span></span>
        <div className="flex items-center">
          <Tool title="New file" onClick={() => startAdd("file", selDir)}><NewFileIcon /></Tool>
          <Tool title="New folder" onClick={() => startAdd("folder", selDir)}><NewFolderIcon /></Tool>
          <Tool title="Refresh" onClick={onRefresh}><RefreshIcon /></Tool>
          <Tool title="Upload a .vs or .txt file" onClick={onUpload}><UploadIcon /></Tool>
          <Tool title="Put back the sample files" onClick={onRestore}><RestoreIcon /></Tool>
        </div>
      </div>

      <div
        role="tree"
        aria-label="Script files"
        className="flex-1 overflow-y-auto pb-2"
        onClick={(e) => { if (e.target === e.currentTarget) setSelDir(""); }}
        onContextMenu={(e) => { if (e.target === e.currentTarget) openMenu(e, null); }}
      >
        {names.length === 0 && folders.length === 0 && !adding && (
          <div className="px-5 py-4 text-[12px] leading-5 text-[#525252]">
            No files yet.
            <button type="button" onClick={() => startAdd("file", "")} className="mt-2 block w-full h-8 rounded-lg bg-white border border-[#DADAD6] text-[#2A2A28] text-[12px] hover:shadow-[0_1px_3px_rgba(0,0,0,.08)] transition">New file</button>
          </div>
        )}
        {renderDir("", 0)}
        {/* blank space under the list: right-click here for the folder-level menu */}
        <div className="h-10" onContextMenu={(e) => openMenu(e, null)} onClick={() => setSelDir("")} />
      </div>

      <div className="px-4 py-2 text-[11px] leading-4 text-[#9A9A94]">
        Saved in this browser. Files only go to the server when you Compile or Run.
      </div>

      {menu && (
        <div role="menu" aria-label="File actions" className="absolute z-40 w-[196px] py-1 rounded-xl bg-white border border-[#E4E4E0] shadow-[0_8px_24px_rgba(0,0,0,.14)] text-[13px] text-[#2A2A28] max-h-[calc(100%-8px)] overflow-y-auto" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
          {groups.map((g, gi) => (
            <div key={gi} className={gi ? "border-t border-[#ECECE9] mt-1 pt-1" : ""}>
              {g.map(([label, fn, key, icon, disabled]) => (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  disabled={!!disabled}
                  onClick={() => { setMenu(null); fn(); }}
                  className="w-[calc(100%-8px)] mx-1 rounded-md flex items-center gap-2 h-7 px-2 text-left hover:bg-[#EFEFED] disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-default"
                >
                  <span className="w-4 flex justify-center text-[#6B6B66]">{icon}</span>
                  <span className="flex-1">{label}</span>
                  {key && <span className="text-[11px] opacity-60">{key}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
