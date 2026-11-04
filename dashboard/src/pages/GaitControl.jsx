import { gaitApi } from "../api/gait";
import { useControlMode } from "../hooks/useControlMode";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import ControlModeBanner from "../components/common/ControlModeBanner";

export default function GaitControl() {
  const { mode, isManual } = useControlMode();
  return (
    <Card title="Gait Control">
      <ControlModeBanner mode={mode} />
      <div className="grid grid-cols-2 gap-3 max-w-xs">
        <div />
        <Button disabled={!isManual} onClick={() => gaitApi.forward()}>Forward</Button>
        <div />
        <Button variant="ghost" disabled={!isManual} onClick={() => gaitApi.left()}>Turn Left</Button>
        <Button variant="danger" onClick={() => gaitApi.stop()}>Stop</Button>
        <Button variant="ghost" disabled={!isManual} onClick={() => gaitApi.right()}>Turn Right</Button>
        <div />
        <Button disabled={!isManual} onClick={() => gaitApi.backward()}>Backward</Button>
        <div />
      </div>
      <p className="text-xs text-vision-muted mt-3">Stop is never disabled — you can always halt movement regardless of mode.</p>
    </Card>
  );
}
