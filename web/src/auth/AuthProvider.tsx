import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { guestLogin, sendEvent } from "../api/client";
import {
  clearSession,
  getDeviceId,
  isAuthenticated as sessionIsAuthenticated,
  setTokens,
  subscribe,
} from "./session";
import { AuthContext, type AuthContextValue } from "./AuthContext";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean>(() => sessionIsAuthenticated());

  // Keep React state in sync with the session store, including changes made by
  // the API client (e.g. a failed refresh clearing the session).
  useEffect(() => subscribe(() => setAuthed(sessionIsAuthenticated())), []);

  const login = useCallback(async (): Promise<void> => {
    const deviceId = getDeviceId();
    const tokens = await guestLogin(deviceId);
    setTokens(tokens);
    // Best-effort analytics; failures are swallowed inside sendEvent.
    void sendEvent("web_login", { method: "guest" });
  }, []);

  const logout = useCallback((): void => {
    clearSession();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ isAuthenticated: authed, login, logout }),
    [authed, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
