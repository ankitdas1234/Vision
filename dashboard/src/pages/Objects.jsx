import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { objectsApi } from "../api/objects";
import Card from "../components/common/Card";
import EmptyState from "../components/common/EmptyState";

export default function Objects() {
  const [objects, setObjects] = useState([]);
  useEffect(() => { objectsApi.list().then(setObjects).catch(() => {}); }, []);
  return (
    <Card title="Objects" className="x1">
      {objects.length === 0 ? <EmptyState className="text-sm" message="No objects observed yet." /> : (
        <ul className="text-sm space-y-2">
          {objects.map((o) => (
            <li key={o.id} className="flex justify-between border-t border-vision-border/5 pt-2 first:border-t-0 first:pt-0">
              <Link to={`/dashboard/objects/${o.id}`} className="hover:text-vision-accent hover:underline">{o.name}</Link>
              <span className="text-vision-muted">{o.category}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
