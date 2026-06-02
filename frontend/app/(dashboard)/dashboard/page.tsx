"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { readSession, type SessionUser } from "@/lib/session";

type Credito = {
  id: number;
  estado: string;
  monto_solicitado: number;
  monto_aprobado: number | null;
  tiene_documentos_pendientes?: boolean;
  created_at: string;
};

type Seguimiento = {
  id: number;
  tipo: string;
  resultado: string | null;
  fecha_proximo_contacto: string | null;
};

const estadosActivos = [
  "Prospecto",
  "Enviado a cooperativa",
  "Devuelto por correccion",
  "Devuelto por corrección",
  "Reenviado",
  "Aprobado",
];

function formatCurrency(value: number | null) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function isDevuelto(estado: string) {
  return estado.toLowerCase().includes("devuelto");
}

export default function DashboardPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const accessToken = session?.accessToken;

  useEffect(() => {
    setSession(readSession());
  }, []);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let ignore = false;
    const controller = new AbortController();

    async function loadDashboard() {
      setLoading(true);
      setError(null);

      try {
        const [creditosData, seguimientosData] = await Promise.all([
          apiFetch<Credito[]>("/api/v1/creditos/", {
            signal: controller.signal,
          }),
          apiFetch<Seguimiento[]>("/api/v1/seguimientos/", {
            signal: controller.signal,
          }),
        ]);

        if (!ignore) {
          setCreditos(creditosData);
          setSeguimientos(seguimientosData);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(
            loadError instanceof ApiError
              ? loadError.message
              : "No se pudo cargar el inicio operativo",
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    const timeout = window.setTimeout(() => {
      controller.abort();
    }, 10000);

    void loadDashboard();

    return () => {
      ignore = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [accessToken]);

  const resumen = useMemo(() => {
    const activos = creditos.filter((credito) => estadosActivos.includes(credito.estado));
    const devueltos = creditos.filter((credito) => isDevuelto(credito.estado));
    const documentosPendientes = creditos.filter(
      (credito) => credito.tiene_documentos_pendientes,
    );
    const seguimientosProgramados = seguimientos.filter(
      (seguimiento) => seguimiento.fecha_proximo_contacto,
    );
    const montoSolicitado = creditos.reduce(
      (total, credito) => total + Number(credito.monto_solicitado),
      0,
    );
    const montoAprobado = creditos.reduce(
      (total, credito) => total + Number(credito.monto_aprobado ?? 0),
      0,
    );

    return {
      activos,
      devueltos,
      documentosPendientes,
      seguimientosProgramados,
      montoSolicitado,
      montoAprobado,
    };
  }, [creditos, seguimientos]);

  if (loading) {
    return <EmptyState text="Cargando inicio operativo..." />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-50 px-5 py-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-stone-500">
          Inicio
        </p>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-stone-950">
              Base limpia para reconstruir la operacion
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              Dashboard analitico 
            </p>
          </div>
          <div className="rounded-xl border border-stone-800/10 bg-white/70 px-4 py-3 text-sm text-stone-600">
            Usuario: <span className="font-semibold text-stone-900">{session?.nombre}</span>
          </div>
        </div>
      </article>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Creditos activos" value={String(resumen.activos.length)} />
        <Metric label="Devueltos" value={String(resumen.devueltos.length)} tone="text-red-700" />
        <Metric
          label="Docs pendientes"
          value={String(resumen.documentosPendientes.length)}
          tone="text-amber-700"
        />
        <Metric label="Seguimientos" value={String(resumen.seguimientosProgramados.length)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
          <h2 className="text-lg font-semibold text-stone-950">Cartera visible</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <DetailRow label="Solicitado" value={formatCurrency(resumen.montoSolicitado)} />
            <DetailRow label="Aprobado" value={formatCurrency(resumen.montoAprobado)} />
          </div>
        </article>

        <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
          <h2 className="text-lg font-semibold text-stone-950">Estado del frontend</h2>
          <div className="mt-4 space-y-2">
            <StatusLine text="Login conservado" />
            <StatusLine text="Dashboard conservado" />
            <StatusLine text="Vistas del navbar eliminadas" />
          </div>
        </article>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  tone = "text-stone-950",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-stone-800/10 bg-white/75 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-800/10 bg-white/65 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-stone-900">{value}</p>
    </div>
  );
}

function StatusLine({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-stone-800/10 bg-white/65 px-4 py-3 text-sm font-medium text-stone-700">
      {text}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-800/15 bg-white/45 px-5 py-6 text-center text-sm text-stone-500">
      {text}
    </div>
  );
}
