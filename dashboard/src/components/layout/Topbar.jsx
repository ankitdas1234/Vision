import RobotLinkBadges from "../robot/RobotLinkBadges";
import { useControlMode } from "../../hooks/useControlMode";
import { useSimMode } from "../../hooks/useSimMode";
import { useLocation } from "react-router-dom";
import { Gamepad2, Brain, Cuboid, Loader } from "lucide-react";
import { PillGroup, Seg } from "./StatusPill";

const TITLES = {
  "": "Dashboard", monitoring: "Monitoring", robot: "Robot", camera: "Live Camera", tracking: "Person Tracking",
  audio: "Audio", ultrasonic: "Ultrasonic", memory: "Memory Lookup", brain: "Brain", mental: "Mental Intelligence",
  decisions: "Decisions", reactions: "Reactions", tasks: "Tasks", commands: "Commands", "control/eye": "Eye Control",
  "control/leg": "Leg Control", "control/gait": "Gait Control", telemetry: "Telemetry", logs: "Logs", safety: "Safety",
  simulation: "Simulation", compiler: "Compiler", people: "People", objects: "Objects", users: "Users", settings: "Settings",
};
function pageTitle(pathname) {
  const rest = pathname.replace(/^\/dashboard\/?/, "").replace(/\/$/, "");
  if (rest in TITLES) return TITLES[rest];
  const two = rest.split("/").slice(0, 2).join("/");
  return TITLES[two] ?? TITLES[rest.split("/")[0]] ?? "";
}

export default function Topbar() {
  const { mode } = useControlMode();
  const sim = useSimMode();
  const { pathname } = useLocation();
  const manual = mode === "MANUAL";
  const modeLabel = mode == null ? "…" : manual ? "Manual" : "Autonomous";

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-vision-border/5 bg-vision-panel/30 backdrop-blur-sm x1">
      <h1 className="text-[15px] font-semibold text-[#121212] m-0">{pageTitle(pathname)}</h1>

      <PillGroup>
        <Seg to="/dashboard/compiler" icon={mode == null ? Loader : manual ? Gamepad2 : Brain} anim={mode == null ? "tb-spin-fast" : manual ? "tb-wiggle" : "tb-pulse"} tone={mode == null ? "neutral" : manual ? "ok" : "warn"} title="Who is driving: you (Manual) or the brain (Autonomous). Change it on the Compiler page.">{modeLabel}</Seg>
        {sim.available && (
          <Seg to="/dashboard/simulation" icon={Cuboid} anim="tb-spin" tone="info" title="What the simulator shows. Change it on the Simulation page.">
            {`Sim · ${sim.mode === "autonomous" ? "Autonomous" : "Compiler"}`}
          </Seg>
        )}
        <RobotLinkBadges variant="pill" />
      </PillGroup>
    </header>
  );
}
