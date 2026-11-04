import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { objectsApi } from "../api/objects";
import Card from "../components/common/Card";
import Badge from "../components/common/Badge";
import EmptyState from "../components/common/EmptyState";

export default function ObjectProfile() {
  const { id } = useParams();
  const [object, setObject] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { objectsApi.get(id).then(setObject).catch((e) => setError(e.message)); }, [id]);

  if (error) return <Card title="Object"><p className="text-xs text-vision-danger">{error}</p></Card>;
  if (!object) return <Card title="Object"><EmptyState message="Loading…" /></Card>;

  return (
    <div className="space-y-4">
      <Link to="/dashboard/objects" className="text-xs text-vision-muted hover:text-vision-text">&larr; Back to Objects</Link>

      <Card>
        <div className="flex items-start gap-5">
          {object.photoUrl ? (
            <img src={object.photoUrl} alt={object.name} className="w-24 h-24 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-24 h-24 rounded-lg bg-vision-hover/5 shrink-0 flex items-center justify-center text-xs text-vision-muted text-center px-2">No photo yet</div>
          )}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold text-vision-text">{object.name}</h2>
              {object.category && <Badge tone="neutral">{object.category}</Badge>}
            </div>
            {object.description && <p className="text-sm text-vision-muted mb-2">{object.description}</p>}
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><div className="text-xs text-vision-muted">Times observed</div><div>{object.observationCount}</div></div>
              <div><div className="text-xs text-vision-muted">First seen</div><div>{object.firstSeen ? new Date(object.firstSeen).toLocaleDateString() : "—"}</div></div>
              <div><div className="text-xs text-vision-muted">Last seen</div><div>{object.lastSeen ? new Date(object.lastSeen).toLocaleDateString() : "—"}</div></div>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Recognized features">
        <p className="text-xs text-vision-muted mb-2">Structured attributes Vision extracted the times it looked closely at this object.</p>
        {object.features.length === 0 ? <EmptyState message="No structured features recorded." /> : (
          <div className="grid grid-cols-2 gap-3">
            {object.features.map((f) => (
              <div key={f.id} className="text-sm bg-vision-hover/5 rounded-lg p-3">
                <div><span className="text-vision-muted">Shape:</span> {f.shape ?? "—"}</div>
                <div><span className="text-vision-muted">Colour:</span> {f.primaryColour ?? "—"}{f.secondaryColour ? ` / ${f.secondaryColour}` : ""}</div>
                <div><span className="text-vision-muted">Size:</span> {f.estimatedSize ?? "—"}</div>
                <div><span className="text-vision-muted">Texture:</span> {f.texture ?? "—"}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="How this was generated — conceptual memory">
        <p className="text-xs text-vision-muted mb-2">Each entry is an AI-generated identification, with its own confidence — this is Vision's honest "how sure was I" trail, not a single fixed label.</p>
        {object.conceptualMemories.length === 0 ? <EmptyState message="No conceptual-memory entries yet." /> : (
          <ul className="space-y-2">
            {object.conceptualMemories.map((c) => (
              <li key={c.id} className="text-sm flex items-center justify-between border-t border-vision-border/5 pt-2 first:border-t-0 first:pt-0">
                <span>{c.conceptName}{c.description ? ` — ${c.description}` : ""}</span>
                <span className="text-xs text-vision-muted">{Math.round((c.confidence ?? 0) * 100)}% confidence · {new Date(c.createdAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Observation history">
        {object.observations.length === 0 ? <EmptyState message="No observations recorded." /> : (
          <ul className="space-y-3">
            {object.observations.map((o) => (
              <li key={o.id} className="flex gap-3 border-t border-vision-border/5 pt-3 first:border-t-0 first:pt-0">
                {o.photoUrl ? (
                  <img src={o.photoUrl} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-vision-hover/5 shrink-0" />
                )}
                <div>
                  <div className="text-sm">{o.description || "Observed"}</div>
                  <div className="text-xs text-vision-muted">{new Date(o.createdAt).toLocaleString()} · source: {o.source ?? "unknown"}{o.confidence != null ? ` · ${Math.round(o.confidence * 100)}% confidence` : ""}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
