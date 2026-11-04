import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "./authStore";

/** Redirects unauthenticated users to /login. Never trusts client state for
 * actual authorization — every protected API call is independently checked server-side. */
export default function ProtectedRoute({ children }) {
  const { user, loading, initialized } = useAuthStore();
  const location = useLocation();

  if (loading || !initialized) return <div className="min-h-screen flex items-center justify-center text-vision-muted text-sm">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}
