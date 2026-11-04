import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { peopleApi } from "../api/people";
import Card from "../components/common/Card";
import Badge from "../components/common/Badge";
import Avatar from "../components/common/Avatar";
import EmptyState from "../components/common/EmptyState";

export default function People() {
  const [people, setPeople] = useState([]);
  useEffect(() => { peopleApi.list().then(setPeople).catch(() => {}); }, []);

  return (
    <Card title="People" className="x1">
      <p className="text-xs text-vision-muted mb-4">Everyone Vision has ever seen, whether or not they've talked to it. Click a name for their full profile photos, visit history, and every fact Vision has learned about them.</p>
      {people.length === 0 ? <EmptyState className="text-sm" message="No known people yet." /> : (
        <table className="w-full text-sm">
          <thead className="text-vision-muted text-left"><tr><th></th><th>Name</th><th>Category</th><th>Trust</th><th>Visits</th><th>Last Seen</th></tr></thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="border-t border-vision-border/5">
                <td className="py-2"><Avatar src={p.photoUrl} name={p.name} size="sm" /></td>
                <td>
                  <Link to={`/dashboard/people/${p.id}`} className="hover:text-vision-accent hover:underline">{p.name ?? "Unknown"}</Link>
                </td>
                <td><Badge tone={p.category === "ADMIN" ? "ok" : "neutral"}>{p.category}</Badge></td>
                <td>{p.trustScore}</td>
                <td className="text-vision-muted">{p.visitCount}</td>
                <td className="text-vision-muted">{p.lastSeen ? new Date(p.lastSeen).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
