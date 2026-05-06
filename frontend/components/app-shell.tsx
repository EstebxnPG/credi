"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { navItems } from "@/lib/navigation";
import { clearSession, readSession } from "@/lib/session";

type ShellMetric = {
  label: string;
  value: string;
  tone: string;
};

export function AppShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const session = readSession();
  const [metrics, setMetrics] = useState<ShellMetric[]>([
    { label: "Contactos", value: "--", tone: "text-teal-700" },
    { label: "Creditos activos", value: "--", tone: "text-amber-700" },
    { label: "Documentos activos", value: "--", tone: "text-stone-700" },
  ]);

  const visibleItems = navItems.filter((item) => {
    if (!item.adminOnly) {
      return true;
    }
    return session?.rol === "administrador";
  });

  useEffect(() => {
    let ignore = false;

    async function loadMetrics() {
      try {
        const [pensionados, creditos, documentos] = await Promise.all([
          apiFetch<Array<{ id: number; is_active: boolean }>>("/api/v1/pensionados/"),
          apiFetch<Array<{ id: number; estado: string }>>("/api/v1/creditos/"),
          apiFetch<Array<{ id: number; is_active: boolean }>>(
            "/api/v1/documentos/?solo_activos=true",
          ),
        ]);

        if (!ignore) {
          setMetrics([
            {
              label: "Contactos",
              value: String(pensionados.filter((item) => item.is_active).length),
              tone: "text-teal-700",
            },
            {
              label: "Creditos activos",
              value: String(
                creditos.filter((item) =>
                  [
                    "Prospecto",
                    "Enviado a cooperativa",
                    "Devuelto por corrección",
                    "Reenviado",
                    "Aprobado",
                  ].includes(item.estado),
                ).length,
              ),
              tone: "text-amber-700",
            },
            {
              label: "Documentos activos",
              value: String(documentos.filter((item) => item.is_active).length),
              tone: "text-stone-700",
            },
          ]);
        }
      } catch {
        if (!ignore) {
          setMetrics([
            { label: "Contactos", value: "--", tone: "text-teal-700" },
            { label: "Creditos activos", value: "--", tone: "text-amber-700" },
            { label: "Documentos activos", value: "--", tone: "text-stone-700" },
          ]);
        }
      }
    }

    if (session) {
      void loadMetrics();
    }

    return () => {
      ignore = true;
    };
  }, [session?.accessToken]);

  return (
    <div className="min-h-screen px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-[1600px]">
        <header className="glass-panel sticky top-4 z-30 overflow-hidden">
          <div className="border-b border-stone-800/10 bg-[linear-gradient(90deg,rgba(217,119,6,0.08),rgba(15,118,110,0.08))] px-3 py-2.5 md:px-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#facc15] text-xs font-black text-stone-900 shadow-lg shadow-amber-500/20">
                  CC
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-500">
                    Crediconfiemos
                  </p>
                  <h1 className="text-base font-semibold text-stone-950 sm:text-lg">
                    Panel operativo
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start lg:self-auto">
                <div className="rounded-xl border border-stone-800/10 bg-white/70 px-3 py-1.5">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-stone-500">
                    Sesion
                  </p>
                  <p className="max-w-[140px] truncate text-xs font-semibold text-stone-900 sm:max-w-[180px]">
                    {session?.nombre ?? "Sin usuario"}
                  </p>
                </div>
                <div className="hidden rounded-xl border border-stone-800/10 bg-white/70 px-3 py-1.5 text-xs text-stone-600 sm:block">
                  {session?.rol ?? "sin rol"}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    clearSession();
                    router.replace("/login");
                  }}
                  className="button-muted rounded-xl px-3 py-1.5 text-xs"
                >
                  Salir
                </button>
              </div>
            </div>
          </div>

          <div className="px-3 py-2 md:px-4">
            <nav className="flex flex-wrap gap-2">
              {visibleItems.map((item) => {
                const active = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                      active
                        ? "border-amber-500/20 bg-[#fff4cc] text-stone-950 shadow-lg shadow-amber-500/10"
                        : "border-stone-800/10 bg-white/55 text-stone-700 hover:bg-white/85",
                    ].join(" ")}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>

        <main className="space-y-4 pt-4">
          <section className="glass-panel overflow-hidden">
            <div className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_420px] md:p-6">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-stone-500">
                  Sistema web
                </p>
                <h2 className="mt-3 text-4xl font-semibold tracking-tight text-stone-950">
                  Operacion centrada en el contacto.
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600">
                  La navegacion principal ya no deberia sentirse como modulos sueltos.
                  La idea es que desde un contacto puedas entender su historia,
                  sus creditos y su trazabilidad sin ir armando un rompecabezas.
                </p>
              </div>

              <div className="grid gap-3">
                {metrics.map((item) => (
                  <article key={item.label} className="card-panel p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                      {item.label}
                    </p>
                    <p className={`mt-3 text-2xl font-semibold ${item.tone}`}>
                      {item.value}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {children}
        </main>
      </div>
    </div>
  );
}
