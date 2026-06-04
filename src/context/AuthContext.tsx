import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { buildApiUrl } from "../lib/apiBase";

export type AuthUser = {
  email: string;
  fullName?: string;
  displayName?: string;
  avatarUrl?: string;
};

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  user: AuthUser | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  loginWithGoogle: () => void;
  loginWithPassword: (email: string, password: string) => Promise<AuthUser>;
  signupWithPassword: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<AuthUser>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const readUserFromPayload = (payload: { user?: AuthUser | null }) => {
  const user = payload?.user;
  if (!user?.email) return null;
  return {
    email: String(user.email),
    fullName: String(user.fullName || user.displayName || ""),
    displayName: String(user.displayName || user.fullName || user.email.split("@")[0]),
    avatarUrl: String(user.avatarUrl || ""),
  };
};

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const refreshUser = useCallback(async () => {
    try {
      const response = await fetch(buildApiUrl("/api/auth/me"), {
        credentials: "include",
      });
      if (!response.ok) {
        setUser(null);
        setStatus("unauthenticated");
        return;
      }
      const payload = (await response.json()) as { user?: AuthUser | null };
      const nextUser = readUserFromPayload(payload);
      setUser(nextUser);
      setStatus(nextUser ? "authenticated" : "unauthenticated");
    } catch {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const loginWithGoogle = useCallback(() => {
    window.location.href = buildApiUrl("/auth/google");
  }, []);

  const submitPasswordAuth = useCallback(
    async ({
      endpoint,
      email,
      password,
      displayName,
    }: {
      endpoint: string;
      email: string;
      password: string;
      displayName?: string;
    }) => {
      const response = await fetch(buildApiUrl(endpoint), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          displayName,
        }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        user?: AuthUser | null;
      };
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || "Authentication failed.");
      }
      const nextUser = readUserFromPayload(payload);
      if (!nextUser) {
        throw new Error("Authenticated profile was not returned.");
      }
      setUser(nextUser);
      setStatus("authenticated");
      return nextUser;
    },
    [],
  );

  const loginWithPassword = useCallback(
    (email: string, password: string) =>
      submitPasswordAuth({
        endpoint: "/api/auth/login",
        email,
        password,
      }),
    [submitPasswordAuth],
  );

  const signupWithPassword = useCallback(
    (email: string, password: string, displayName = "") =>
      submitPasswordAuth({
        endpoint: "/api/auth/signup",
        email,
        password,
        displayName,
      }),
    [submitPasswordAuth],
  );

  const logout = useCallback(async () => {
    await fetch(buildApiUrl("/api/auth/logout"), {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const updateDisplayName = useCallback(async (displayName: string) => {
    const response = await fetch(buildApiUrl("/api/auth/me"), {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ displayName }),
    });
    const payload = (await response.json()) as {
      success?: boolean;
      error?: string;
      user?: AuthUser | null;
    };
    if (!response.ok || payload.success === false) {
      throw new Error(payload.error || "Failed to update profile.");
    }
    const nextUser = readUserFromPayload(payload);
    if (!nextUser) {
      throw new Error("Updated profile was not returned.");
    }
    setUser(nextUser);
    setStatus("authenticated");
    return nextUser;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isAuthenticated: status === "authenticated" && Boolean(user),
      loginWithGoogle,
      loginWithPassword,
      signupWithPassword,
      logout,
      refreshUser,
      updateDisplayName,
    }),
    [
      loginWithGoogle,
      loginWithPassword,
      logout,
      refreshUser,
      signupWithPassword,
      status,
      updateDisplayName,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
};
