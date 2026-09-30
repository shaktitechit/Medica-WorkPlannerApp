import * as SecureStore from "expo-secure-store";
import { AUTH_SERVICE_URL } from "@/lib/env";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthUser, UserSession } from "@/types/workPlanner";

const TOKEN_KEY = "wp.token";
const USER_KEY = "wp.user";
const REFRESH_KEY = "wp.refresh";

let memorySession: UserSession | null = null;
const sessionListeners = new Set<(session: UserSession | null) => void>();

export function getSession(): UserSession | null {
  return memorySession;
}

export function subscribeSession(listener: (session: UserSession | null) => void): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

function decodeJwtUser(token: string): AuthUser | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = globalThis.atob(padded);
    const decoded = JSON.parse(json) as Record<string, unknown>;
    const deptObj = typeof decoded.department === "object" && decoded.department !== null ? (decoded.department as Record<string, unknown>) : null;
    const parentDept = String(
      decoded.parent_department ||
      decoded.parentDepartment ||
      deptObj?.parent_department ||
      ""
    );
    return {
      _id: String(decoded._id || decoded.sub || decoded.id || "user"),
      name: String(decoded.name || decoded.email || "User"),
      email: String(decoded.email || ""),
      department: String(deptObj?.code || deptObj?.name || decoded.department || "sales"),
      parent_department: parentDept || undefined,
      parentDepartment: parentDept || undefined,
      roles: Array.isArray(decoded.roles) ? (decoded.roles as string[]) : [],
      role_codes: Array.isArray(decoded.role_codes) ? (decoded.role_codes as string[]) : [],
      portals: Array.isArray(decoded.portals) ? (decoded.portals as AuthUser["portals"]) : [],
    };
  } catch {
    return null;
  }
}

function setMemory(session: UserSession | null) {
  memorySession = session;
  for (const listener of sessionListeners) listener(session);
}

export async function hydrateSession(): Promise<UserSession | null> {
  const token = (await SecureStore.getItemAsync(TOKEN_KEY)) || "";
  const refreshToken = (await SecureStore.getItemAsync(REFRESH_KEY)) || undefined;
  if (!token && !refreshToken) {
    setMemory(null);
    return null;
  }
  const rawUser = await SecureStore.getItemAsync(USER_KEY);
  let user: AuthUser | null = null;
  if (rawUser) {
    try {
      user = JSON.parse(rawUser) as AuthUser;
    } catch {
      user = null;
    }
  }
  if (token) {
    user = user || decodeJwtUser(token);
  }
  if (!user && !refreshToken) {
    setMemory(null);
    return null;
  }
  const session = { token, refreshToken, user: user || { _id: "user", name: "User", email: "", department: "sales" } };
  setMemory(session);
  return session;
}

export async function persistSession(session: UserSession | null): Promise<void> {
  setMemory(session);
  if (!session) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, session.token);
  if (session.refreshToken) {
    await SecureStore.setItemAsync(REFRESH_KEY, session.refreshToken);
  } else {
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  }
  const userJson = JSON.stringify(session.user);
  if (userJson.length < 2000) {
    await SecureStore.setItemAsync(USER_KEY, userJson);
  } else {
    await SecureStore.deleteItemAsync(USER_KEY);
  }
}

type SessionContextValue = {
  ready: boolean;
  session: UserSession | null;
  signIn: (session: UserSession) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (user: AuthUser) => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<UserSession | null>(null);

  useEffect(() => subscribeSession(setSession), []);

  useEffect(() => {
    let alive = true;
    hydrateSession()
      .then((next) => {
        if (alive) setSession(next);
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      ready,
      session,
      async signIn(next) {
        await persistSession(next);
        setSession(next);
      },
      async signOut() {
        const refreshToken = session?.refreshToken || getSession()?.refreshToken;
        if (refreshToken) {
          try {
            await fetch(`${AUTH_SERVICE_URL}/api/auth/logout`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ refreshToken }),
            });
          } catch {
            /* still clear this device */
          }
        }
        await persistSession(null);
        setSession(null);
      },
      async updateUser(user) {
        if (!session) return;
        const next = { ...session, user };
        await persistSession(next);
        setSession(next);
      },
    }),
    [ready, session],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
