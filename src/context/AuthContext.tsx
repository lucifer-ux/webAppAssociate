import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import {
  buildApiUrl,
  clearApiSessionToken,
  setApiSessionToken,
} from "../lib/apiBase";
import {
  clearActiveCreditCache,
  fetchCreditBalance,
  setActiveCreditUser,
} from "../lib/creditCache";

export type AuthUser = {
  email: string;
  fullName?: string;
  displayName?: string;
  avatarUrl?: string;
};

type AuthStatus = "loading" | "authenticated" | "unauthenticated";
type InviteAuthError = Error & {
  requiresInvite?: boolean;
  email?: string;
  pendingInviteToken?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  pendingInviteEmail: string;
  loginWithGoogle: () => void;
  loginWithPassword: (email: string, password: string) => Promise<AuthUser>;
  signupWithPassword: (
    email: string,
    password: string,
    displayName?: string,
    inviteCode?: string,
  ) => Promise<AuthUser>;
  verifyInviteCode: (code: string, pendingInviteToken?: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshPendingInvite: () => Promise<void>;
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
  const [pendingInviteEmail, setPendingInviteEmail] = useState("");

  const refreshPendingInvite = useCallback(async () => {
    try {
      const response = await fetch(buildApiUrl("/api/auth/invite/pending"), {
        credentials: "include",
      });
      if (!response.ok) {
        setPendingInviteEmail("");
        return;
      }
      const payload = (await response.json()) as {
        success?: boolean;
        email?: string;
      };
      setPendingInviteEmail(payload.success && payload.email ? String(payload.email) : "");
    } catch {
      setPendingInviteEmail("");
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const response = await fetch(buildApiUrl("/api/auth/me"), {
        credentials: "include",
      });
      if (!response.ok) {
        setUser(null);
        setStatus("unauthenticated");
        await refreshPendingInvite();
        return;
      }
      const payload = (await response.json()) as { user?: AuthUser | null };
      const nextUser = readUserFromPayload(payload);
      setUser(nextUser);
      setStatus(nextUser ? "authenticated" : "unauthenticated");
      if (nextUser) {
        setPendingInviteEmail("");
      } else {
        await refreshPendingInvite();
      }
    } catch {
      setUser(null);
      setStatus("unauthenticated");
      await refreshPendingInvite();
    }
  }, [refreshPendingInvite]);

  useEffect(() => {
    const sessionToken = new URLSearchParams(
      window.location.hash.replace(/^#/, ""),
    ).get("sessionToken");
    if (!sessionToken) return;
    setApiSessionToken(sessionToken);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    if (!user?.email) {
      setActiveCreditUser("");
      return;
    }
    setActiveCreditUser(user.email);
    void fetchCreditBalance();
  }, [user?.email]);

  const loginWithGoogle = useCallback(() => {
    window.location.href = buildApiUrl("/auth/google");
  }, []);

  const submitPasswordAuth = useCallback(
    async ({
      endpoint,
      email,
      password,
      displayName,
      inviteCode,
    }: {
      endpoint: string;
      email: string;
      password: string;
      displayName?: string;
      inviteCode?: string;
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
          inviteCode,
        }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        requires_invite?: boolean;
        email?: string;
        pending_invite_token?: string;
        session_token?: string;
        user?: AuthUser | null;
      };
      if (!response.ok || payload.success === false) {
        if (payload.requires_invite) {
          setPendingInviteEmail(String(payload.email || email));
        }
        const authError = new Error(payload.error || "Authentication failed.") as InviteAuthError;
        authError.requiresInvite = Boolean(payload.requires_invite);
        authError.email = payload.email ? String(payload.email) : email;
        authError.pendingInviteToken = payload.pending_invite_token
          ? String(payload.pending_invite_token)
          : "";
        throw authError;
      }
      const nextUser = readUserFromPayload(payload);
      if (!nextUser) {
        throw new Error("Authenticated profile was not returned.");
      }
      if (payload.session_token) {
        setApiSessionToken(payload.session_token);
      }
      setUser(nextUser);
      setStatus("authenticated");
      setPendingInviteEmail("");
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
    (email: string, password: string, displayName = "", inviteCode = "") =>
      submitPasswordAuth({
        endpoint: "/api/auth/signup",
        email,
        password,
        displayName,
        inviteCode,
      }),
    [submitPasswordAuth],
  );

  const verifyInviteCode = useCallback(async (code: string, pendingInviteToken = "") => {
    const response = await fetch(buildApiUrl("/api/auth/invite/verify"), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code, pendingInviteToken: pendingInviteToken || undefined }),
    });
    const payload = (await response.json()) as {
      success?: boolean;
      error?: string;
      session_token?: string;
      user?: AuthUser | null;
    };
    if (!response.ok || payload.success === false) {
      throw new Error(payload.error || "Invite verification failed.");
    }
    const nextUser = readUserFromPayload(payload);
    if (!nextUser) {
      throw new Error("Authenticated profile was not returned.");
    }
    if (payload.session_token) {
      setApiSessionToken(payload.session_token);
    }
    setUser(nextUser);
    setStatus("authenticated");
    setPendingInviteEmail("");
    return nextUser;
  }, []);

  const logout = useCallback(async () => {
    await fetch(buildApiUrl("/api/auth/logout"), {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined);
    setUser(null);
    setPendingInviteEmail("");
    setStatus("unauthenticated");
    clearActiveCreditCache();
    clearApiSessionToken();
    setActiveCreditUser("");
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
    setPendingInviteEmail("");
    return nextUser;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isAuthenticated: status === "authenticated" && Boolean(user),
      pendingInviteEmail,
      loginWithGoogle,
      loginWithPassword,
      signupWithPassword,
      verifyInviteCode,
      logout,
      refreshUser,
      refreshPendingInvite,
      updateDisplayName,
    }),
    [
      loginWithGoogle,
      loginWithPassword,
      logout,
      pendingInviteEmail,
      refreshUser,
      refreshPendingInvite,
      signupWithPassword,
      status,
      updateDisplayName,
      user,
      verifyInviteCode,
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
