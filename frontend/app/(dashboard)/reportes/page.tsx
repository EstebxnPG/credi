"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError, apiFetch } from "@/lib/api";
import { readSession } from "@/lib/session";

type ReporteResumen = {
  generado_en: string;
  alcance: string;
  kpis: {
    creditos_total: number;
    creditos_mes: number;
    creditos_activos: number;
    creditos_aprobados: number;
    creditos_aprobados_mes: number;
    tasa_aprobacion: number;
    refinanciaciones: number;
    cumpleanos_30_dias: number;
  };
  creditos_por_estado: Array<{ estado: string; total: number }>;
  productividad_asesoras: Array<{ nombre: string; creditos: number }>;
  productividad_oficinas: Array<{ nombre: string; creditos: number }>;
  cooperativas: Array<{
    nombre: string;
    total: number;
    aprobados: number;
    tasa_aprobacion: number;
  }>;
  cumpleanos_proximos: Array<{
    id: number;
    nombre: string;
    documento: string;
    fecha_nacimiento: string;
  }>;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function ReportesPage() {
  const router = useRouter();
  const [resumen, setResumen] = useState<ReporteResumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = readSession();
    if (!session) {
      router.replace("/login?message=Inicia sesión para consultar reportes");
      return;
    }

    async function loadReportes() {
      setLoading(true);
      setError(null);

      try {
        const data = await apiFetch<ReporteResumen>("/api/v1/reportes/resumen");
        setResumen(data);
      } catch (loadError) {
        setError(
          loadError instanceof ApiError
            ? loadError.message
            : "No se pudo cargar el resumen de reportes",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadReportes();
  }, [router]);

  const maxEstado = useMemo(() => {
    if (!resumen?.creditos_por_estado.length) {
      return 1;
    }
    return Math.max(...resumen.creditos_por_estado.map((item) => item.total), 1);
  }, [resumen]);

  if (loading) {
    return <EmptyState text="Cargando reportes estratégicos..." />;
  }

  if (error || !resumen) {
    return (
      <div className="rounded-3xl border border-red-500/20 bg-red-50 px-5 py-4 text-sm text-red-700">
        {error ?? "No hay datos de reportes disponibles."}
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <article className="glass-panel overflow-hidden">
        <div className="grid gap-5 p-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-stone-500">
              Analítica operativa
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
              Reportes estratégicos conectados
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-600">
              Esta primera versión ya resume créditos, aprobación, productividad,
              cooperativas, refinanciaciones y cumpleaños desde la base de datos.
              La exportación Excel/PDF queda como siguiente incremento.
            </p>
          </div>

          <div className="rounded-3xl border border-stone-800/10 bg-white/70 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
              Corte del reporte
            </p>
            <p className="mt-3 text-lg font-semibold text-stone-950">
              {formatDateTime(resumen.generado_en)}
            </p>
            <p className="mt-2 text-sm text-stone-600">
              Alcance: {resumen.alcance === "global" ? "toda la operación" : "asesora actual"}
            </p>
          </div>
        </div>
      </article>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Créditos total" value={String(resumen.kpis.creditos_total)} />
        <MetricCard label="Créditos del mes" value={String(resumen.kpis.creditos_mes)} />
        <MetricCard label="Aprobación" value={`${resumen.kpis.tasa_aprobacion}%`} />
        <MetricCard label="Aprobados del mes" value={String(resumen.kpis.creditos_aprobados_mes)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <article className="glass-panel p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
                Embudo
              </p>
              <h2 className="mt-2 text-xl font-semibold text-stone-950">
                Créditos por estado
              </h2>
            </div>
            <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
              {resumen.kpis.creditos_activos} activos
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {resumen.creditos_por_estado.length === 0 ? (
              <EmptyState text="Aún no hay créditos registrados." />
            ) : (
              resumen.creditos_por_estado.map((item) => (
                <div key={item.estado} className="rounded-3xl border border-stone-800/10 bg-white/65 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-stone-900">{item.estado}</p>
                    <p className="text-sm text-stone-600">{item.total}</p>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200">
                    <div
                      className="h-full rounded-full bg-teal-700"
                      style={{ width: `${Math.max((item.total / maxEstado) * 100, 8)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="glass-panel p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
            Indicadores SRS
          </p>
          <div className="mt-5 space-y-3">
            <DetailRow label="Aprobados total" value={String(resumen.kpis.creditos_aprobados)} />
            <DetailRow label="Aprobados mes" value={String(resumen.kpis.creditos_aprobados_mes)} />
            <DetailRow label="Refinanciaciones" value={String(resumen.kpis.refinanciaciones)} />
            <DetailRow label="Cumpleaños próximos 30 días" value={String(resumen.kpis.cumpleanos_30_dias)} />
          </div>
        </article>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ListPanel
          title="Productividad por asesora"
          empty="Sin asesoras con créditos."
          items={resumen.productividad_asesoras.map((item) => ({
            label: item.nombre,
            value: `${item.creditos} créditos`,
          }))}
        />
        <ListPanel
          title="Productividad por oficina"
          empty="Sin oficinas con créditos."
          items={resumen.productividad_oficinas.map((item) => ({
            label: item.nombre,
            value: `${item.creditos} créditos`,
          }))}
        />
        <ListPanel
          title="Cooperativas"
          empty="Sin cooperativas con créditos."
          items={resumen.cooperativas.map((item) => ({
            label: item.nombre,
            value: `${item.tasa_aprobacion}% aprobación`,
          }))}
        />
      </div>

      <article className="glass-panel p-6">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
          Gestión comercial
        </p>
        <h2 className="mt-2 text-xl font-semibold text-stone-950">
          Cumpleaños próximos 30 días
        </h2>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {resumen.cumpleanos_proximos.length === 0 ? (
            <EmptyState text="No hay cumpleaños próximos registrados." />
          ) : (
            resumen.cumpleanos_proximos.map((item) => (
              <div key={item.id} className="rounded-3xl border border-stone-800/10 bg-white/65 p-4">
                <p className="text-base font-semibold text-stone-950">{item.nombre}</p>
                <p className="mt-2 text-sm text-stone-600">Documento: {item.documento}</p>
                <p className="mt-1 text-sm text-stone-600">
                  Nacimiento: {item.fecha_nacimiento}
                </p>
              </div>
            ))
          )}
        </div>
      </article>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="glass-panel p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-stone-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">{value}</p>
    </article>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-800/10 bg-white/65 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.2em] text-stone-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-stone-900">{value}</p>
    </div>
  );
}

function ListPanel({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <article className="glass-panel p-6">
      <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
        Ranking
      </p>
      <h2 className="mt-2 text-xl font-semibold text-stone-950">{title}</h2>
      <div className="mt-5 space-y-3">
        {items.length === 0 ? (
          <EmptyState text={empty} />
        ) : (
          items.map((item) => (
            <div key={`${item.label}-${item.value}`} className="rounded-3xl border border-stone-800/10 bg-white/65 p-4">
              <p className="text-sm font-semibold text-stone-950">{item.label}</p>
              <p className="mt-2 text-sm text-stone-600">{item.value}</p>
            </div>
          ))
        )}
      </div>
    </article>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-stone-800/15 bg-white/40 px-5 py-8 text-center text-sm text-stone-500">
      {text}
    </div>
  );
}
