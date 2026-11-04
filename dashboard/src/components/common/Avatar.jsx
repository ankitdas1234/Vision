const SIZES = { sm: "w-7 h-7 text-xs", md: "w-10 h-10 text-sm", lg: "w-24 h-24 text-2xl" };

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Shows a photo when one is available (a user's uploaded profile
 * picture, or a recognized person's best stored photo), and falls back
 * to initials on a neutral tile otherwise — never a broken image icon. */
export default function Avatar({ src, name, size = "md", className = "" }) {
  const dims = SIZES[size] || SIZES.md;
  return src ? (
    <img src={src} alt={name || "Avatar"} className={`${dims} rounded-full object-cover shrink-0 ${className}`} />
  ) : (
    <div className={`${dims} rounded-full bg-vision-accent/20 text-vision-accent flex items-center justify-center font-semibold shrink-0 ${className}`}>
      {initials(name)}
    </div>
  );
}
