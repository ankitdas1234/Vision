import { useState, useEffect, useMemo } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { authApi } from "../auth/authApi";
import { authStore, useAuthStore } from "../auth/authStore";
import AuthLayout, { submitCls } from "../components/auth/AuthLayout";
import FloatingInput from "../components/auth/FloatingInput";
import PasswordField from "../components/auth/PasswordField";
import FaceCapture from "../components/auth/FaceCapture";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function strength(pw) {
  let n = 0;
  if (pw.length >= 8) n++;
  if (pw.length >= 12) n++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) n++;
  if (/\d/.test(pw)) n++;
  if (/[^A-Za-z0-9]/.test(pw)) n++;
  const score = pw
    ? Math.max(1, Math.min(4, n - (pw.length < 8 ? 1 : 0)))
    : 0;
  return {
    score,
    label: ["", "Weak", "Okay", "Good", "Strong"][score],
    color: ["", "bg-red-400", "bg-amber-400", "bg-lime-500", "bg-emerald-500"][
      score
    ],
  };
}

export default function Register() {
  const navigate = useNavigate();
  const { user, initialized } = useAuthStore();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [image, setImage] = useState(null);
  const [touched, setTouched] = useState({});
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showFace, setShowFace] = useState(false);

  useEffect(() => {
    document.title = "Create account - Vision";
  }, []);

  const st = useMemo(() => strength(password), [password]);

  if (initialized && user && !message) {
    return <Navigate to="/dashboard" replace />;
  }

  const errs = {
    name: name.trim() ? null : "Enter your name",
    email: EMAIL_RE.test(email.trim()) ? null : "Enter a valid email address",
    password: password.length >= 8 ? null : "Use at least 8 characters",
    confirm: confirm && confirm === password ? null : "Passwords don't match",
  };

  const isFormValid = !Object.values(errs).some(Boolean);

  const touch = (k) => () => setTouched((t) => ({ ...t, [k]: true }));

  // Email shows error while typing, others only after blur
  const show = (k) => {
    if (k === "email") {
      return email.length > 0 ? errs.email : null;
    }
    return touched[k] ? errs[k] : null;
  };

  const submit = async (e) => {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true, confirm: true });
    if (!isFormValid || submitting) return;

    setError(null);
    setSubmitting(true);

    const mail = email.trim();

    try {
      const { linked, matchedExisting } = await authApi.register(
        name.trim(),
        mail,
        password,
        image
      );

      setMessage(
        matchedExisting
          ? "Welcome back, Vision already knew you!"
          : linked
            ? "Account created. Vision will recognise you."
            : "Account created. Signing you in…"
      );

      try {
        const { user: u } = await authApi.login(mail, password, true);
        setTimeout(() => {
          authStore.set({ user: u, loading: false, initialized: true });
          navigate("/dashboard", { replace: true });
        }, 900);
      } catch {
        setTimeout(() => {
          navigate("/login", {
            replace: true,
            state: { email: mail, registered: true },
          });
        }, 900);
      }
    } catch (err) {
      setError(
        err.status
          ? err.message || "Registration failed"
          : "Can't reach the server. Check your connection and try again."
      );
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create account"
      subtitle="Get your Vision account. You'll be signed in right away."
      switchTo="/login"
      switchLabel="Sign in instead"
      note="Your face photo is optional. It only lets Vision recognise you."
    >
      <motion.form
        onSubmit={submit}
        className="space-y-2.5"
        noValidate
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <FloatingInput
          label="Full name"
          name="name"
          autoComplete="name"
          value={name}
          onChange={setName}
          onBlur={touch("name")}
          error={show("name")}
        />

        <FloatingInput
          label="Email address"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          value={email}
          onChange={setEmail}
          onBlur={touch("email")}
          error={show("email")}
        />

        <div>
          <PasswordField
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            name="password"
            onBlur={touch("password")}
            error={show("password")}
          />

          {password && (
            <div className="mt-1.5 flex items-center gap-2" aria-live="polite">
              <div className="flex-1 grid grid-cols-4 gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className={`h-1 rounded-full transition-colors ${
                      i <= st.score ? st.color : "bg-gray-200"
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-gray-500 w-12 text-right">
                {st.label}
              </span>
            </div>
          )}
        </div>

        <PasswordField
          label="Confirm password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          name="confirm"
          onBlur={touch("confirm")}
          error={show("confirm")}
        />

        {showFace ? (
          <div className="max-h-56 overflow-y-auto">
            <FaceCapture onChange={setImage} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowFace(true)}
            className="text-sm font-medium text-gray-900 hover:underline"
          >
            + Add a face photo (optional)
          </button>
        )}

        <AnimatePresence>
          {(error || message) && (
            <motion.p
              key={error || message}
              role={error ? "alert" : "status"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`text-sm rounded-lg px-3 py-1.5 ${
                error
                  ? "text-red-600 bg-red-50"
                  : "text-emerald-700 bg-emerald-50"
              }`}
            >
              {error || message}
            </motion.p>
          )}
        </AnimatePresence>

        <motion.button
          whileTap={{ scale: isFormValid ? 0.97 : 1 }}
          type="submit"
          disabled={!isFormValid || submitting || !!message}
          className={submitCls(isFormValid && !submitting && !message)}
        >
          {submitting || message ? "Creating account…" : "Create account"}
        </motion.button>
      </motion.form>
    </AuthLayout>
  );
}