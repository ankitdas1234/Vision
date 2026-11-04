import { apiClient, setStoredToken, setRememberedLogin } from "../api/client";

export const authApi = {
  register: (name, email, password, imageBase64) =>
    apiClient.post("/auth/register", {
      name,
      email,
      password,
      ...(imageBase64 ? { imageBase64 } : {}),
    }),

  login: async (email, password, remember = true) => {
    // Always start clean so an old/invalid token can't interfere
    setStoredToken(null);

    const data = await apiClient.post("/auth/login", { email, password, remember });

    if (data.token) setStoredToken(data.token, remember);
    setRememberedLogin(email, remember);
    return data;
  },

  logout: async () => {
    try {
      await apiClient.post("/auth/logout");
    } finally {
      setStoredToken(null);
    }
  },

  me: () => apiClient.get("/auth/me"),

  forgotPassword: (email) =>
    apiClient.post("/auth/forgot-password", { email }),

  resetPassword: (token, password) =>
    apiClient.post("/auth/reset-password", { token, password }),
};