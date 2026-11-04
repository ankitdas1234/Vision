import { Navigate } from "react-router-dom";
import { useAuthStore, hasRole } from "./authStore";

/** Gates a route on a minimum role. The server enforces the same rule independently on every API call. */
export default function RoleRoute({ minRole, children }) {
  const { user, loading, initialized } = useAuthStore();
  if (loading || !initialized) return null;
  if (!hasRole(user, minRole)) return <Navigate to="/unauthorized" replace />;
  return children;
}
