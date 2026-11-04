import { useRobotLink } from "../../hooks/useRobotLink";
import Badge from "../common/Badge";
import { modeBadge, transportBadge } from "./robotLinkView";
import { Seg, StatusCard } from "../layout/StatusPill";
import { Bot, Cpu, Wifi, Unplug, Cable, ServerOff, Loader } from "lucide-react";

const MODE_ICON = { SIMULATION: [Bot, "tb-float"], HARDWARE: [Cpu, "tb-pulse"] };
const LINK_ICON = { "WebSocket live": [Wifi, "tb-blink"], "HTTP fallback": [Wifi, "tb-blink"], Simulator: [Cable, ""], "Not connected": [Unplug, "tb-shake"] };

/** Two badges for the top bar: which mode (SIMULATION / HARDWARE) and how the robot is connected right now. */
export default function RobotLinkBadges({ variant = "badge" }) {
  const { link, error } = useRobotLink();
  if (variant === "card") {
    if (error && !link) return <StatusCard tone="danger" icon={ServerOff} anim="tb-shake" title="Server offline" sub="Can't reach the server" />;
    const m = modeBadge(link);
    const t = transportBadge(link);
    const sim = link?.mode === "simulation";
    const modeWord = m.label === "…" ? "Checking" : sim ? "Simulation" : "Hardware";
    const hint = sim ? "ROBOT_MODE=simulation: a virtual robot inside the server" : "ROBOT_MODE=hardware: the real ESP32";
    if (m.label === "…") return <StatusCard tone="neutral" icon={Loader} anim="tb-spin-fast" title="Checking robot" sub="One moment" hint={hint} />;
    if (t.label === "Not connected") return <StatusCard tone="danger" icon={Unplug} anim="tb-shake" title="Robot not connected" sub={`${modeWord} · not connected`} hint={link?.summary || hint} />;
    const Icon = sim ? Bot : Wifi;
    return <StatusCard tone={sim ? "warn" : t.tone === "ok" ? "ok" : "warn"} icon={Icon} anim={sim ? "tb-float" : "tb-blink"} title={sim ? "Simulated robot" : "Robot connected"} sub={`${modeWord} · ${t.label.replace("WebSocket live", "live")}`} hint={link?.summary || hint} />;
  }
  if (variant === "pill") {
    if (error && !link) return <Seg tone="danger" icon={ServerOff} anim="tb-shake" title="Can't reach the Vision server">Server offline</Seg>;
    const m = modeBadge(link);
    const t = transportBadge(link);
    const nice = (x) => (x === "…" ? x : x.charAt(0) + x.slice(1).toLowerCase());
    return (
      <>
        <Seg tone={m.tone} icon={(MODE_ICON[m.label] ?? [Loader, "tb-spin-fast"])[0]} anim={(MODE_ICON[m.label] ?? [0, "tb-spin-fast"])[1]} title={link?.mode === "simulation" ? "ROBOT_MODE=simulation: a virtual robot inside the server" : "ROBOT_MODE=hardware: the real ESP32"}>{nice(m.label)}</Seg>
        <Seg tone={t.tone} icon={(LINK_ICON[t.label] ?? [Cable, ""])[0]} anim={(LINK_ICON[t.label] ?? [0, ""])[1]} title={link?.summary ?? ""}>{t.label}</Seg>
      </>
    );
  }
  if (error && !link) return <Badge tone="danger" title="Can't reach the Vision server">SERVER OFFLINE</Badge>;
  const mode = modeBadge(link);
  const transport = transportBadge(link);
  return (
    <>
      <span title={link?.mode === "simulation" ? "ROBOT_MODE=simulation: a virtual robot inside the server" : "ROBOT_MODE=hardware: the real ESP32"}>
        <Badge tone={mode.tone}>{mode.label}</Badge>
      </span>
      <span title={link?.summary ?? ""}>
        <Badge tone={transport.tone}>{transport.label}</Badge>
      </span>
    </>
  );
}
