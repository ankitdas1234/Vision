import { useRobot } from "../hooks/useRobot";
import Card from "../components/common/Card";
import RobotModeSwitch from "../components/robot/RobotModeSwitch";

export default function Robot() {
  const { health, capabilities } = useRobot();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="md:col-span-2 empty:hidden"><RobotModeSwitch /></div>
      <Card title="Health">
        <pre className="text-xs text-vision-muted whitespace-pre-wrap">{JSON.stringify(health, null, 2)}</pre>
      </Card>
      <Card title="Capabilities">
        <pre className="text-xs text-vision-muted whitespace-pre-wrap">{JSON.stringify(capabilities, null, 2)}</pre>
      </Card>
    </div>
  );
}
