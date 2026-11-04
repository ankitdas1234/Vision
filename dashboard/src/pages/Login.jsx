import { useState, useEffect } from "react";
import { Navigate, useNavigate, useLocation, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { authApi } from "../auth/authApi";
import { authStore, useAuthStore } from "../auth/authStore";
import { getRememberedLogin } from "../api/client";
import AuthLayout, { submitCls } from "../components/auth/AuthLayout";
import FloatingInput from "../components/auth/FloatingInput";
import PasswordField from "../components/auth/PasswordField";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const saved = getRememberedLogin();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, initialized } = useAuthStore();

  const [email, setEmail] = useState(location.state?.email || saved.email);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(saved.remember);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  useEffect(() => {
    document.title = "Log in - Vision";
  }, []);

  const target = location.state?.from?.pathname ?? "/dashboard";
  if (initialized && user) return <Navigate to={target} replace />;

  // Live email validation
  const emailError =
    emailTouched && email.length > 0 && !EMAIL_RE.test(email.trim())
      ? "Enter a valid email address"
      : null;

  const isFormValid =
    email.trim().length > 0 &&
    EMAIL_RE.test(email.trim()) &&
    password.length > 0;

  const submit = async (e) => {
    e.preventDefault();
    setEmailTouched(true);
    if (!isFormValid || submitting) return;

    setError(null);
    setSubmitting(true);

    try {
      const { user: u } = await authApi.login(email.trim(), password, remember);
      authStore.set({ user: u, loading: false, initialized: true });
      navigate(target, { replace: true });
    } catch (err) {
      setPassword("");
      setError(
        err.status
          ? err.message || "Invalid email or password"
          : "Can't reach the server. Check your connection and try again."
      );
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="to continue to Vision"
      switchTo="/register"
      switchLabel="Create an account"
      note='Vision keeps you signed in on this device only if you tick “Remember me”.'
    >
      {location.state?.registered && (
        <p
          role="status"
          className="mb-4 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2"
        >
          Account created. Sign in to continue.
        </p>
      )}

      <motion.form
        onSubmit={submit}
        className="space-y-4"
        noValidate
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <FloatingInput
          label="Email address"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoFocus={!email}
          value={email}
          onChange={(val) => {
            setEmail(val);
            if (!emailTouched) setEmailTouched(true); // start validating as soon as user types
          }}
          onBlur={() => setEmailTouched(true)}
          error={emailError}
        />

        <PasswordField
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          name="password"
          autoFocus={!!email}
          right={
            <Link
              to="/forgot-password"
              className="text-sm text-black font-medium hover:underline"
            >
              Forgot password?
            </Link>
          }
        />

        <label className="flex items-center gap-2 text-sm text-gray-600 select-none cursor-pointer">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 accent-black"
          />
          Remember me <span className="text-gray-400">· stay signed in for 30 days</span>
        </label>

        <AnimatePresence>
          {error && (
            <motion.p
              key={error}
              role="alert"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-sm text-red-600"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <motion.button
          whileTap={{ scale: isFormValid ? 0.97 : 1 }}
          type="submit"
          disabled={!isFormValid || submitting}
          className={submitCls(isFormValid && !submitting)}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </motion.button>
      </motion.form>
    </AuthLayout>
  );
}