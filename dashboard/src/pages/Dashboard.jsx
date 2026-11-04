import { Link } from "react-router-dom";
import { useRobot } from "../hooks/useRobot";
import { useRobotLink } from "../hooks/useRobotLink";
import { modeBadge, transportBadge } from "../components/robot/robotLinkView";
import { useTracking } from "../hooks/useTracking";
import { useBrain } from "../hooks/useBrain";
import { useSocketEvent } from "../hooks/useSocket";
import { useControlMode } from "../hooks/useControlMode";
import Card from "../components/common/Card";
import Badge from "../components/common/Badge";


export default function Dashboard() {
  const { capabilities } = useRobot();
  const { link } = useRobotLink();
  const tracking = useTracking();
  const { decision, mentalState } = useBrain();
  const ultrasonic = useSocketEvent("ultrasonic:update");
  const { mode } = useControlMode();

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-[#F9F8F7]">
      <Card title="Robot Status">
        <div className="flex flex-wrap gap-2">
          <Badge tone={modeBadge(link).tone}>{modeBadge(link).label}</Badge>
          <Badge tone={transportBadge(link).tone}>{transportBadge(link).label}</Badge>
        </div>
        <p className="text-xs text-vision-muted mt-2">{link?.summary ?? "Checking…"}</p>
        <p className="text-xs text-vision-muted mt-2">
          Camera: {capabilities?.features?.camera ? "OK" : "—"} · Servos: {capabilities?.servoCount ?? "—"} ·
          Audio: {capabilities?.features?.audio ? "OK" : "—"} · Ultrasonic: {capabilities?.features?.ultrasonic ? "OK" : "—"}
        </p>
      </Card>

      <Card title="Who's Driving">
        <Link to="/dashboard/compiler">
          <Badge tone={mode === "MANUAL" ? "ok" : "warn"}>{mode ?? "…"}</Badge>
        </Link>
        <p className="text-xs text-vision-muted mt-2">
          {mode === "MANUAL" ? "You have direct control. The brain is observing but not acting." : "The brain is driving autonomously (default). Switch to Manual on the Compiler page to take over."}
        </p>
      </Card>

      <Card title="Person Tracking">
        <Badge tone={tracking?.state === "TRACKING" ? "ok" : "neutral"}>{tracking?.state ?? "IDLE"}</Badge>
      </Card>

      <Card title="Ultrasonic / Obstacle">
        <Badge tone={ultrasonic?.status === "CLEAR" || ultrasonic?.status === "NEAR" ? "ok" : ultrasonic?.status ? "danger" : "neutral"}>
          {ultrasonic?.status ?? "…"}
        </Badge>
        <p className="text-xs text-vision-muted mt-2">{ultrasonic ? `${Math.round(ultrasonic.filteredDistanceMm)} mm` : "Waiting for a reading…"}</p>
      </Card>

      <Card title="Mental State">
        <p className="text-xs text-vision-muted">
          Mood: {mentalState?.mood ?? "—"} · Internal: {mentalState?.internalState ?? "—"} · Curiosity: {mentalState?.curiosity ?? "—"}
        </p>
        {mentalState?.explorationActive && <Badge tone="warn">EXPLORATION ACTIVE</Badge>}
      </Card>

      <Card title="Latest Decision" className="md:col-span-2">
        <p className="text-sm text-vision-text">{decision?.decision ?? "No recent decision"}</p>
        <p className="text-xs text-vision-muted">{decision?.reason}</p>
      </Card>

      <Card title="Latest Command">
        <p className="text-xs text-vision-muted">Streamed live via Socket.IO (command:completed)</p>
      </Card>
    </div>
  );
}
