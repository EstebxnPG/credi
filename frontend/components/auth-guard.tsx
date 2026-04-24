"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { readSession, type SessionUser } from "@/lib/session";

export function AuthGuard({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [session, setSession] = useState<SessionUser | null | undefined>(undefined);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const current = readSession();
    setSession(current);

    if (!current) {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/dashboard")}`);
    }
  }, [pathname, router]);

  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="glass-panel w-full max-w-md p-8 text-center">
          <p className="text-sm uppercase tracking-[0.28em] text-stone-500">
            Crediconfiemos
          </p>
          <h1 className="mt-4 text-3xl font-semibold text-stone-900">
            Cargando sesion...
          </h1>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return <>{children}</>;
}
