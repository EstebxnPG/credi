"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { navItems, navSections } from "@/lib/navigation";
import { clearSession, readSession } from "@/lib/session";

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
      <div className="mx-auto max-w-[1600px]">
        <header className="sticky top-4 z-30 overflow-hidden rounded-2xl border border-stone-800/10 bg-white/90 shadow-lg shadow-stone-900/5 backdrop-blur-xl">
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
                <div className="rounded-lg border border-stone-800/10 bg-white/70 px-3 py-1.5">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-stone-500">
                    Sesion
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
    </div>
  );
}
