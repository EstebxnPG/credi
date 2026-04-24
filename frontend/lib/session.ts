"use client";

export type SessionUser = {
  accessToken: string;
  nombre: string;
  rol: string;
};

const SESSION_KEY = "credi.session";

export function readSession(): SessionUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SessionUser;
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
