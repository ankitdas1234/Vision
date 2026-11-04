import { useEffect, useState } from "react";
import { reactionsApi } from "../api/reactions";
import Card from "../components/common/Card";
import EmptyState from "../components/common/EmptyState";

export default function Reactions() {
  const [reactions, setReactions] = useState([]);
  useEffect(() => { reactionsApi.list().then(setReactions).catch(() => setReactions([])); }, []);
  return (
    <Card title="Reactions">
      {reactions.length === 0 ? <EmptyState message="No reactions recorded yet." /> : (
        <ul className="text-sm space-y-2">
          {reactions.map((r) => (
            <li key={r.id} className="flex justify-between border-b border-vision-border/5 pb-2">
              <span>{r.state}</span>
              <span className="text-vision-muted text-xs">{r.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
