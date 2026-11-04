import { useEffect, useState } from "react";
import { decisionsApi } from "../api/decisions";
import Card from "../components/common/Card";
import EmptyState from "../components/common/EmptyState";

export default function Decisions() {
  const [decisions, setDecisions] = useState([]);
  useEffect(() => { decisionsApi.list().then(setDecisions).catch(() => setDecisions([])); }, []);
  return (
    <Card title="Decisions">
      {decisions.length === 0 ? <EmptyState message="No decisions recorded yet — run a brain observe cycle." /> : (
        <table className="w-full text-sm">
          <thead className="text-vision-muted text-left"><tr><th>Decision</th><th>Confidence</th><th>Reason</th><th>Safety</th></tr></thead>
          <tbody>{decisions.map((d) => (
            <tr key={d.id} className="border-t border-vision-border/5">
              <td className="py-2">{d.decision}</td>
              <td>{Math.round((d.confidence ?? 0) * 100)}%</td>
              <td className="text-vision-muted">{d.reason}</td>
              <td>{d.safetyApproved ? "✓" : "—"}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </Card>
  );
}
