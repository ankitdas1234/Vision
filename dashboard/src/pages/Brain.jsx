import { useBrain } from "../hooks/useBrain";
import Card from "../components/common/Card";

const STAGES = ["IMAGE", "PERCEPTION", "STATIC MEMORY", "DYNAMIC MEMORY", "CONCEPTUAL MEMORY", "OPENROUTER", "MENTAL INTELLIGENCE", "DECISION", "REACTION", "COMMAND"];

export default function Brain() {
  const { decision, mentalState } = useBrain();
  const activeIdx = decision ? STAGES.indexOf("DECISION") : 0;

  return (
    <Card title="Brain Pipeline">
      <div className="flex flex-wrap gap-2 mb-4">
        {STAGES.map((s, i) => (
          <span key={s} className={`badge ${i <= activeIdx ? "bg-vision-accent/20 text-vision-accent" : "bg-vision-hover/5 text-vision-muted"}`}>{s}</span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 text-xs text-vision-muted">
        <div><div className="text-vision-muted mb-1">Decision</div><pre className="whitespace-pre-wrap">{JSON.stringify(decision, null, 2)}</pre></div>
        <div><div className="text-vision-muted mb-1">Mental State</div><pre className="whitespace-pre-wrap">{JSON.stringify(mentalState, null, 2)}</pre></div>
      </div>
    </Card>
  );
}
