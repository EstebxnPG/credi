"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { writeSession } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function getApiUrl() {
  if (API_URL) {
    return API_URL;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_API_URL debe estar configurado en producción.");
  }

  return "http://localhost:8000";
}

type LoginResponse = {
  access_token: string;
  rol: string;
  nombre: string;
  oficina_id: number;
};

type ValidationErrorItem = {
  loc?: Array<string | number>;
  msg?: string;
};

function normalizeLoginError(detail: unknown) {
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
          const validation = item as ValidationErrorItem;
          return validation.msg ?? "Hay un dato inválido en el formulario.";
        }

        return null;
      })
      .filter((message): message is string => Boolean(message));

    if (messages.length > 0) {
      return messages.join(" ");
    }
  }

  return "No se pudo iniciar sesión";
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const maybeMessage = searchParams.get("message");
    if (maybeMessage) {
      setError(maybeMessage);
    }
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${getApiUrl()}/api/v1/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ correo, contrasena }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { detail?: unknown };
        throw new Error(normalizeLoginError(payload.detail));
      }

      const data = (await response.json()) as LoginResponse;
      writeSession({
        accessToken: data.access_token,
        nombre: data.nombre,
        rol: data.rol,
        oficinaId: data.oficina_id,
      });

      router.replace(searchParams.get("next") || "/dashboard");
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Ocurrió un error inesperado";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
      <div className="grid w-full max-w-6xl gap-6 lg:grid-cols-[1.15fr_minmax(420px,520px)]">
        <section className="glass-panel hidden overflow-hidden p-8 lg:block lg:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.36em] text-stone-500">
            Crediconfiemos
          </p>
          <h1 className="mt-5 max-w-xl text-5xl font-semibold tracking-tight text-stone-950">
            El frente comercial del crédito ya tiene forma.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-stone-600">
            Ingresa con tu usuario y contraseña para acceder al panel, gestionar tus créditos y administrar tu operación de manera sencilla.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <article className="card-panel p-5">
              <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
                Plataforma lista
              </p>
              <p className="mt-3 text-2xl font-semibold text-stone-900">
                Login, shell, dashboard y créditos conectados
              </p>
            </article>
            <article className="card-panel p-5">
              <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
                Plataforma lista
              </p>
              <p className="mt-3 text-2xl font-semibold text-stone-900">
                Tu sistema está listo para operar.
              </p>
            </article>
          </div>
        </section>

        <section className="glass-panel p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">
            Acceso interno
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-stone-950">
            Inicia sesión
          </h2>
          <p className="mt-3 text-sm leading-7 text-stone-600">
            Usa tus credenciales reales del backend para entrar al panel.
          </p>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                Correo
              </label>
              <input
                className="input-base"
                value={correo}
                onChange={(event) => setCorreo(event.target.value)}
                placeholder="Ingresa tu correo"
                type="email"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                Contraseña
              </label>
              <div className="relative">
                <input
                  className="input-base pr-11"
                  value={contrasena}
                  onChange={(event) => setContrasena(event.target.value)}
                  placeholder="Ingresa tu contraseña"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-3 flex items-center rounded-full px-2 text-stone-500 transition hover:text-stone-700 focus:outline-none"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <button type="submit" className="button-primary w-full" disabled={loading}>
              {loading ? "Ingresando..." : "Entrar al panel"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeSlashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <path d="M9.88 9.88a3 3 0 0 1 4.24 4.24" />
      <path d="M3 3l18 18" />
    </svg>
  );
}
