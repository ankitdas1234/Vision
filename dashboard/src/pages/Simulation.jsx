import { useState } from "react";
import Card from "../components/common/Card";
import Badge from "../components/common/Badge";
import { useSimMode } from "../hooks/useSimMode";
import { simulatorUrl } from "../api/simulation";
import { hasRole, useAuthStore } from "../auth/authStore";

/** iOS-style switch, same look as the Compiler / Settings pages. */
function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className="relative w-[52px] h-[30px] rounded-full transition-colors duration-200 shrink-0 border-0 cursor-pointer p-0 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ backgroundColor: checked ? "#7c5cff" : "#d1d1d6" }}
    >
      <span
        className="absolute top-[3px] w-[24px] h-[24px] rounded-full bg-white transition-all duration-200 pointer-events-none"
        style={{ left: checked ? "25px" : "3px", boxShadow: "0 2px 6px rgba(0,0,0,.18)" }}
      />
    </button>
  );
}

const MODES = {
  compiler: {
    label: "Compiler",
    blurb: "Plays the script you compile on the Compiler page. Compile there and it loads here, ready for Play / Pause / Step / Reset; Run there plays it straight away.",
    points: ["Write and compile on the dashboard Compiler page — there is no editor in the simulator", "The server compiles it (same compiler, same safety limits), the 3D robot acts out the flat IR", "Speed, timeline, telemetry and the instruction stream on the right"],
  },
  autonomous: {
    label: "Autonomous",
    blurb: "The robot runs its own simulated mind: brain panel, hormones, drives, mood, memory, camera / mic / voice, and an arena to explore. The LLM only phrases speech — the mind chooses every action.",
    points: ["Brain, Mind, Stimuli and Event log panels", "Local mind works offline; AI mind phrases speech", "Isolated from the real robot and its command pipeline"],
  },
};

export default function Simulation() {
  const { user } = useAuthStore();
  const { mode, available, loading, error, setMode } = useSimMode();
  const [busy, setBusy] = useState(false);
  const canChange = hasRole(user, "TRUSTED");

  const choose = async (next) => {
    if (busy || next === mode) return;
    setBusy(true);
    try { await setMode(next); } catch { /* error is shown from the hook */ } finally { setBusy(false); }
  };

  if (loading) return <p className="text-sm text-vision-muted">Loading…</p>;

  if (!available) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold text-vision-text mb-2">Simulation</h1>
        <Card>
          <p className="text-sm text-vision-text mb-2">The simulator is only available when the server runs with <code>ROBOT_MODE=simulation</code>.</p>
          <p className="text-sm text-vision-muted">
            The server is currently driving the real robot (or can't be reached), so every simulation control is hidden and its endpoints
            refuse requests. Nothing on this page can affect the hardware either way.
          </p>
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        </Card>
      </div>
    );
  }

  const active = MODES[mode] ?? MODES.compiler;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-vision-text">Simulation</h1>
          <p className="text-sm text-vision-muted mt-1">Choose what the simulator shows. This only changes the simulation — never the real robot.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone="neutral">SIMULATION ONLY</Badge>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <span className={`text-sm font-medium ${mode === "compiler" ? "text-vision-text" : "text-vision-muted"}`}>Compiler</span>
          <Switch checked={mode === "autonomous"} onChange={(on) => choose(on ? "autonomous" : "compiler")} disabled={busy || !canChange} label="Autonomous mode" />
          <span className={`text-sm font-medium ${mode === "autonomous" ? "text-vision-text" : "text-vision-muted"}`}>Autonomous</span>
          <span className="text-xs text-vision-muted ml-auto">{canChange ? "Synced live with the simulator page" : "View only — TRUSTED role or higher can switch"}</span>
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Simulator">
          <p className="text-sm text-vision-muted mb-4">
            The simulation runs on its own page, separate from the dashboard. This page only controls it:
            choose the mode here, and compile or run scripts from the Compiler page.
          </p>
          <a
            href={simulatorUrl(mode)} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-vision-text text-white text-sm font-medium px-4 py-2.5 no-underline hover:opacity-90"
          >
            Open simulator ↗
          </a>
          <p className="text-xs text-vision-muted mt-4">
            Keep it open in another tab: it follows the mode you pick here and loads whatever you compile.
            Sign in on this dashboard first (the simulator shares the session) and use the same host, e.g. <code>localhost</code>.
          </p>
        </Card>
        <Card title={`${active.label} mode`}>
          <p className="text-sm text-vision-muted mb-3">{active.blurb}</p>
          <ul className="text-sm text-vision-text space-y-1.5 list-disc pl-5">
            {active.points.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </Card>
      </div>
    </div>
  );
}
