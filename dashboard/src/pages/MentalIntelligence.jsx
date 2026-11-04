import { useBrain } from "../hooks/useBrain";
import Card from "../components/common/Card";

const BARS = ["energy", "curiosity", "friendliness", "alertness", "confidence"];

export default function MentalIntelligence() {
  const { mentalState } = useBrain();
  return (
    <Card title="Mental Intelligence">
      <p className="text-xs text-vision-muted mb-4">Software decision-state variables used for behavior selection — not a claim of consciousness.</p>
      <div className="space-y-3">
        {BARS.map((k) => (
          <div key={k}>
            <div className="flex justify-between text-xs text-vision-muted mb-1"><span className="capitalize">{k}</span><span>{mentalState?.[k] ?? 0}</span></div>
            <div className="h-2 bg-vision-hover/5 rounded-full overflow-hidden"><div className="h-full bg-vision-accent" style={{ width: `${mentalState?.[k] ?? 0}%` }} /></div>
          </div>
        ))}
      </div>
      <p className="text-xs text-vision-muted mt-4">Intent: {mentalState?.intent ?? "IDLE"}</p>
    </Card>
  );
}
