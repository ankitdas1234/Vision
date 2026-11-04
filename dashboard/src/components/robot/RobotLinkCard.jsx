import { useRobotLink } from "../../hooks/useRobotLink";
import Card from "../common/Card";
import Badge from "../common/Badge";
import { modeBadge, transportBadge, detailRows } from "./robotLinkView";

const apiRoot = () => (import.meta.env.VITE_API_URL || "http://localhost:4000/api").replace(/\/api\/?$/, "");

/** The full picture of how the brain reaches the robot. Used on the Monitoring page. */
export default function RobotLinkCard() {
  const { link, error } = useRobotLink();
  const mode = modeBadge(link);
  const transport = transportBadge(link);
  return (
    <Card title="Robot connection">
      {error && !link ? (
        <p className="text-sm text-vision-danger">Can't reach the Vision server.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Badge tone={mode.tone}>{mode.label}</Badge>
            <Badge tone={transport.tone}>{transport.label}</Badge>
            {link?.mode === "simulation" && (
              <a className="text-xs underline text-vision-muted" target="_blank" rel="noreferrer" href={`${apiRoot()}/simulation/`}>
                open 3D simulation
              </a>
            )}
          </div>
          <p className="text-sm text-vision-text mb-3">{link?.summary ?? "Checking…"}</p>
          <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-1 text-xs">
            {detailRows(link).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-vision-muted">{k}</dt>
                <dd className="text-vision-text">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[10px] text-vision-muted mt-3">Refreshes every 2 s. Change the mode with ROBOT_MODE in server/.env (docs/simulation.md).</p>
        </>
      )}
    </Card>
  );
}
