import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api, { TOKEN_KEY } from "../services/api.js";

const AuthContext = createContext(null);
const USER_KEY = "ksc_user";

function readStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({
    isAuthenticated: false,
    user: null,
    token: readStoredToken(),
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (auth.token) {
      try {
        localStorage.setItem(TOKEN_KEY, auth.token);
        localStorage.setItem(USER_KEY, JSON.stringify(auth.user));
      } catch {
        // Ignore storage errors.
      }
    } else {
      try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      } catch {
        // Ignore storage errors.
      }
    }
  }, [auth]);

  useEffect(() => {
    let isActive = true;
    const token = readStoredToken();
    if (!token) {
      setAuth({ isAuthenticated: false, user: null, token: null });
      setIsLoading(false);
      return () => {
        isActive = false;
      };
    }

    const restoreSession = async () => {
      try {
        const { data } = await api.get("/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (isActive) {
          const user = data?.user || (data?.id ? data : null);
          if (!user) {
            setAuth({ isAuthenticated: false, user: null, token: null });
          } else {
            setAuth({ isAuthenticated: true, user, token });
          }
        }
      } catch {
        if (isActive) {
          try {
            localStorage.removeItem(TOKEN_KEY);
          } catch {
            // Ignore storage errors.
          }
          setAuth({ isAuthenticated: false, user: null, token: null });
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    restoreSession();

    return () => {
      isActive = false;
    };
  }, []);

  const value = useMemo(
    () => ({
      isAuthenticated: auth.isAuthenticated,
      isLoading,
      user: auth.user,
      login: async (email, password) => {
        try {
          const { data } = await api.post("/auth/login", { email, password });
          try {
            localStorage.setItem(TOKEN_KEY, data.token);
            localStorage.setItem(USER_KEY, JSON.stringify(data.user));
          } catch {
            // Ignore storage errors.
          }
          setAuth({ isAuthenticated: true, user: data.user, token: data.token });
          setIsLoading(false);
          return { ok: true };
        } catch (error) {
          const message =
            error.response?.data?.message || "Login failed. Please try again.";
          return { ok: false, message };
        }
      },
      logout: () => {
        setAuth({ isAuthenticated: false, user: null, token: null });
        setIsLoading(false);
      },
    }),
    [auth, isLoading]
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
