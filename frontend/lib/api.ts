"use client";

import { clearSession, readSession } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type ValidationItem = {
  loc?: Array<string | number>;
  msg?: string;
};

const fieldLabels: Record<string, string> = {
  nombre: "Nombre",
  segundo_nombre: "Segundo nombre",
  apellidos: "Apellidos",
  genero: "Genero",
  documento: "Documento",
  fecha_nacimiento: "Fecha de nacimiento",
  telefono: "Teléfono",
  celular: "Celular",
  direccion: "Dirección",
  fecha_inicio_pension: "Fecha de inicio de pensión",
  correo: "Correo",
  contrasena: "Contraseña",
};

function toFriendlyFieldName(path?: string) {
  if (!path) {
    return "Campo";
  }

  return fieldLabels[path] ?? path.replaceAll("_", " ");
}

function toFriendlyValidationMessage(path: string | undefined, message: string) {
  if (message.includes("Input should be a valid date or datetime")) {
    return "Debes ingresar una fecha válida.";
  }

  if (message.includes("input is too short")) {
    return "Este campo está incompleto.";
  }

  if (message.includes("Field required")) {
    return "Este campo es obligatorio.";
  }

  return message.replace("Value error, ", "");
}

function normalizeApiError(detail: unknown, fallback: string) {
  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item && typeof item === "object") {
          const validationItem = item as ValidationItem;
          const rawPath = validationItem.loc?.slice(1).join(" / ");
          const fieldName = toFriendlyFieldName(rawPath);
          const message = toFriendlyValidationMessage(
            rawPath,
            validationItem.msg ?? "Valor inválido.",
          );

          return `${fieldName}: ${message}`;
        }

        return null;
      })
      .filter((item): item is string => Boolean(item));

    if (messages.length > 0) {
      return messages.join(". ");
    }
  }

  return fallback;
}

function redirectToLogin() {
  if (typeof window === "undefined") {
    return;
  }

  clearSession();

  const currentPath = `${window.location.pathname}${window.location.search}`;
  const next = currentPath.startsWith("/login") ? "/dashboard" : currentPath;
  window.location.replace(`/login?next=${encodeURIComponent(next)}`);
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const session = readSession();
  const headers = new Headers(init?.headers);
  const isFormData = init?.body instanceof FormData;

  if (!headers.has("Content-Type") && init?.body && !isFormData) {
    headers.set("Content-Type", "application/json");
  }

  if (session?.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      redirectToLogin();
      throw new ApiError("Sesion expirada. Inicia sesion nuevamente.", 401);
    }

    let message = "Ocurrio un error al consultar la API";

    try {
      const payload = (await response.json()) as { detail?: unknown };
      message = normalizeApiError(payload.detail, message);
    } catch {
      message = response.statusText || message;
    }

    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
