import { useState } from "react";
import { servosApi } from "../api/servos";
import { useControlMode } from "../hooks/useControlMode";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import ControlModeBanner from "../components/common/ControlModeBanner";

// Head control (CH0): one servo that turns like a human head, 0-180 degrees,
// 90 = straight ahead. The camera and ultrasonic sensor ride on it, and the
// legs are separate servos, so looking never interrupts walking.
export default function EyeControl() {
  const { mode, isManual } = useControlMode();
  const [angle, setAngle] = useState(90);
  return (
    <Card title="Head Control (CH0 — 180° view)">
      <ControlModeBanner mode={mode} />
      <div className="flex items-center gap-4 mb-1">
        <span className="text-xs text-vision-muted w-10">Left</span>
        <input type="range" min={0} max={180} value={angle} disabled={!isManual} onChange={(e) => setAngle(Number(e.target.value))} className="flex-1 disabled:opacity-40" />
        <span className="text-xs text-vision-muted w-10 text-right">Right</span>
      </div>
      <p className="text-sm text-center mb-4">{angle}° {angle === 90 ? "(straight ahead)" : ""}</p>
      <div className="flex gap-2">
        <Button disabled={!isManual} onClick={() => servosApi.eyeMove({ angle })}>Turn Head</Button>
        <Button variant="ghost" onClick={() => { setAngle(90); servosApi.eyeCenter(); }}>Center</Button>
      </div>
    </Card>
  );
}
