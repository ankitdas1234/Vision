import { useSocketEvent } from "../hooks/useSocket";
import Card from "../components/common/Card";
import EmptyState from "../components/common/EmptyState";

export default function Logs() {
  const log = useSocketEvent("system:log");
  return (
    <Card title="System Logs">
      {log ? <pre className="text-xs text-vision-muted whitespace-pre-wrap">{JSON.stringify(log, null, 2)}</pre> : <EmptyState message="No log events yet." />}
    </Card>
  );
}
