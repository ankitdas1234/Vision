import { Link } from "react-router-dom";

/**
 * Top-bar status: ONE quiet white capsule holding several sections separated by thin lines.
 * Each section is plain text with a small animated icon (only the icon carries colour; problems also turn the text red).
 * Light mode only. On narrow screens only the icons show (label stays as hover hint / for screen readers).
 */
const ICON_COLOR = { ok: "#22A55B", warn: "#E8930C", danger: "#DC3B3B", info: "#7C5CF0", neutral: "#A3A19B" };

export function PillGroup({ children }) {
  return (
    <div className="inline-flex items-stretch h-9 rounded-full bg-white border border-black/[.07] shadow-[0_1px_2px_rgba(0,0,0,.04)] overflow-hidden">
      {children}
    </div>
  );
}

export function Seg({ tone = "neutral", icon: Icon, anim = "", children, title, to }) {
  const cls =
    "inline-flex items-center gap-2 px-3 md:px-4 text-[13px] font-medium whitespace-nowrap no-underline border-l border-black/[.07] first:border-l-0 transition-colors " +
    (tone === "danger" ? "text-[#B42318]" : "text-[#2B2A28]") +
    (to ? " hover:bg-black/[.035] focus-visible:outline-none focus-visible:bg-black/[.06]" : "");
  const inner = (
    <>
      <span aria-hidden="true" className={`inline-flex shrink-0 ${anim}`} style={{ color: ICON_COLOR[tone] || ICON_COLOR.neutral }}>
        {Icon ? <Icon size={16} strokeWidth={2.1} /> : null}
      </span>
      <span className="hidden md:inline">{children}</span>
    </>
  );
  const label = typeof children === "string" ? children : undefined;
  return to ? (
    <Link to={to} title={title} aria-label={label ? `${label}. ${title ?? ""}` : title} className={cls}>{inner}</Link>
  ) : (
    <span title={title} aria-label={label} className={cls}>{inner}</span>
  );
}

const TILE = {
  ok:      { bg: "#E7F5EC", fg: "#1B8F4C" },
  warn:    { bg: "#FDF1D8", fg: "#B26A05" },
  danger:  { bg: "#FCE8E8", fg: "#D13438" },
  info:    { bg: "#EFEAFD", fg: "#6B4FE0" },
  neutral: { bg: "#EDECEA", fg: "#6B6A66" },
};

/** Top-bar status card: a tinted icon tile, a bold title and a small second line. Optional link. */
export function StatusCard({ tone = "neutral", icon: Icon, anim = "", title, sub, hint, to }) {
  const c = TILE[tone] || TILE.neutral;
  const cls =
    "inline-flex items-center gap-2.5 h-11 pl-1.5 pr-3.5 rounded-[14px] bg-white border border-black/[.07] shadow-[0_1px_2px_rgba(0,0,0,.04)] no-underline text-left " +
    (to ? "transition-colors hover:bg-[#FBFAF9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15" : "");
  const inner = (
    <>
      <span aria-hidden="true" className="w-8 h-8 rounded-[10px] grid place-items-center shrink-0" style={{ background: c.bg, color: c.fg }}>
        <span className={`inline-flex ${anim}`}>{Icon ? <Icon size={17} strokeWidth={2.1} /> : null}</span>
      </span>
      <span className="hidden md:block leading-tight">
        <span className="block text-[13px] font-semibold text-[#121212] whitespace-nowrap">{title}</span>
        {sub ? <span className="block text-[11.5px] text-[#6B6A66] whitespace-nowrap mt-px">{sub}</span> : null}
      </span>
    </>
  );
  const aria = `${title}${sub ? ". " + sub : ""}`;
  return to ? (
    <Link to={to} title={hint ?? aria} aria-label={aria} className={cls}>{inner}</Link>
  ) : (
    <span title={hint ?? aria} aria-label={aria} className={cls}>{inner}</span>
  );
}

/** Small round icon button (used for the simulator view link). */
export function IconButton({ icon: Icon, anim = "", tone = "info", to, title }) {
  const c = TILE[tone] || TILE.neutral;
  return (
    <Link to={to} title={title} aria-label={title} className="w-11 h-11 rounded-full grid place-items-center bg-white border border-black/[.07] shadow-[0_1px_2px_rgba(0,0,0,.04)] hover:bg-[#FBFAF9] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15" style={{ color: c.fg }}>
      <span className={`inline-flex ${anim}`}><Icon size={18} strokeWidth={2.1} /></span>
    </Link>
  );
}
