import { useEffect } from "react";
import { authApi } from "./authApi";
import { authStore, useAuthStore } from "./authStore";
import { setStoredToken } from "../api/client";

/** Bootstraps auth state once on mount by asking the server "who am I?" */
export default function AuthProvider({ children }) {
  useAuthStore(); // subscribe so consumers re-render on store changes

  useEffect(() => {
    let cancelled = false;

    authApi
      .me()
      .then(({ user }) => {
        if (!cancelled) {
          authStore.set({ user, loading: false, initialized: true });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // Only a 401 means the session is really gone. A network blip or a 5xx while the
        // server restarts must NOT sign a remembered user out - keep the token and retry later.
        if (err?.status === 401) setStoredToken(null);
        authStore.set({ user: null, loading: false, initialized: true, offline: err?.status !== 401 });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return children;
}

export async function refreshAuth() {
  try {
    const { user } = await authApi.me();
    authStore.set({ user, loading: false, initialized: true });
    return user;
  } catch (err) {
    if (err?.status === 401) setStoredToken(null);
    authStore.set({ user: null, loading: false, initialized: true });
    return null;
  }
}

export async function logout() {
  await authApi.logout().catch(() => {});
  setStoredToken(null);
  authStore.set({ user: null, loading: false, initialized: true });
}