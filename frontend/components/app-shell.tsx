"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { navItems, navSections } from "@/lib/navigation";
import { clearSession, readSession } from "@/lib/session";

type Notificacion = {
  id: number;
  titulo: string;
  mensaje: string;
  href: string;
  leida: boolean;
};

type NotificationPage = {
  items: Notificacion[];
  total: number;
  unread: number;
};

export function AppShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const session = readSession();
  const [notifications, setNotifications] = useState<Notificacion[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [toast, setToast] = useState<Notificacion | null>(null);
  const knownIds = useRef<Set<number> | null>(null);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await apiFetch<NotificationPage>(
        "/api/v1/notificaciones/?page_size=6",
      );
      const next = response.items;
      const unread = next.filter((item) => !item.leida);
      if (knownIds.current) {
        const nueva = unread.find((item) => !knownIds.current?.has(item.id));
        if (nueva && pathname !== "/notificaciones") setToast(nueva);
      }
      knownIds.current = new Set(next.map((item) => item.id));
      setNotifications(next);
      setUnreadCount(response.unread);
    } catch {
      // The shell stays usable if notification polling fails.
    }
  }, [pathname]);

  async function markRead(item: Notificacion) {
    if (!item.leida) {
      await apiFetch<void>(`/api/v1/notificaciones/${item.id}/leer`, {
        method: "PATCH",
      });
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === item.id ? { ...notification, leida: true } : notification,
        ),
      );
    }
    setBellOpen(false);
    setToast(null);
    router.push(item.href);
  }

  async function markAllRead() {
    await apiFetch<void>("/api/v1/notificaciones/leer-todas", { method: "PATCH" });
    setNotifications((current) => current.map((item) => ({ ...item, leida: true })));
    setUnreadCount(0);
    setToast(null);
    window.dispatchEvent(new Event("notifications-updated"));
  }

  useEffect(() => {
    void loadNotifications();
    const interval = window.setInterval(() => void loadNotifications(), 15_000);
    const refresh = () => void loadNotifications();
    window.addEventListener("notifications-updated", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("notifications-updated", refresh);
    };
  }, [loadNotifications]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 7000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    setBellOpen(false);
  }, [pathname]);

  const visibleItems = navItems.filter((item) => {
    if (!item.adminOnly) {
      return true;
    }

    return session?.rol === "administrador";
  });

  return (
    <div className="min-h-screen px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-[1600px]">
        <header className="sticky top-4 z-30 rounded-2xl border border-stone-800/10 bg-white/90 shadow-lg shadow-stone-900/5 backdrop-blur-xl">
          <div className="border-b border-stone-800/10 px-3 py-2.5 md:px-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#facc15] text-xs font-black text-stone-900 shadow-lg shadow-amber-500/20">
                  CC
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-500">
                    Crediconfiemos
                  </p>
                  <h1 className="text-base font-semibold text-stone-950 sm:text-lg">
                    Centro operativo
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start lg:self-auto">
                <div className="relative">
                  <button
                    type="button"
                    title="Notificaciones"
                    aria-label="Abrir notificaciones"
                    onClick={() => setBellOpen((open) => !open)}
                    className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-stone-800/10 bg-white text-stone-700 transition hover:bg-stone-50"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="h-5 w-5"
                      aria-hidden="true"
                    >
                      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                      <path d="M10 21h4" />
                    </svg>
                    {unreadCount > 0 ? (
                      <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    ) : null}
                  </button>

                  {bellOpen ? (
                    <div className="absolute right-0 top-11 z-50 w-[min(360px,calc(100vw-2rem))] border border-stone-800/10 bg-white shadow-2xl">
                      <div className="flex items-center justify-between border-b border-stone-800/10 px-4 py-3">
                        <p className="text-sm font-semibold text-stone-950">Notificaciones</p>
                        <button
                          type="button"
                          className="text-xs font-semibold text-teal-800 disabled:text-stone-400"
                          disabled={unreadCount === 0}
                          onClick={() => void markAllRead()}
                        >
                          Marcar leídas
                        </button>
                      </div>
                      <div className="max-h-80 divide-y divide-stone-800/10 overflow-y-auto">
                        {notifications.slice(0, 6).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => void markRead(item)}
                            className={[
                              "block w-full px-4 py-3 text-left transition hover:bg-teal-50",
                              item.leida
                                ? "bg-stone-50 text-stone-500"
                                : "bg-white text-stone-950",
                            ].join(" ")}
                          >
                            <p className={item.leida ? "text-sm font-medium text-stone-500" : "text-sm font-bold text-stone-950"}>{item.titulo}</p>
                            <p className={item.leida ? "mt-1 line-clamp-2 text-xs text-stone-400" : "mt-1 line-clamp-2 text-xs font-medium text-stone-700"}>
                              {item.mensaje}
                            </p>
                          </button>
                        ))}
                        {notifications.length === 0 ? (
                          <p className="px-4 py-8 text-center text-sm text-stone-500">
                            No hay notificaciones.
                          </p>
                        ) : null}
                      </div>
                      <Link
                        href="/notificaciones"
                        onClick={() => setBellOpen(false)}
                        className="block border-t border-stone-800/10 px-4 py-3 text-center text-sm font-semibold text-teal-800 hover:bg-stone-50"
                      >
                        Ver todas
                      </Link>
                    </div>
                  ) : null}
                </div>
                <div className="rounded-lg border border-stone-800/10 bg-white/70 px-3 py-1.5">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-stone-500">
                    Sesión
                  </p>
                  <p className="max-w-[140px] truncate text-xs font-semibold text-stone-900 sm:max-w-[180px]">
                    {session?.nombre ?? "Sin usuario"}
                  </p>
                </div>
                <div className="hidden rounded-lg border border-stone-800/10 bg-white/70 px-3 py-1.5 text-xs text-stone-600 sm:block">
                  {session?.rol ?? "sin rol"}
                  {session?.oficinaId ? ` - Oficina ${session.oficinaId}` : ""}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    clearSession();
                    router.replace("/login");
                  }}
                  className="button-muted rounded-lg px-3 py-1.5 text-xs"
                >
                  Salir
                </button>
              </div>
            </div>
          </div>

          <div className="px-3 py-2 md:px-4">
            <nav className="flex flex-wrap gap-x-5 gap-y-2">
              {navSections.map((section) => {
                const items = visibleItems.filter((item) => item.section === section.key);
                if (items.length === 0) {
                  return null;
                }

                return (
                  <div key={section.key} className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                      {section.label}
                    </span>
                    {items.map((item) => {
                      const active =
                        pathname === item.href || pathname.startsWith(`${item.href}/`);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          title={item.description}
                          className={[
                            "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
                            active
                              ? "border-teal-700/20 bg-teal-950 text-white shadow-lg shadow-teal-950/10"
                              : "border-stone-800/10 bg-white/60 text-stone-700 hover:bg-white",
                          ].join(" ")}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
          </div>
        </header>

        <main className="space-y-4 pt-4">{children}</main>
      </div>

      {toast ? (
        <button
          type="button"
          onClick={() => void markRead(toast)}
          className="fixed right-4 top-24 z-[60] w-[min(380px,calc(100vw-2rem))] border border-amber-600/20 bg-white p-4 text-left shadow-2xl"
        >
          <div className="flex gap-3">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />
            <div>
              <p className="text-sm font-semibold text-stone-950">{toast.titulo}</p>
              <p className="mt-1 text-sm text-stone-600">{toast.mensaje}</p>
            </div>
          </div>
        </button>
      ) : null}
    </div>
  );
}
