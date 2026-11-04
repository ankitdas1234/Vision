import { useEffect, useState } from "react";
import { tasksApi } from "../api/tasks";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import EmptyState from "../components/common/EmptyState";

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const refresh = () => tasksApi.list().then(setTasks).catch(() => {});
  useEffect(() => { refresh(); }, []);

  return (
    <Card title="Tasks">
      {tasks.length === 0 ? <EmptyState message="No tasks yet." /> : (
        <table className="w-full text-sm">
          <thead className="text-vision-muted text-left"><tr><th>Type</th><th>Status</th><th>Priority</th><th></th></tr></thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="border-t border-vision-border/5">
                <td className="py-2">{t.taskType}</td><td>{t.status}</td><td>{t.priority}</td>
                <td><Button variant="ghost" onClick={() => tasksApi.cancel(t.id).then(refresh)}>Cancel</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
