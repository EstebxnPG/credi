"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { navItems } from "@/lib/navigation";
import { clearSession, readSession } from "@/lib/session";

const quickStats = [
  { label: "Meta del dia", value: "12 solicitudes", tone: "text-teal-700" },
  { label: "Revision documental", value: "9 pendientes", tone: "text-amber-700" },
  { label: "Creditos enviados", value: "4 hoy", tone: "text-stone-700" },
];

export function AppShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const session = readSession();

  const visibleItems = navItems.filter((item) => {
    if (!item.adminOnly) {
      return true;
    }
    return session?.rol === "administrador";
  });

  return (
    <div className="min-h-screen px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1600px] gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="glass-panel overflow-hidden">
          <div className="border-b border-stone-800/10 px-6 py-6">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-stone-500">
              Crediconfiemos
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-stone-900">
              Panel operativo
            </h1>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Un cascaron listo para empezar a conectar modulos reales sin perder
              tiempo en estructura.
            </p>
          </div>

          <div className="space-y-3 px-4 py-4">
            {visibleItems.map((item) => {
              const active = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "block rounded-3xl border px-4 py-4 transition",
                    active
                      ? "border-teal-700/15 bg-teal-900 text-white shadow-xl shadow-teal-950/20"
                      : "border-stone-800/10 bg-white/55 text-stone-800 hover:bg-white/80",
                  ].join(" ")}
                >
                  <div className="text-base font-semibold">{item.label}</div>
                  <div
                    className={[
                      "mt-1 text-sm",
                      active ? "text-teal-50/80" : "text-stone-500",
                    ].join(" ")}
                  >
                    {item.description}
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="border-t border-stone-800/10 px-4 py-5">
            <div className="card-panel space-y-4 p-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                  Sesion activa
                </p>
                <h2 className="mt-2 text-lg font-semibold text-stone-900">
                  {session?.nombre ?? "Sin usuario"}
                </h2>
                <p className="text-sm text-stone-500">{session?.rol ?? "sin rol"}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  clearSession();
                  router.replace("/login");
                }}
                className="button-muted w-full"
              >
                Cerrar sesion
              </button>
            </div>
          </div>
        </aside>

        <main className="space-y-4">
          <section className="glass-panel overflow-hidden">
            <div className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_420px] md:p-6">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-stone-500">
                  Sistema web
                </p>
                <h2 className="mt-3 text-4xl font-semibold tracking-tight text-stone-950">
                  Intermediacion de creditos sin Excel.
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600">
                  La idea de este shell es darte una base visible y navegable para
                  construir rapido. Ya tienes login, sidebar, modulos y un espacio
                  limpio para conectar cada endpoint.
                </p>
              </div>

              <div className="grid gap-3">
                {quickStats.map((item) => (
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
