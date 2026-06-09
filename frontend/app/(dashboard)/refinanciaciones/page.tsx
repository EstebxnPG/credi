"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";

type RefinanciacionElegible = {
  credito_id: number;
  pensionado_id: number;
  pensionado_nombre: string | null;
  documento: string | null;
  cooperativa_nombre: string | null;
  monto_aprobado: number | null;
  plazo: number;
  fecha_base: string;
  disponible_desde: string;
  meses_transcurridos: number;
  meses_requeridos: number;
  estado_refinanciacion: string;
};

export default function RefinanciacionesPage() {
  const [items, setItems] = useState<RefinanciacionElegible[]>([]);
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadItems() {
      setLoading(true);
      setError(null);
      try {
        setItems(await apiFetch<RefinanciacionElegible[]>("/api/v1/refinanciaciones/elegibles/"));
      } catch (loadError) {
        setError(loadError instanceof ApiError ? loadError.message : "No se pudo cargar refinanciaciones");
      } finally {
        setLoading(false);
      }
    }
    void loadItems();
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => {
      const disponible = item.disponible_desde.slice(0, 10);
      const matchesDate = (!dateFrom || disponible >= dateFrom) && (!dateTo || disponible <= dateTo);
      const matchesQuery =
        !term ||
        [
          item.credito_id,
          item.pensionado_nombre,
          item.documento,
          item.cooperativa_nombre,
          item.monto_aprobado,
          item.plazo,
        ]
          .filter((value) => value !== null && value !== undefined)
          .some((value) => String(value).toLowerCase().includes(term));
      return matchesDate && matchesQuery;
    });
  }, [items, query, dateFrom, dateTo]);

  const totalMonto = filtered.reduce((total, item) => total + Number(item.monto_aprobado ?? 0), 0);
  const cooperativas = new Set(filtered.map((item) => item.cooperativa_nombre).filter(Boolean)).size;

  return (
    <section className="space-y-4">
      <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-stone-500">Operacion</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-stone-950">Refinanciaciones</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              Creditos aprobados con fecha estimada de refinanciacion segun regla configurada por plazo.
            </p>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-3 lg:w-auto">
            <input className="input-base" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar credito, pensionado, documento" />
            <input className="input-base" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            <input className="input-base" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </div>
        </div>
      </article>

      {!loading && !error ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Creditos filtrados" value={String(filtered.length)} />
          <Metric label="Monto aprobado" value={formatCurrency(totalMonto)} />
          <Metric label="Cooperativas" value={String(cooperativas)} />
        </div>
      ) : null}

      {loading ? <StateMessage text="Cargando refinanciaciones..." /> : null}
      {error ? <StateMessage tone="error" text={error} /> : null}

      {!loading && !error ? (
        <div className="overflow-hidden rounded-2xl border border-stone-800/10 bg-white/85 shadow-lg shadow-stone-900/5">
          <div className="hidden grid-cols-[0.7fr_1.3fr_1fr_1fr_0.9fr_120px] gap-3 border-b border-stone-800/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 md:grid">
            <span>Credito</span><span>Pensionado</span><span>Cooperativa</span><span>Disponible</span><span>Regla</span><span className="text-right">Accion</span>
          </div>
          <div className="divide-y divide-stone-800/10">
            {filtered.map((item) => (
              <div key={item.credito_id} className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[0.7fr_1.3fr_1fr_1fr_0.9fr_120px] md:items-center md:py-3">
                <span className="font-semibold text-stone-950">#{item.credito_id}</span>
                <div><p className="font-medium text-stone-900">{item.pensionado_nombre ?? "Sin nombre"}</p><p className="mt-1 text-xs text-stone-500">{item.documento ?? "Sin documento"}</p></div>
                <span className="text-stone-700">{item.cooperativa_nombre ?? "Sin cooperativa"}</span>
                <div>
                  <p className="font-medium text-stone-800">{formatDate(item.disponible_desde)}</p>
                  <p className="mt-1 text-xs text-stone-500">Base {formatDate(item.fecha_base)} - {formatCurrency(item.monto_aprobado)}</p>
                </div>
                <span className="text-stone-700">
                  {item.meses_transcurridos}/{item.meses_requeridos} meses
                  <span className="mt-1 block text-xs text-stone-500">{item.estado_refinanciacion}</span>
                </span>
                <div className="md:text-right"><Link className="button-muted px-3 py-2 text-sm" href={`/creditos/${item.credito_id}`}>Ver</Link></div>
              </div>
            ))}
            {filtered.length === 0 ? <p className="px-4 py-8 text-center text-sm text-stone-500">No hay creditos para los filtros actuales.</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-stone-800/10 bg-white/85 px-5 py-4 shadow-lg shadow-stone-900/5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{label}</p><p className="mt-2 text-xl font-semibold text-stone-950">{value}</p></div>;
}

function StateMessage({ text, tone = "default" }: { text: string; tone?: "default" | "error" }) {
  return <div className={["rounded-2xl border px-5 py-4 text-sm", tone === "error" ? "border-red-500/20 bg-red-50 text-red-700" : "border-stone-800/10 bg-white/65 text-stone-500"].join(" ")}>{text}</div>;
}
