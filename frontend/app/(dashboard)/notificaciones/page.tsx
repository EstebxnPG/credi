"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type Estado = "pendiente" | "en_progreso" | "pospuesta" | "resuelta" | "descartada";

type Item = {
  id: number;
  clase: "accion" | "informativa";
  estado: Estado;
  titulo: string;
  mensaje: string;
  prioridad: string;
  href: string;
  fecha: string;
  leida: boolean;
  oficina_id: number;
  responsable_id: number | null;
  responsable_nombre: string | null;
  pospuesta_hasta: string | null;
};

type Page = {
  items: Item[];
  total: number;
  page: number;
  page_size: number;
  unread: number;
};

const estados = ["", "pendiente", "en_progreso", "pospuesta", "resuelta", "descartada"];

export default function NotificationsPage() {
  const [data, setData] = useState<Page>({ items: [], total: 0, page: 1, page_size: 25, unread: 0 });
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [state, setState] = useState("");
  const [kind, setKind] = useState("");
  const [priority, setPriority] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ page: String(page), page_size: "25" });
      if (state) query.set("estado", state);
      if (kind) query.set("clase", kind);
      if (priority) query.set("prioridad", priority);
      if (search) query.set("texto", search);

      setData(await apiFetch<Page>(`/api/v1/notificaciones/?${query}`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudieron cargar las alertas");
    }
  }, [kind, page, priority, search, state]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));
  const canGoNext = page < totalPages;

  function goToPage(value: string) {
    const nextPage = Number(value);
    if (!Number.isFinite(nextPage) || nextPage < 1) {
      setPageInput(String(page));
      return;
    }

    const normalizedPage = Math.min(totalPages, Math.floor(nextPage));
    setPage(normalizedPage);
    setPageInput(String(normalizedPage));
  }

  const paginationControls = (
    <div className="flex flex-col gap-3 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between">
      <p>
        Pagina {page} de {totalPages}. Mostrando {data.items.length} de {data.total} notificaciones.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button className="button-muted px-3 py-2 text-xs" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
          Anterior
        </button>
        <label className="flex items-center gap-2">
          Ir a
          <input className="input-base h-9 w-20 px-2 py-1 text-sm" max={totalPages} min="1" type="number" value={pageInput} onBlur={() => goToPage(pageInput)} onChange={(event) => { const value = event.target.value; if (/^\d*$/.test(value)) setPageInput(value); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
        </label>
        <button className="button-muted px-3 py-2 text-xs" disabled={!canGoNext} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
          Siguiente
        </button>
      </div>
    </div>
  );

  async function action(item: Item, next: Estado) {
    let justificacion: string | undefined;
    if (next === "descartada") {
      justificacion = window.prompt("Justificación obligatoria")?.trim();
      if (!justificacion) return;
    }

    const body: { estado: Estado; justificacion?: string; pospuesta_hasta?: string } = {
      estado: next,
      justificacion,
    };
    if (next === "pospuesta") {
      body.pospuesta_hasta = new Date(Date.now() + 86400000).toISOString();
    }

    setSaving(item.id);
    try {
      await apiFetch(`/api/v1/notificaciones/${item.id}/estado`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      window.dispatchEvent(new Event("notifications-updated"));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo actualizar la notificación");
    } finally {
      setSaving(null);
    }
  }

  async function read(item: Item) {
    if (!item.leida) {
      await apiFetch(`/api/v1/notificaciones/${item.id}/leer`, { method: "PATCH" });
      window.dispatchEvent(new Event("notifications-updated"));
    }
  }

  async function markAllRead() {
    try {
      await apiFetch("/api/v1/notificaciones/leer-todas", { method: "PATCH" });
      window.dispatchEvent(new Event("notifications-updated"));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudieron marcar las notificaciones");
    }
  }

  return (
    <section className="space-y-3">
      <header className="border-b pb-3">
        <p className="text-xs font-semibold uppercase tracking-[.22em] text-stone-500">Centro de trabajo</p>
        <h1 className="mt-2 text-xl font-semibold">Alertas y notificaciones</h1>
      </header>

      {error ? <p className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Sin leer" value={data.unread} />
        <Metric label="Resultados" value={data.total} />
        <Metric label="Página" value={data.page} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input-base max-w-xs"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Buscar"
        />
        <select
          className="input-base max-w-52"
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setPage(1);
          }}
        >
          {estados.map((estado) => (
            <option key={estado} value={estado}>
              {estado || "Abiertas ahora"}
            </option>
          ))}
        </select>
        <select
          className="input-base max-w-52"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas las clases</option>
          <option value="accion">Acción</option>
          <option value="informativa">Informativa</option>
        </select>
        <select
          className="input-base max-w-52"
          value={priority}
          onChange={(e) => {
            setPriority(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Prioridades</option>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baja">Baja</option>
        </select>
        <button
          type="button"
          className="button-muted"
          disabled={data.unread === 0}
          onClick={() => void markAllRead()}
        >
          Marcar todas como leídas
        </button>
      </div>

      <div className="rounded-lg border border-stone-800/10 bg-white px-3 py-3 shadow-sm">
        {paginationControls}
      </div>

      <div className="divide-y border-y bg-white/80">
        {data.items.map((item) => (
          <article key={item.id} className={item.leida ? "p-4 text-stone-500" : "p-4 text-stone-950"}>
            <div className="flex flex-wrap justify-between gap-3">
              <Link href={item.href} onClick={() => void read(item)} className="min-w-64 flex-1">
                <p className={item.leida ? "font-medium" : "font-bold"}>{item.titulo}</p>
                <p className="mt-1 text-sm">{item.mensaje}</p>
                <p className="mt-2 text-xs text-stone-400">
                  {formatDateTime(item.fecha)} · {item.prioridad} · Oficina {item.oficina_id}
                </p>
                <p className="mt-1 text-xs text-stone-400">
                  Responsable: {item.responsable_nombre || "Sin asignar"}
                  {item.pospuesta_hasta ? ` · Pospuesta hasta ${formatDateTime(item.pospuesta_hasta)}` : ""}
                </p>
              </Link>
              <Actions item={item} saving={saving === item.id} onAction={action} />
            </div>
          </article>
        ))}
        {!data.items.length ? (
          <p className="p-10 text-center text-sm text-stone-500">No hay notificaciones para estos filtros.</p>
        ) : null}
      </div>

      <div className="rounded-lg border border-stone-800/10 bg-white px-3 py-3 shadow-sm">
        {paginationControls}
      </div>
    </section>
  );
}

function Actions({
  item,
  saving,
  onAction,
}: {
  item: Item;
  saving: boolean;
  onAction: (item: Item, next: Estado) => Promise<void>;
}) {
  if (item.clase !== "accion") {
    return null;
  }

  if (item.estado === "resuelta") {
    return <Btn disabled={saving} text="Volver a abrir" onClick={() => void onAction(item, "pendiente")} />;
  }

  if (item.estado === "descartada") {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {item.estado !== "en_progreso" ? (
        <Btn disabled={saving} text="En progreso" onClick={() => void onAction(item, "en_progreso")} />
      ) : null}
      <Btn disabled={saving} text="Posponer 1 día" onClick={() => void onAction(item, "pospuesta")} />
      <Btn disabled={saving} text="Resolver" onClick={() => void onAction(item, "resuelta")} />
      <Btn disabled={saving} text="Descartar" onClick={() => void onAction(item, "descartada")} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-b p-3">
      <p className="text-xs uppercase text-stone-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function Btn({ text, onClick, disabled }: { text: string; onClick: () => void; disabled: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick} className="button-muted px-2.5 py-1.5 text-xs disabled:opacity-40">
      {disabled ? "Guardando..." : text}
    </button>
  );
}
