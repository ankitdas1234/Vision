import { useId, useState } from "react";
import { FiEye, FiEyeOff } from "react-icons/fi";

export default function FloatingInput({
  label,
  value,
  onChange,
  type = "text",
  password = false,
  error,
  onBlur,
  onFocus,
  className = "",
  ...rest
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [show, setShow] = useState(false);

  // Label still floats when there is a value
  const active = focused || String(value ?? "").length > 0;

  // Ring only appears while focused (disappears on blur) — same as Forgot Password
  const ring = error
    ? "border-red-500 ring-1 ring-red-500"
    : focused
      ? "border-black ring-1 ring-black"
      : "border-gray-300 hover:border-gray-400";

  return (
    <div className={className}>
      <div className="relative h-12">
        <label
          htmlFor={id}
          className={`absolute left-4 pointer-events-none transition-all duration-200 ${
            active
              ? `top-1 text-xs ${error ? "text-red-600" : "text-black"}`
              : "top-3 text-base leading-6 text-gray-500"
          }`}
        >
          {label}
        </label>

        <input
          id={id}
          type={password ? (show ? "text" : "password") : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          aria-invalid={!!error}
          className={`w-full h-12 border rounded-lg bg-white text-[15px] text-gray-900 px-4 pt-5 pb-1 outline-none transition-all duration-200 ${
            password ? "pr-12" : ""
          } ${ring}`}
          {...rest}
        />

        {password && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            tabIndex={-1}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-0 top-0 h-12 w-12 flex items-center justify-center text-gray-400 hover:text-gray-700"
          >
            {show ? (
              <FiEyeOff className="w-[18px] h-[18px]" />
            ) : (
              <FiEye className="w-[18px] h-[18px]" />
            )}
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 mt-1 ml-1">{error}</p>
      )}
    </div>
  );
}
