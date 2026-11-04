import Badge from "./Badge";

/** Shown at the top of any page with direct hardware controls. */
export default function ControlModeBanner({ mode }) {
  if (mode === null) return null;
  if (mode === "MANUAL") {
    return (
      <div className="flex items-center gap-2 mb-4">
        <Badge tone="ok">MANUAL MODE</Badge>
        <span className="text-xs text-vision-muted">You're in control. The brain is observing but won't act on its own.</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 mb-4">
      <Badge tone="warn">AUTONOMOUS MODE</Badge>
      <span className="text-xs text-vision-muted">The brain is driving. Enable Manual Mode on the Compiler page to take direct control.</span>
    </div>
  );
}
