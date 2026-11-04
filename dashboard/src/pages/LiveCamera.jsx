import { useCamera } from "../hooks/useCamera";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import EmptyState from "../components/common/EmptyState";

export default function LiveCamera() {
  const { lastCapture, capture, startTracking, stopTracking } = useCamera();
  return (
    <Card title="Live Camera">
      <div className="flex gap-2 mb-4">
        <Button onClick={() => capture("")}>Capture</Button>
        <Button variant="ghost" onClick={() => startTracking()}>Start Tracking</Button>
        <Button variant="ghost" onClick={() => stopTracking()}>Stop Tracking</Button>
      </div>
      {lastCapture ? (
        <pre className="text-xs text-vision-muted">{JSON.stringify(lastCapture, null, 2)}</pre>
      ) : (
        <EmptyState message="No capture yet. Click Capture to request one from the robot." />
      )}
    </Card>
  );
}
