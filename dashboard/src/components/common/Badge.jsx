const COLORS = {
  ok: " text-gray-500 ",
  warn: "text-gray-500",
  danger: " text-gray-500",
  neutral: "text-gray-500",
};

export default function Badge({ children, tone = "neutral" }) {
  return <span className={`badge ${COLORS[tone] || COLORS.neutral}`}>{children}</span>;
}
