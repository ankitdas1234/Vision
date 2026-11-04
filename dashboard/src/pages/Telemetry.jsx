import { useSocketEvent } from "../hooks/useSocket";
import Card from "../components/common/Card";
import EmptyState from "../components/common/EmptyState";

export default function Telemetry() {
  const telemetry = useSocketEvent("telemetry:update");
  return (
    <Card title="Telemetry">
      {telemetry ? <pre className="text-xs text-vision-muted whitespace-pre-wrap">{JSON.stringify(telemetry, null, 2)}</pre> : <EmptyState message="Waiting for the next heartbeat…" />}
    </Card>
  );
}
