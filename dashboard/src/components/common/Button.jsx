export default function Button({ children, onClick, variant = "primary", disabled, ...rest }) {
  const styles = {
    primary: "bg-gray-200 text-black hover:opacity-90",
    danger: "bg-vision-danger text-vision-text hover:opacity-90",
    ghost: "bg-vision-hover/5 text-vision-text hover:bg-vision-hover/10",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded-2xl text-sm font-medium transition disabled:opacity-40 ${styles[variant]}`}
      {...rest}
    >
      {children}
    </button>
  );
}
