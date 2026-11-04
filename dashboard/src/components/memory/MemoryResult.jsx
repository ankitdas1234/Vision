const LAYER = { STATIC: "Static memory", DYNAMIC: "Dynamic memory", CONCEPTUAL: "Conceptual memory", AI: "AI" };
const OUTCOME = {
  hit: ["FOUND", "text-emerald-600"],
  miss: ["not here", "text-vision-muted"],
  skipped: ["skipped", "text-vision-muted opacity-60"],
};

/** Renders a /memory/search result. Memory only: either "Not found", or what was found and by which means. */
export default function MemoryResult({ result }) {
  if (!result) return null;
  const trace = (Array.isArray(result.trace) ? result.trace : []).filter((t) => t.layer !== "AI");
  const matches = Array.isArray(result.matches) ? result.matches : [];
  const found = result.found === true;
  const data = result.data;
  const answer = !found ? "" :
    Array.isArray(data) ? data.map((r) => `${r.title}: ${r.content}`).join("\n") :
    data?.best ? `Looks like "${data.best.candidateName}" (similarity ${Number(data.best.totalScore).toFixed(2)})` : "";

  return (
    <div className="text-sm space-y-3 text-vision-text">
      {found ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
          <p className="text-xs font-bold tracking-wide text-emerald-600">FOUND IN MEMORY</p>
          <p className="text-xs mt-1">Found by: <b>{result.foundBy || LAYER[result.source]}</b></p>
          {result.basis && <p className="text-xs text-vision-muted mt-1">{result.basis}</p>}
          <div className="whitespace-pre-wrap mt-2">{answer || "—"}</div>
        </div>
      ) : (
        <div className="rounded-lg border border-vision-border bg-vision-hover/5 px-3 py-2">
          <p className="text-xs font-bold tracking-wide">NOT FOUND</p>
          <p className="text-xs text-vision-muted mt-1">{result.basis || "Nothing in memory matches this."}</p>
        </div>
      )}
      {matches.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1">{found ? "Matched facts" : "Mentioned but not counted"}</p>
          <ul className="space-y-1">
            {matches.map((m) => (
              <li key={m.layer + m.id} className="text-xs bg-vision-hover/5 rounded-lg px-3 py-1.5">
                <b>{m.title}</b> <span className="text-vision-muted">· {LAYER[m.layer] ?? m.layer}{m.status ? ` · ${m.status.toLowerCase().replace(/_/g, " ")}` : ""} · found in {m.matchedIn.join(" + ")}</span>
                <div className="text-vision-muted italic">{m.snippet}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ol className="space-y-1">
        {trace.map((t, i) => (
          <li key={i} className="flex gap-2 items-baseline">
            <span className="font-medium w-36">{LAYER[t.layer] ?? t.layer}</span>
            <span className={`text-xs font-semibold w-16 ${OUTCOME[t.outcome]?.[1]}`}>{OUTCOME[t.outcome]?.[0] ?? t.outcome}</span>
            <span className="text-xs text-vision-muted">{t.note}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
