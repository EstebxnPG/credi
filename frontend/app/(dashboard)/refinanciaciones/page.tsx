"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

type Estado = "programado" | "disponible" | "contactado" | "aceptado" | "rechazado" | "convertido";
type Vista = "hoy" | "proximos" | "gestionados" | "convertidos" | "todos";

type Item = {
  credito_id: number;
  pensionado_nombre: string | null;
  documento: string | null;
  cooperativa_nombre: string | null;
  simulador_url: string | null;
  monto_aprobado: number | null;
  plazo: number;
  fecha_base: string;
  disponible_desde: string;
  meses_transcurridos: number;
  meses_requeridos: number | null;
  tipo_liberacion: "meses" | "porcentaje";
  porcentaje_avance: number | null;
  porcentaje_requerido: number | null;
  estado_refinanciacion: string;
  oportunidad_id: number;
  estado_comercial: Estado;
  reactivar_en: string | null;
  credito_nuevo_id: number | null;
};

const tabs: Array<{ key: Vista; label: string }> = [
  { key: "hoy", label: "Disponibles ahora" },
  { key: "proximos", label: "Proximos" },
  { key: "gestionados", label: "En gestion" },
  { key: "convertidos", label: "Convertidos" },
  { key: "todos", label: "Todos" },
];

export default function RefinanciacionesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState("");
  const [vista, setVista] = useState<Vista>("hoy");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<Item | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setItems(await apiFetch<Item[]>("/api/v1/refinanciaciones/elegibles/?limit=15"));
      } catch (loadError) {
        setError(
          loadError instanceof ApiError
            ? loadError.message
            : "No se pudieron cargar las oportunidades",
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const counts = useMemo(
    () => ({
      hoy: items.filter(
        (item) =>
          item.estado_refinanciacion === "Listo" &&
          !["convertido", "rechazado"].includes(item.estado_comercial),
      ).length,
      proximos: items.filter((item) => item.estado_comercial === "programado").length,
      gestionados: items.filter((item) =>
        ["contactado", "aceptado", "rechazado"].includes(item.estado_comercial),
      ).length,
      convertidos: items.filter((item) => item.estado_comercial === "convertido").length,
    }),
    [items],
  );

  const filtered = useMemo(() => {
    const term = query.toLowerCase().trim();

    return items.filter((item) => {
      const matchesView =
        vista === "todos" ||
        (vista === "hoy" &&
          item.estado_refinanciacion === "Listo" &&
          !["convertido", "rechazado"].includes(item.estado_comercial)) ||
        (vista === "proximos" && item.estado_comercial === "programado") ||
        (vista === "gestionados" &&
          ["contactado", "aceptado", "rechazado"].includes(item.estado_comercial)) ||
        (vista === "convertidos" && item.estado_comercial === "convertido");

      if (!matchesView) {
        return false;
      }

      return (
        !term ||
        [item.credito_id, item.pensionado_nombre, item.documento, item.cooperativa_nombre].some(
          (value) => String(value ?? "").toLowerCase().includes(term),
        )
      );
    });
  }, [items, query, vista]);

  async function change(item: Item, estado: Estado, justificacion?: string) {
    setSavingId(item.oportunidad_id);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiFetch<{ estado: Estado; reactivar_en: string | null }>(
        `/api/v1/refinanciaciones/oportunidades/${item.oportunidad_id}/estado`,
        {
          method: "PATCH",
          body: JSON.stringify({ estado, justificacion }),
        },
      );

      setItems((current) =>
        current.map((currentItem) =>
          currentItem.credito_id === item.credito_id
            ? {
                ...currentItem,
                estado_comercial: response.estado,
                reactivar_en: response.reactivar_en,
              }
            : currentItem,
        ),
      );
      setSuccess(`Credito #${item.credito_id}: estado actualizado a ${response.estado}.`);
      window.dispatchEvent(new Event("notifications-updated"));
    } catch (changeError) {
      setError(
        changeError instanceof ApiError
          ? changeError.message
          : "No se pudo actualizar la oportunidad",
      );
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return <Message text="Cargando refinanciaciones..." />;
  }

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border bg-white/85 p-5">
        <p className="text-xs font-semibold uppercase tracking-[.22em] text-stone-500">
          Operacion comercial
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Refinanciaciones</h1>
        <p className="mt-2 text-sm text-stone-600">
          Oportunidades liberadas segun las reglas de cada cooperativa.
        </p>
      </header>

      {error ? <Message tone="error" text={error} /> : null}
      {success ? <Message tone="success" text={success} /> : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Disponibles ahora" value={counts.hoy} />
        <Metric label="Proximos" value={counts.proximos} />
        <Metric label="En gestion" value={counts.gestionados} />
        <Metric label="Convertidos" value={counts.convertidos} />
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setVista(tab.key)}
            className={
              vista === tab.key
                ? "rounded-lg bg-teal-950 px-3 py-2 text-sm text-white"
                : "rounded-lg border bg-white px-3 py-2 text-sm text-stone-700"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      <input
        className="input-base max-w-lg"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar credito, pensionado, documento o cooperativa"
      />

      <div className="overflow-x-auto border-y bg-white/80">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-stone-50 text-xs uppercase text-stone-500">
            <tr>
              {["Credito", "Pensionado", "Cooperativa", "Tentativa para refi", "Estado", "Gestion"].map(
                (header) => (
                  <th key={header} className="px-4 py-3">
                    {header}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((item) => (
              <tr key={item.credito_id}>
                <td className="px-4 py-3 font-semibold">#{item.credito_id}</td>
                <td className="px-4 py-3">
                  <p>{item.pensionado_nombre}</p>
                  <p className="text-xs text-stone-500">{item.documento}</p>
                </td>
                <td className="px-4 py-3">
                  <p>{item.cooperativa_nombre}</p>
                  {item.simulador_url ? (
                    <a
                      className="mt-1 inline-flex text-xs font-semibold text-teal-700 hover:underline"
                      href={item.simulador_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir simuladora
                    </a>
                  ) : (
                    <p className="mt-1 text-xs text-stone-400">Sin simuladora</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <p>{formatDate(item.disponible_desde)}</p>
                  <p className="text-xs text-stone-500">
                    Base {formatDate(item.fecha_base)} - {formatCurrency(item.monto_aprobado)}
                  </p>
                  <p className="text-xs text-stone-500">
                    {item.tipo_liberacion === "porcentaje"
                      ? `${item.porcentaje_avance ?? 0}% / ${item.porcentaje_requerido ?? 0}%`
                      : `${item.meses_transcurridos} / ${item.meses_requeridos ?? 0} meses`}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <Badge estado={item.estado_comercial} />
                  {item.estado_comercial === "rechazado" && item.reactivar_en ? (
                    <p className="mt-1 text-xs text-stone-500">
                      Alerta: {formatDateTime(item.reactivar_en)}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <div className="flex min-w-72 flex-wrap gap-1.5">
                    {item.estado_refinanciacion === "Listo" &&
                    ["disponible", "contactado", "aceptado"].includes(item.estado_comercial) ? (
                      <>
                        {item.estado_comercial === "disponible" ? (
                          <Action
                            disabled={savingId === item.oportunidad_id}
                            text="Contactado"
                            onClick={() => void change(item, "contactado")}
                          />
                        ) : null}
                        {["disponible", "contactado"].includes(item.estado_comercial) ? (
                          <>
                            <Action
                              disabled={savingId === item.oportunidad_id}
                              text="Aceptado"
                              onClick={() => void change(item, "aceptado")}
                            />
                            <Action
                              disabled={savingId === item.oportunidad_id}
                              text="Rechazado"
                              onClick={() => setRejecting(item)}
                            />
                          </>
                        ) : null}
                        {item.estado_comercial === "aceptado" ? (
                          <Link
                            className="button-primary px-2.5 py-1.5 text-xs"
                            href={`/creditos?refinanciar=${item.credito_id}`}
                          >
                            Refinanciar
                          </Link>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}

            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-stone-500">
                  No hay oportunidades en esta vista.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {rejecting ? (
        <RejectModal
          item={rejecting}
          saving={savingId === rejecting.oportunidad_id}
          onClose={() => setRejecting(null)}
          onConfirm={async (reason) => {
            await change(rejecting, "rechazado", reason);
            setRejecting(null);
          }}
        />
      ) : null}
    </section>
  );
}

function Badge({ estado }: { estado: Estado }) {
  const tone: Record<Estado, string> = {
    programado: "bg-sky-50 text-sky-700 border-sky-200",
    disponible: "bg-emerald-50 text-emerald-700 border-emerald-200",
    contactado: "bg-amber-50 text-amber-700 border-amber-200",
    aceptado: "bg-teal-50 text-teal-700 border-teal-200",
    rechazado: "bg-rose-50 text-rose-700 border-rose-200",
    convertido: "bg-violet-50 text-violet-700 border-violet-200",
  };

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${tone[estado]}`}>
      {estado}
    </span>
  );
}

function Action({
  text,
  onClick,
  disabled,
}: {
  text: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="button-muted px-2.5 py-1.5 text-xs disabled:opacity-40"
    >
      {disabled ? "Guardando..." : text}
    </button>
  );
}

function RejectModal({
  item,
  saving,
  onClose,
  onConfirm,
}: {
  item: Item;
  saving: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <h2 className="text-lg font-semibold">Rechazar oportunidad #{item.credito_id}</h2>
        <p className="mt-2 text-sm text-stone-600">
          La oportunidad seguira visible y la alerta reaparecera dentro de 20 dias.
        </p>
        <label className="mt-4 block text-sm font-medium">
          Motivo
          <textarea
            autoFocus
            className="input-base mt-1 min-h-28"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explica por que no continuara ahora"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="button-muted" disabled={saving} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={saving || !reason.trim()}
            onClick={() => void onConfirm(reason.trim())}
          >
            {saving ? "Guardando..." : "Confirmar rechazo"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-b px-1 py-3">
      <p className="text-xs uppercase tracking-wider text-stone-500">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

function Message({
  text,
  tone = "default",
}: {
  text: string;
  tone?: "default" | "error" | "success";
}) {
  return (
    <div
      className={
        tone === "error"
          ? "border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          : tone === "success"
            ? "border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
            : "border bg-white p-4 text-sm text-stone-500"
      }
    >
      {text}
    </div>
  );
}
