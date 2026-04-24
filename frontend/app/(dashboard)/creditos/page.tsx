"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError, apiFetch } from "@/lib/api";
import { readSession } from "@/lib/session";

type Credito = {
  id: number;
  pensionado_id: number;
  asesor_id: number;
  oficina_id: number;
  cooperativa_id: number;
  pagaduria_id: number;
  monto_solicitado: number;
  monto_aprobado: number | null;
  plazo: number;
  estado: string;
  observaciones: string | null;
  created_at: string;
};

type HistorialItem = {
  id: number;
  usuario_nombre: string | null;
  estado_anterior: string | null;
  estado_nuevo: string;
  observacion: string | null;
  created_at: string;
};

const estadoOptions = [
  "Todos",
  "Prospecto",
  "Enviado a cooperativa",
  "Devuelto por correccion",
  "Reenviado",
  "Aprobado",
  "Rechazado",
];

function formatCurrency(value: number | null) {
  if (value === null) {
    return "Sin monto";
  }

  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function CreditosPage() {
  const router = useRouter();
  const [estado, setEstado] = useState("Todos");
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [historial, setHistorial] = useState<HistorialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCredito = useMemo(
    () => creditos.find((credito) => credito.id === selectedId) ?? null,
    [creditos, selectedId],
  );

  useEffect(() => {
    const session = readSession();
    if (!session) {
      router.replace("/login?message=Inicia sesion para consultar creditos");
      return;
    }

    let ignore = false;

    async function loadCreditos() {
      setLoading(true);
      setError(null);

      try {
        const query =
          estado !== "Todos"
            ? `?estado=${encodeURIComponent(estado)}`
            : "";
        const data = await apiFetch<Credito[]>(`/api/v1/creditos/${query}`);

        if (ignore) {
          return;
        }

        setCreditos(data);
        setSelectedId((current) => {
          if (current && data.some((credito) => credito.id === current)) {
            return current;
          }
          return data[0]?.id ?? null;
        });
      } catch (loadError) {
        if (ignore) {
          return;
        }

        const message =
          loadError instanceof ApiError
            ? loadError.message
            : "No se pudieron cargar los creditos";
        setError(message);
        setCreditos([]);
        setSelectedId(null);
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadCreditos();

    return () => {
      ignore = true;
    };
  }, [estado, router]);

  useEffect(() => {
    if (!selectedId) {
      setHistorial([]);
      return;
    }

    let ignore = false;

    async function loadHistory() {
      setLoadingHistory(true);

      try {
        const data = await apiFetch<HistorialItem[]>(
          `/api/v1/creditos/${selectedId}/historial`,
        );

        if (!ignore) {
          setHistorial(data);
        }
      } catch {
        if (!ignore) {
          setHistorial([]);
        }
      } finally {
        if (!ignore) {
          setLoadingHistory(false);
        }
      }
    }

    void loadHistory();

    return () => {
      ignore = true;
    };
  }, [selectedId]);

  const resumen = useMemo(() => {
    return {
      total: creditos.length,
      prospectos: creditos.filter((item) => item.estado === "Prospecto").length,
      enviados: creditos.filter((item) =>
        ["Enviado a cooperativa", "Reenviado"].includes(item.estado),
      ).length,
      finales: creditos.filter((item) =>
        ["Aprobado", "Rechazado"].includes(item.estado),
      ).length,
    };
  }, [creditos]);

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <article className="glass-panel p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-stone-500">
                Modulo conectado
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
                Creditos en tiempo real
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600">
                Esta pantalla ya consume el backend real. Puedes filtrar por
                estado, revisar el detalle y consultar el historial del credito
                seleccionado.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <select
                className="input-base min-w-[220px]"
                value={estado}
                onChange={(event) => setEstado(event.target.value)}
              >
                {estadoOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button-muted"
                onClick={() => setEstado("Todos")}
              >
                Limpiar filtro
              </button>
            </div>
          </div>
        </article>

        <article className="glass-panel p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
            Resumen visible
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <MetricCard label="Total" value={String(resumen.total)} />
            <MetricCard label="Prospectos" value={String(resumen.prospectos)} />
            <MetricCard label="En gestion" value={String(resumen.enviados)} />
            <MetricCard label="Finalizados" value={String(resumen.finales)} />
          </div>
        </article>
      </div>

      {error ? (
        <div className="rounded-3xl border border-red-500/20 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <article className="glass-panel overflow-hidden">
          <div className="border-b border-stone-800/10 px-6 py-5">
            <h2 className="text-xl font-semibold text-stone-950">
              Listado de creditos
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Selecciona un credito para revisar detalle e historial.
            </p>
          </div>

          <div className="space-y-3 p-4">
            {loading ? (
              <EmptyState text="Cargando creditos..." />
            ) : creditos.length === 0 ? (
              <EmptyState text="No hay creditos para el filtro actual." />
            ) : (
              creditos.map((credito) => {
                const active = credito.id === selectedId;

                return (
                  <button
                    key={credito.id}
                    type="button"
                    onClick={() => setSelectedId(credito.id)}
                    className={[
                      "w-full rounded-3xl border px-5 py-4 text-left transition",
                      active
                        ? "border-teal-700/20 bg-teal-950 text-white shadow-xl shadow-teal-950/15"
                        : "border-stone-800/10 bg-white/65 hover:bg-white/90",
                    ].join(" ")}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] opacity-70">
                          Credito #{credito.id}
                        </p>
                        <h3 className="mt-2 text-xl font-semibold">
                          {formatCurrency(credito.monto_solicitado)}
                        </h3>
                      </div>
                      <span
                        className={[
                          "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
                          active
                            ? "bg-white/15 text-white"
                            : "bg-stone-900/5 text-stone-600",
                        ].join(" ")}
                      >
                        {credito.estado}
                      </span>
                    </div>

                    <div
                      className={[
                        "mt-4 grid gap-2 text-sm sm:grid-cols-3",
                        active ? "text-teal-50/85" : "text-stone-600",
                      ].join(" ")}
                    >
                      <p>Pensionado #{credito.pensionado_id}</p>
                      <p>Plazo: {credito.plazo} meses</p>
                      <p>Oficina #{credito.oficina_id}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </article>

        <div className="space-y-4">
          <article className="glass-panel p-6">
            <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
              Detalle rapido
            </p>

            {!selectedCredito ? (
              <EmptyState text="Selecciona un credito para ver su informacion." />
            ) : (
              <div className="mt-4 space-y-4">
                <DetailRow label="Estado" value={selectedCredito.estado} />
                <DetailRow
                  label="Monto solicitado"
                  value={formatCurrency(selectedCredito.monto_solicitado)}
                />
                <DetailRow
                  label="Monto aprobado"
                  value={formatCurrency(selectedCredito.monto_aprobado)}
                />
                <DetailRow
                  label="Creado"
                  value={formatDate(selectedCredito.created_at)}
                />
                <DetailRow
                  label="Observaciones"
                  value={selectedCredito.observaciones ?? "Sin observaciones"}
                />
              </div>
            )}
          </article>

          <article className="glass-panel p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
                  Historial
                </p>
                <h2 className="mt-2 text-xl font-semibold text-stone-950">
                  Traza del credito
                </h2>
              </div>
              {loadingHistory ? (
                <span className="text-sm text-stone-500">Actualizando...</span>
              ) : null}
            </div>

            <div className="mt-5 space-y-3">
              {!selectedCredito ? (
                <EmptyState text="Sin credito seleccionado." />
              ) : historial.length === 0 ? (
                <EmptyState text="Este credito aun no tiene historial visible." />
              ) : (
                historial.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-3xl border border-stone-800/10 bg-white/65 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                          {item.estado_anterior ?? "Inicio"} {" -> "} {item.estado_nuevo}
                        </p>
                        <p className="mt-2 text-base font-semibold text-stone-900">
                          {item.usuario_nombre ?? "Usuario desconocido"}
                        </p>
                      </div>
                      <p className="text-xs text-stone-500">
                        {formatDate(item.created_at)}
                      </p>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-stone-600">
                      {item.observacion ?? "Sin observacion registrada."}
                    </p>
                  </div>
                ))
              )}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-panel p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-stone-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-stone-950">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-800/10 bg-white/65 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.22em] text-stone-500">{label}</p>
      <p className="mt-2 text-sm leading-6 text-stone-800">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-stone-800/15 bg-white/40 px-5 py-8 text-center text-sm text-stone-500">
      {text}
    </div>
  );
}
