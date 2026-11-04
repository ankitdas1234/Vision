import { useState } from "react";
import { servosApi } from "../api/servos";
import { useControlMode } from "../hooks/useControlMode";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import ControlModeBanner from "../components/common/ControlModeBanner";

// Each leg is ONE continuous-rotation servo (left = CH1, right = CH2). Speed
// is signed: forward / reverse / stop. There are no leg-joint servos.
function LegPanel({ side, channel, disabled }) {
  const [speed, setSpeed] = useState(60);
  return (
    <Card title={`${side} Leg`}>
      <p className="text-xs text-vision-muted mb-1">Rotation (CH{channel} — Continuous)</p>
      <div className="flex items-center gap-2 mb-2">
        <input type="range" min={0} max={100} value={speed} disabled={disabled} onChange={(e) => setSpeed(Number(e.target.value))} className="flex-1 disabled:opacity-40" />
        <span className="text-sm w-10">{speed}%</span>
      </div>
      <div className="flex gap-2">
        <Button disabled={disabled} onClick={() => servosApi.move(channel, { speed })}>Forward</Button>
        <Button disabled={disabled} variant="ghost" onClick={() => servosApi.move(channel, { speed: -speed })}>Reverse</Button>
        <Button variant="ghost" onClick={() => servosApi.stop(channel)}>Stop</Button>
      </div>
    </Card>
  );
}

export default function LegControl() {
  const { mode, isManual } = useControlMode();
  return (
    <div>
      <ControlModeBanner mode={mode} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <LegPanel side="Left" channel={1} disabled={!isManual} />
        <LegPanel side="Right" channel={2} disabled={!isManual} />
      </div>
    </div>
  );
}
