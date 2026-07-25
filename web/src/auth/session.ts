import type { AuthTokens } from "../types";

// Plain, framework-free session store backed by localStorage. Both the API
// client and the React auth context read/write through here, which keeps the
// client free of any dependency on React state.

const ACCESS_KEY = "fpc.accessToken";
const REFRESH_KEY = "fpc.refreshToken";
const DEVICE_KEY = "fpc.deviceId";

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSession(): AuthTokens | null {
  const accessToken = localStorage.getItem(ACCESS_KEY);
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export function isAuthenticated(): boolean {
  return getSession() !== null;
}

export function setTokens(tokens: AuthTokens): void {
  localStorage.setItem(ACCESS_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  notify();
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  notify();
}

// Stable per-browser device id used for guest auth. Generated once and
// persisted; the backend's guest schema requires at least 8 characters.
export function getDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const generated = createDeviceId();
  localStorage.setItem(DEVICE_KEY, generated);
  return generated;
}

function createDeviceId(): string {
  const cryptoObj: Crypto | undefined = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return `web-${cryptoObj.randomUUID()}`;
  }
  const random = Math.random().toString(36).slice(2);
  return `web-${Date.now().toString(36)}-${random}`;
}
