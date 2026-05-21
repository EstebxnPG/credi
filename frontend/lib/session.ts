"use client";

export type SessionUser = {
  accessToken: string;
  nombre: string;
  rol: string;
  oficinaId?: number;
};

const SESSION_KEY = "credi.session";

type TokenPayload = {
  exp?: number;
  sub?: string;
};

function decodeTokenPayload(token: string): TokenPayload | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) {
      return null;
    }

    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const decoded = window.atob(padded);
    return JSON.parse(decoded) as TokenPayload;
  } catch {
    return null;
  }
}

export function isSessionExpired(session: SessionUser) {
  if (typeof window === "undefined") {
    return false;
  }

  const payload = decodeTokenPayload(session.accessToken);
  if (!payload?.exp) {
    return false;
  }

  return payload.exp * 1000 <= Date.now();
}

export function readSession(): SessionUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw) as SessionUser;
    if (isSessionExpired(session)) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }

    return session;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function writeSession(session: SessionUser) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
}

export function readSessionUserId() {
  const session = readSession();
  const token = session?.accessToken;

  if (!token || typeof window === "undefined") {
    return null;
  }

  const data = decodeTokenPayload(token);
  return data?.sub ? Number(data.sub) : null;
}
