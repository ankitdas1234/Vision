import { useEffect, useState } from "react";
import { commandsApi } from "../api/commands";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import EmptyState from "../components/common/EmptyState";

export default function Commands() {
  const [commands, setCommands] = useState([]);
  useEffect(() => { commandsApi.list().then(setCommands).catch(() => {}); }, []);

  return (
    <Card title="Command History">
      <Button variant="danger" onClick={() => commandsApi.emergencyStop()}>EMERGENCY STOP</Button>
      <div className="mt-4">
        {commands.length === 0 ? <EmptyState message="No commands issued yet." /> : (
          <table className="w-full text-sm">
            <thead className="text-vision-muted text-left"><tr><th>Type</th><th>Status</th><th>Source</th></tr></thead>
            <tbody>{commands.map((c) => (
              <tr key={c.id} className="border-t border-vision-border/5"><td className="py-2">{c.commandType}</td><td>{c.status}</td><td>{c.source}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
