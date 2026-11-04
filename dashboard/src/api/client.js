const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
const TOKEN_KEY = "vision_token";

/**
 * Where the session token lives depends on "Remember me":
 *   remembered   -> localStorage   (survives closing the browser; server cookie lasts 30 days)
 *   not remembered -> sessionStorage (gone when the tab/browser closes; server cookie is a session cookie)
 */
const EMAIL_KEY = "vision_email";
const REMEMBER_KEY = "vision_remember";

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token, remember = true) {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  } catch {
    // storage blocked (private mode) - the httpOnly cookie still carries the session
  }
}

/** Remembered sign-in details: only the email (never the password) and the checkbox choice. */
export function getRememberedLogin() {
  try {
    return {
      email: localStorage.getItem(EMAIL_KEY) || "",
      remember: localStorage.getItem(REMEMBER_KEY) !== "0",
    };
  } catch {
    return { email: "", remember: true };
  }
}

export function setRememberedLogin(email, remember) {
  try {
    localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
    if (remember && email) localStorage.setItem(EMAIL_KEY, email);
    else localStorage.removeItem(EMAIL_KEY);
  } catch {
    // ignore
  }
}

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  // Never attach Authorization on login / register / password-reset
  const isAuthPublic =
    path.startsWith("/auth/login") ||
    path.startsWith("/auth/register") ||
    path.startsWith("/auth/forgot-password") ||
    path.startsWith("/auth/reset-password");

  if (!isAuthPublic) {
    const token = getStoredToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });

  if (!res.ok) {
    // Clear dead token only on protected routes
    if (res.status === 401 && !isAuthPublic) {
      setStoredToken(null);
    }

    const body = await res.json().catch(() => ({ message: res.statusText }));
    const err = new Error(body.message || "Request failed");
    err.code = body.code;
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export const apiClient = {
  get: (path) => request(path),
  post: (path, body) =>
    request(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  put: (path, body) =>
    request(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  patch: (path, body) =>
    request(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  delete: (path) => request(path, { method: "DELETE" }),
};