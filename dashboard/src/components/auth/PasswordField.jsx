import FloatingInput from "./FloatingInput";

export default function PasswordField({
  label = "Password",
  value,
  onChange,
  autoComplete,
  error,
  right,
  ...rest
}) {
  return (
    <div>
      <FloatingInput
        password
        label={label}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        error={error}
        {...rest}
      />
      {right && <div className="mt-2 text-right">{right}</div>}
    </div>
  );
}
