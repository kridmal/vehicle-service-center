import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api, { TOKEN_KEY } from "../services/api.js";

const AuthContext = createContext(null);
const USER_KEY = "ksc_user";

function readStoredAuth() {
  const token = localStorage.getItem(TOKEN_KEY);
  const rawUser = localStorage.getItem(USER_KEY);
  if (!token) return { isAuthenticated: false, user: null, token: null };

  try {
    const user = rawUser ? JSON.parse(rawUser) : null;
    return { isAuthenticated: Boolean(user), user, token };
  } catch {
    return { isAuthenticated: false, user: null, token: null };
  }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(readStoredAuth);

  useEffect(() => {
    if (auth.token) {
      localStorage.setItem(TOKEN_KEY, auth.token);
      localStorage.setItem(USER_KEY, JSON.stringify(auth.user));
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  }, [auth]);

  useEffect(() => {
    const handleLogout = () => {
      setAuth({ isAuthenticated: false, user: null, token: null });
    };

    window.addEventListener("auth:logout", handleLogout);
    return () => window.removeEventListener("auth:logout", handleLogout);
  }, []);

  useEffect(() => {
    if (!auth.token) return;
    let isActive = true;

    const restoreSession = async () => {
      try {
        const { data } = await api.get("/auth/me");
        if (isActive) {
          setAuth((prev) => ({
            ...prev,
            isAuthenticated: true,
            user: data.user,
          }));
        }
      } catch {
        if (isActive) {
          setAuth({ isAuthenticated: false, user: null, token: null });
        }
      }
    };

    restoreSession();

    return () => {
      isActive = false;
    };
  }, [auth.token]);

  const value = useMemo(
    () => ({
      isAuthenticated: auth.isAuthenticated,
      user: auth.user,
      login: async (email, password) => {
        try {
          const { data } = await api.post("/auth/login", { email, password });
          // Write immediately so any page effect that fires before the
          // useEffect([auth]) sync has a token to read from localStorage.
          localStorage.setItem(TOKEN_KEY, data.token);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
          setAuth({ isAuthenticated: true, user: data.user, token: data.token });
          return { ok: true };
        } catch (error) {
          const message =
            error.response?.data?.message || "Login failed. Please try again.";
          return { ok: false, message };
        }
      },
      logout: () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setAuth({ isAuthenticated: false, user: null, token: null });
      },
    }),
    [auth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
