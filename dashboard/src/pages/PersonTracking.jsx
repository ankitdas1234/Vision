import { useTracking } from "../hooks/useTracking";
import Card from "../components/common/Card";
import Badge from "../components/common/Badge";

export default function PersonTracking() {
  const tracking = useTracking();
  return (
    <Card title="Person Tracking">
      <Badge tone={tracking?.state === "TRACKING" ? "ok" : "neutral"}>{tracking?.state ?? "IDLE"}</Badge>
      <div className="grid grid-cols-2 gap-4 mt-4 text-xs text-vision-muted">
        <div>Center X: {tracking?.centerX ?? "—"}</div>
        <div>Frame Center: {tracking?.frameCenterX ?? "—"}</div>
        <div>Tracking Error: {tracking?.error ?? "—"}</div>
        <div>Confidence: {tracking?.confidence ?? "—"}</div>
      </div>
    </Card>
  );
}
