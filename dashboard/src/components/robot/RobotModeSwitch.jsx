import { useState } from "react";
import { Bot, Cpu } from "lucide-react";
import { robotsApi } from "../../api/robots";
import { useRobotLink } from "../../hooks/useRobotLink";
import { useAuthStore, hasRole } from "../../auth/authStore";

/** The robot-mode switch for the Robot page. The choice is made here (not in a settings file) and the server remembers it. */
export default function RobotModeSwitch() {
  const { link, error } = useRobotLink(2000);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [problem, setProblem] = useState("");
  const { user } = useAuthStore();
  const isAdmin = hasRole(user, "ADMIN"); // only admins see this card at all (the server enforces it too)
  const current = link?.mode ?? null;

  async function change(mode, confirmed = false) {
    setBusy(true); setProblem("");
    try {
      await robotsApi.setMode(mode, confirmed);
      setAsk(false);
    } catch (e) {
      const status = e?.status;
      const said = e?.message ? ` The server said: "${e.message}".` : "";
      setProblem(
        status === 403 ? `The server refused this (403).${said} `
        : status === 401 ? "You are signed out. Sign in again."
        : status === 404 || status === 405 ? "The server does not know this switch yet (it is running an older version). Update and restart the server."
        : status ? `The change failed (${status}).${said}`
        : "Could not reach the server. Is it running?"
      );
    } finally { setBusy(false); }
  }

  function pick(id) {
    if (busy || id === current) return;
    setProblem("");
    if (id === "hardware") setAsk(true);
    else { setAsk(false); change("simulation"); }
  }

  if (!isAdmin) return null;
  const real = current === "hardware";
  const shownReal = real || ask; // while waiting for your confirmation the knob already sits on "Real" (amber)
  const disabled = busy || !current;
  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-md font-semibold text-black">Real robot</h3>
          <p className="text-sm text-vision-muted mt-1">
            {error && !link ? "Can't reach the server." : current === "simulation" ? "Off: the brain and compiler drive the virtual robot inside the server. No ESP32 needed." : real ? "On: the brain and compiler drive the real ESP32." : "Checking…"}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm font-semibold select-none">
          <span className={shownReal ? "text-[#9A9893] font-medium" : "text-[#121212]"}>Virtual</span>
          <button type="button" role="switch" aria-checked={shownReal} aria-label="Real robot" disabled={disabled} onClick={() => (ask ? setAsk(false) : pick(real ? "simulation" : "hardware"))}
            title={real ? "Switch back to the virtual robot" : "Switch to the real robot"}
            className={`relative w-14 h-[30px] rounded-full transition-colors duration-200 shadow-[inset_0_0_0_1px_rgba(0,0,0,.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 disabled:cursor-wait disabled:opacity-70 ${real ? "bg-[#22A55B]" : ask ? "bg-[#E8930C]" : "bg-[#D9D7D2]"}`}>
            <span className="absolute top-[3px] left-[3px] w-6 h-6 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,.3)] grid place-items-center transition-transform duration-200" style={{ transform: shownReal ? "translateX(26px)" : "translateX(0)", color: real ? "#1B8F4C" : "#B26A05" }}>
              {shownReal ? <Cpu size={13} strokeWidth={2.4} /> : <Bot size={13} strokeWidth={2.4} />}
            </span>
          </button>
          <span className={shownReal ? "text-[#121212]" : "text-[#9A9893] font-medium"}>Real</span>
        </div>
      </div>

      {ask && (
        <div className="mt-4 rounded-xl border border-[#F1D9A8] bg-[#FDF6E7] p-4 text-sm text-[#7A4A06]">
          <p className="font-semibold">Switch to the real robot?</p>
          <p className="mt-1">The virtual robot will stop, and commands will go to the real ESP32. Make sure the robot is on a safe surface. The Esc key is still the emergency stop.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy} onClick={() => change("hardware", true)} className="h-9 px-4 rounded-lg bg-[#121212] text-white text-sm font-semibold disabled:opacity-60">{busy ? "Switching…" : "Yes, use the real robot"}</button>
            <button type="button" disabled={busy} onClick={() => setAsk(false)} className="h-9 px-4 rounded-lg bg-white border border-black/10 text-sm font-semibold">Cancel</button>
          </div>
        </div>
      )}
      {problem && <p className="mt-3 text-sm text-[#B42318]" role="alert">{problem}</p>}
      <p className="mt-3 text-xs text-vision-muted">Remembered by the server. On a host with a temporary disk it returns to the default after a redeploy.</p>
    </div>
  );
}
