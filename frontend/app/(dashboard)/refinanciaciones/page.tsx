"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ApiError, apiFetch, apiFetchWithMeta } from "@/lib/api";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

type Estado = "programado" | "disponible" | "contactado" | "aceptado" | "rechazado" | "convertido" | "pospuesto";
type Vista = "hoy" | "proximos" | "gestionados" | "convertidos" | "pospuestos" | "creditos_nuevos" | "todos";

type Item = {
  credito_id: number;
  pensionado_id: number;
  pensionado_nombre: string | null;
  documento: string | null;
  cooperativa_id: number;
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
  justificacion: string | null;
  reactivar_en: string | null;
  credito_nuevo_id: number | null;
};

type Cooperativa = {
  id: number;
  nombre: string;
  is_active: boolean;
};

type Filters = {
  montoMin: string;
  montoMax: string;
  fechaDesde: string;
  fechaHasta: string;
  cooperativaId: string;
};

type SavedViewState = {
  query?: string;
  vista?: Vista;
  page?: number;
  tentativaOrder?: "asc" | "desc";
  filters?: Partial<Filters>;
};

type CreditoNuevoItem = {
  pensionado_id: number;
  pensionado_nombre: string | null;
  documento: string | null;
  oficina_id: number;
  ultimo_credito_id: number | null;
  ultimo_credito_finalizado_en: string | null;
  ultimo_monto_aprobado: number | null;
  creditos_finalizados: number;
};

const tabs: Array<{ key: Vista; label: string }> = [
  { key: "hoy", label: "Refis disponibles ahora" },
  { key: "proximos", label: "Proximos" },
  { key: "gestionados", label: "En gestion" },
  { key: "convertidos", label: "Convertidos" },
  { key: "pospuestos", label: "Pospuestos" },
  { key: "creditos_nuevos", label: "Posibles nuevos creditos" },
  { key: "todos", label: "Todos" },
];

const PAGE_SIZE = 15;
const STORAGE_KEY = "credi.refinanciaciones.filters";
const emptyFilters: Filters = {
  montoMin: "",
  montoMax: "",
  fechaDesde: "",
  fechaHasta: "",
  cooperativaId: "",
};

function isVista(value: unknown): value is Vista {
  return typeof value === "string" && tabs.some((tab) => tab.key === value);
}

function readSavedViewState(): SavedViewState {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as SavedViewState;
    return {
      query: typeof parsed.query === "string" ? parsed.query : "",
      vista: isVista(parsed.vista) ? parsed.vista : "hoy",
      page:
        typeof parsed.page === "number" && Number.isFinite(parsed.page) && parsed.page > 0
          ? Math.floor(parsed.page)
          : 1,
      tentativaOrder: parsed.tentativaOrder === "desc" ? "desc" : "asc",
      filters: {
        ...emptyFilters,
        ...(parsed.filters ?? {}),
      },
    };
  } catch {
    return {};
  }
}

export default function RefinanciacionesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [creditosNuevos, setCreditosNuevos] = useState<CreditoNuevoItem[]>([]);
  const [cooperativas, setCooperativas] = useState<Cooperativa[]>([]);
  const [query, setQuery] = useState("");
  const [vista, setVista] = useState<Vista>("hoy");
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [tentativaOrder, setTentativaOrder] = useState<"asc" | "desc">("asc");
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [counts, setCounts] = useState({
    hoy: 0,
    proximos: 0,
    gestionados: 0,
    convertidos: 0,
    pospuestos: 0,
    creditosNuevos: 0,
    personas: {
      totalRefinanciaciones: 0,
      hoy: 0,
      proximos: 0,
      gestionados: 0,
      convertidos: 0,
      pospuestos: 0,
      creditosNuevos: 0,
    },
  });
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<Item | null>(null);
  const [postponing, setPostponing] = useState<Item | null>(null);
  const [unpostponing, setUnpostponing] = useState<Item | null>(null);
  const [returning, setReturning] = useState<Item | null>(null);
  const [restoredFilters, setRestoredFilters] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canGoNext = page < totalPages;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        skip: String((page - 1) * PAGE_SIZE),
      });

      if (query.trim()) params.set("texto", query.trim());

      if (vista === "creditos_nuevos") {
        const [response, cooperativasData] = await Promise.all([
          apiFetchWithMeta<CreditoNuevoItem[]>(
            `/api/v1/refinanciaciones/creditos-nuevos/?${params.toString()}`,
          ),
          cooperativas.length
            ? Promise.resolve(null)
            : apiFetch<Cooperativa[]>("/api/v1/cooperativas/?solo_activas=true"),
        ]);

        setCreditosNuevos(response.data);
        setItems([]);
        setTotal(Number(response.headers.get("X-Total-Count") ?? response.data.length));
        setCounts((current) => ({
          ...current,
          creditosNuevos: Number(
            response.headers.get("X-Count-Creditos-Nuevos") ??
              response.headers.get("X-Total-Count") ??
              response.data.length,
          ),
          personas: {
            ...current.personas,
            creditosNuevos: Number(
              response.headers.get("X-Count-Personas-Creditos-Nuevos") ??
                response.headers.get("X-Count-Creditos-Nuevos") ??
                response.headers.get("X-Total-Count") ??
                response.data.length,
            ),
          },
        }));
        if (cooperativasData) setCooperativas(cooperativasData);
        return;
      }

      params.set("vista", vista);
      params.set("orden_tentativa", tentativaOrder);
      if (filters.montoMin) params.set("monto_min", filters.montoMin);
      if (filters.montoMax) params.set("monto_max", filters.montoMax);
      if (filters.fechaDesde) params.set("fecha_desde", filters.fechaDesde);
      if (filters.fechaHasta) params.set("fecha_hasta", filters.fechaHasta);
      if (filters.cooperativaId) params.set("cooperativa_id", filters.cooperativaId);

      const [response, cooperativasData] = await Promise.all([
        apiFetchWithMeta<Item[]>(`/api/v1/refinanciaciones/elegibles/?${params.toString()}`),
        cooperativas.length
          ? Promise.resolve(null)
          : apiFetch<Cooperativa[]>("/api/v1/cooperativas/?solo_activas=true"),
      ]);

      setItems(response.data);
      setCreditosNuevos([]);
      setTotal(Number(response.headers.get("X-Total-Count") ?? response.data.length));
      setCounts({
        hoy: Number(response.headers.get("X-Count-Hoy") ?? 0),
        proximos: Number(response.headers.get("X-Count-Proximos") ?? 0),
        gestionados: Number(response.headers.get("X-Count-Gestionados") ?? 0),
        convertidos: Number(response.headers.get("X-Count-Convertidos") ?? 0),
        pospuestos: Number(response.headers.get("X-Count-Pospuestos") ?? 0),
        creditosNuevos: Number(response.headers.get("X-Count-Creditos-Nuevos") ?? 0),
        personas: {
          totalRefinanciaciones: Number(
            response.headers.get("X-Count-Personas-Total-Refinanciaciones") ?? 0,
          ),
          hoy: Number(response.headers.get("X-Count-Personas-Hoy") ?? 0),
          proximos: Number(response.headers.get("X-Count-Personas-Proximos") ?? 0),
          gestionados: Number(response.headers.get("X-Count-Personas-Gestionados") ?? 0),
          convertidos: Number(response.headers.get("X-Count-Personas-Convertidos") ?? 0),
          pospuestos: Number(response.headers.get("X-Count-Personas-Pospuestos") ?? 0),
          creditosNuevos: Number(response.headers.get("X-Count-Personas-Creditos-Nuevos") ?? 0),
        },
      });
      if (cooperativasData) setCooperativas(cooperativasData);
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : "No se pudieron cargar las oportunidades",
      );
    } finally {
      setHasLoadedOnce(true);
      setLoading(false);
    }
  }, [cooperativas.length, filters, page, query, tentativaOrder, vista]);

  useEffect(() => {
    if (!restoredFilters) {
      return;
    }

    void load();
  }, [load, restoredFilters]);

  useEffect(() => {
    const savedViewState = readSavedViewState();
    setQuery(savedViewState.query ?? "");
    setVista(savedViewState.vista ?? "hoy");
    setPage(savedViewState.page ?? 1);
    setTentativaOrder(savedViewState.tentativaOrder ?? "asc");
    setFilters({
      ...emptyFilters,
      ...(savedViewState.filters ?? {}),
    });
    setRestoredFilters(true);
  }, []);

  useEffect(() => {
    if (!restoredFilters) {
      return;
    }

    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        query,
        vista,
        page,
        tentativaOrder,
        filters,
      }),
    );
  }, [filters, page, query, restoredFilters, tentativaOrder, vista]);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  function resetPage() {
    setPage(1);
  }

  function toggleTentativaOrder() {
    setPage(1);
    setTentativaOrder((current) => (current === "asc" ? "desc" : "asc"));
  }

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
        {loading
          ? "Actualizando filtros..."
          : `Pagina ${page} de ${totalPages}. Mostrando ${
              vista === "creditos_nuevos" ? creditosNuevos.length : items.length
            } de ${total} oportunidades.`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="button-muted px-3 py-2 text-xs"
          disabled={page === 1 || loading}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          Anterior
        </button>
        <label className="flex items-center gap-2">
          Ir a
          <input
            className="input-base h-9 w-20 px-2 py-1 text-sm"
            max={totalPages}
            min="1"
            type="number"
            value={pageInput}
            onBlur={() => goToPage(pageInput)}
            onChange={(event) => {
              const value = event.target.value;
              if (/^\d*$/.test(value)) {
                setPageInput(value);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
        </label>
        <button
          type="button"
          className="button-muted px-3 py-2 text-xs"
          disabled={!canGoNext || loading}
          onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
        >
          Siguiente
        </button>
      </div>
    </div>
  );

  function updateFilter(field: keyof typeof filters, value: string) {
    resetPage();
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function clearFilters() {
    resetPage();
    setQuery("");
    setFilters(emptyFilters);
  }

  async function change(
    item: Item,
    estado: Estado,
    justificacion?: string,
    reactivarEn?: string,
  ) {
    setSavingId(item.oportunidad_id);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiFetch<{ estado: Estado; reactivar_en: string | null }>(
        `/api/v1/refinanciaciones/oportunidades/${item.oportunidad_id}/estado`,
        {
          method: "PATCH",
          body: JSON.stringify({
            estado,
            justificacion,
            reactivar_en: reactivarEn ? new Date(`${reactivarEn}T00:00:00`).toISOString() : null,
          }),
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
      void load();
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

  if (loading && !hasLoadedOnce) {
    return <Message text="Cargando oportunidades..." />;
  }

  return (
    <section className="space-y-3">
      <header className="rounded-lg border bg-white/85 p-5">
        <p className="text-xs font-semibold uppercase tracking-[.22em] text-stone-500">
          Operación comercial
        </p>
        <h1 className="mt-2 text-xl font-semibold">Oportunidades comerciales</h1>
        <p className="mt-2 text-sm text-stone-600">
          Refinanciaciones listas y pensionados disponibles para credito nuevo.
        </p>
      </header>

      {error ? <Message tone="error" text={error} /> : null}
      {success ? <Message tone="success" text={success} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
        <Metric group="Refinanciaciones" label="Total refinanciaciones" value={counts.hoy + counts.proximos + counts.gestionados + counts.convertidos + counts.pospuestos} people={counts.personas.totalRefinanciaciones} />
        <Metric label="Disponibles ahora" value={counts.hoy} people={counts.personas.hoy} />
        <Metric label="Proximas" value={counts.proximos} people={counts.personas.proximos} />
        <Metric label="En gestion" value={counts.gestionados} people={counts.personas.gestionados} />
        <Metric label="Convertidas" value={counts.convertidos} people={counts.personas.convertidos} />
        <Metric label="Pospuestas" value={counts.pospuestos} people={counts.personas.pospuestos} />
        <Metric group="Créditos nuevos" label="Candidatos" value={counts.creditosNuevos} people={counts.personas.creditosNuevos} />
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setVista(tab.key);
              setPage(1);
            }}
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

      <div className="rounded-lg border bg-white p-3 shadow-sm">
        <div className="grid gap-2 lg:grid-cols-[1.4fr_.75fr_.75fr_.8fr_.8fr_1fr_auto] lg:items-end">
          <label className="block text-sm font-medium text-stone-700">
            <span>Buscar</span>
            <input
              className="input-base mt-1"
              value={query}
              onChange={(event) => {
                resetPage();
                setQuery(event.target.value);
              }}
              placeholder={
                vista === "creditos_nuevos"
                  ? "Pensionado o documento"
                  : "Credito, pensionado, documento o cooperativa"
              }
            />
          </label>
          {vista !== "creditos_nuevos" ? (
            <>
              <Field label="Monto min" value={filters.montoMin} onChange={(value) => updateFilter("montoMin", value)} type="number" />
              <Field label="Monto max" value={filters.montoMax} onChange={(value) => updateFilter("montoMax", value)} type="number" />
              <Field label="Desde" value={filters.fechaDesde} onChange={(value) => updateFilter("fechaDesde", value)} type="date" />
              <Field label="Hasta" value={filters.fechaHasta} onChange={(value) => updateFilter("fechaHasta", value)} type="date" />
              <label className="block text-sm font-medium text-stone-700">
                <span>Cooperativa</span>
                <select className="input-base mt-1" value={filters.cooperativaId} onChange={(event) => updateFilter("cooperativaId", event.target.value)}>
                  <option value="">Todas</option>
                  {cooperativas.map((cooperativa) => (
                    <option key={cooperativa.id} value={cooperativa.id}>{cooperativa.nombre}</option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          <button type="button" className="button-muted whitespace-nowrap" onClick={clearFilters}>
            Limpiar
          </button>
        </div>
        <div className="mt-3">{paginationControls}</div>
      </div>

      {vista === "creditos_nuevos" ? (
        <div className="overflow-x-auto border-y bg-white/80">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-stone-50 text-xs uppercase text-stone-500">
              <tr>
                {["Pensionado", "Historial", "Ultimo credito", "Ultimo monto", "Accion"].map((header) => (
                  <th key={header} className="px-4 py-3">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {creditosNuevos.map((item) => (
                <tr key={item.pensionado_id}>
                  <td className="px-4 py-3">
                    <Link
                      className="font-semibold text-teal-800 hover:underline"
                      href={`/pensionados/${item.pensionado_id}?vista=creditos`}
                    >
                      {item.pensionado_nombre ?? `Pensionado #${item.pensionado_id}`}
                    </Link>
                    <p className="text-xs text-stone-500">{item.documento}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-stone-800">
                      {item.creditos_finalizados} credito{item.creditos_finalizados === 1 ? "" : "s"} finalizado{item.creditos_finalizados === 1 ? "" : "s"}
                    </p>
                    <p className="text-xs text-stone-500">Sin credito aprobado vigente</p>
                  </td>
                  <td className="px-4 py-3">
                    {item.ultimo_credito_id ? (
                      <Link
                        className="font-semibold text-teal-800 hover:underline"
                        href={`/creditos/${item.ultimo_credito_id}`}
                      >
                        #{item.ultimo_credito_id}
                      </Link>
                    ) : (
                      <span className="text-stone-500">Sin credito</span>
                    )}
                    <p className="text-xs text-stone-500">
                      {item.ultimo_credito_finalizado_en
                        ? formatDate(item.ultimo_credito_finalizado_en)
                        : "Sin fecha fin"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {formatCurrency(item.ultimo_monto_aprobado)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      className="button-primary px-2.5 py-1.5 text-xs"
                      href={`/creditos?pensionado=${item.pensionado_id}`}
                    >
                      Crear crédito
                    </Link>
                  </td>
                </tr>
              ))}

              {creditosNuevos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-stone-500">
                    No hay pensionados candidatos a credito nuevo en esta vista.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : (
      <div className="overflow-x-auto border-y bg-white/80">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-stone-50 text-xs uppercase text-stone-500">
            <tr>
              <th className="px-4 py-3">Credito base</th>
              <th className="px-4 py-3">Pensionado</th>
              <th className="px-4 py-3">Cooperativa</th>
              <th className="px-4 py-3">
                <button
                  type="button"
                  className="text-left uppercase transition hover:text-teal-700"
                  onClick={toggleTentativaOrder}
                  title={tentativaOrder === "asc" ? "Ver fechas mas lejanas primero" : "Ver fechas mas cercanas primero"}
                >
                  Tentativa para refi {tentativaOrder === "asc" ? "cercanas" : "lejanas"}
                </button>
              </th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Gestion</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => (
              <tr key={item.credito_id}>
                <td className="px-4 py-3">
                  <Link
                    className="font-semibold text-teal-800 hover:underline"
                    href={`/creditos/${item.credito_id}`}
                  >
                    #{item.credito_id}
                  </Link>
                  {item.credito_nuevo_id ? (
                    <p className="mt-1 text-xs text-stone-500">
                      Nuevo:{" "}
                      <Link
                        className="font-semibold text-teal-700 hover:underline"
                        href={`/creditos/${item.credito_nuevo_id}`}
                      >
                        #{item.credito_nuevo_id}
                      </Link>
                    </p>
                  ) : null   
                  }
                </td>
                <td className="px-4 py-3">
                  <Link
                    className="font-semibold text-teal-800 hover:underline"
                    href={`/pensionados/${item.pensionado_id}`}
                  >
                    {item.pensionado_nombre ?? `Pensionado #${item.pensionado_id}`}
                  </Link>
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
                  {item.estado_comercial === "pospuesto" ? (
                    <div className="mt-2 max-w-xs text-xs text-stone-500">
                      <p>
                        Reactivar:{" "}
                        <span className="font-medium text-stone-700">
                          {item.reactivar_en ? formatDateTime(item.reactivar_en) : "Sin fecha"}
                        </span>
                      </p>
                      <p className="mt-1">
                        {item.justificacion?.trim() || "Sin motivo registrado"}
                      </p>
                    </div>
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
                              text="Posponer"
                              onClick={() => setPostponing(item)}
                            />
                            <Action
                              disabled={savingId === item.oportunidad_id}
                              text="Rechazado"
                              onClick={() => setRejecting(item)}
                            />
                          </>
                        ) : null}
                        {item.estado_comercial === "aceptado" ? (
                          <>
                            <Link
                              className="button-primary px-2.5 py-1.5 text-xs"
                              href={`/creditos?refinanciar=${item.credito_id}`}
                            >
                              Refinanciar
                            </Link>
                            <Action
                              disabled={savingId === item.oportunidad_id}
                              text="Volver a disponible"
                              onClick={() => setReturning(item)}
                            />
                          </>
                        ) : null}
                      </>
                    ) : null}
                    {item.estado_comercial === "rechazado" ? (
                      <Action
                        disabled={savingId === item.oportunidad_id}
                        text="Reabrir"
                        onClick={() => void change(item, "disponible")}
                      />
                    ) : null}
                    {item.estado_comercial === "pospuesto" ? (
                      <Action
                        disabled={savingId === item.oportunidad_id}
                        text="Quitar pospuesto"
                        onClick={() => setUnpostponing(item)}
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}

            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-stone-500">
                  No hay oportunidades en esta vista.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      )}

      <div className="rounded-lg border border-stone-800/10 bg-white px-3 py-3 shadow-sm">
        {paginationControls}
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
      {postponing ? (
        <PostponeModal
          item={postponing}
          saving={savingId === postponing.oportunidad_id}
          onClose={() => setPostponing(null)}
          onConfirm={async (reason, reactivarEn) => {
            await change(postponing, "pospuesto", reason, reactivarEn);
            setPostponing(null);
          }}
        />
      ) : null}
      {unpostponing ? (
        <UnpostponeModal
          item={unpostponing}
          saving={savingId === unpostponing.oportunidad_id}
          onClose={() => setUnpostponing(null)}
          onConfirm={async (reason) => {
            await change(unpostponing, "disponible", reason);
            setUnpostponing(null);
          }}
        />
      ) : null}
      {returning ? (
        <ReturnAvailableModal
          item={returning}
          saving={savingId === returning.oportunidad_id}
          onClose={() => setReturning(null)}
          onConfirm={async (reason) => {
            await change(returning, "disponible", reason);
            setReturning(null);
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
    pospuesto: "bg-stone-100 text-stone-700 border-stone-300",
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

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      <span>{label}</span>
      <input
        className="input-base mt-1"
        type={type}
        value={value}
        min={type === "number" ? "0" : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
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
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
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
        <div className="mt-3 flex justify-end gap-2">
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

function PostponeModal({
  item,
  saving,
  onClose,
  onConfirm,
}: {
  item: Item;
  saving: boolean;
  onClose: () => void;
  onConfirm: (reason: string, reactivarEn: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [reactivarEn, setReactivarEn] = useState(defaultPostponeDate());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold">Posponer oportunidad #{item.credito_id}</h2>
        <p className="mt-2 text-sm text-stone-600">
          La oportunidad saldra de disponibles y volvera a revisarse en la fecha programada.
        </p>
        <label className="mt-4 block text-sm font-medium">
          Reactivar en
          <input
            className="input-base mt-1"
            type="date"
            value={reactivarEn}
            onChange={(event) => setReactivarEn(event.target.value)}
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Motivo
          <textarea
            autoFocus
            className="input-base mt-1 min-h-28"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ej: Cliente moroso, revisar nuevamente en un mes"
          />
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="button-muted" disabled={saving} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={saving || !reason.trim() || !reactivarEn}
            onClick={() => void onConfirm(reason.trim(), reactivarEn)}
          >
            {saving ? "Guardando..." : "Posponer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UnpostponeModal({
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
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold">Quitar pospuesto #{item.credito_id}</h2>
        <p className="mt-2 text-sm text-stone-600">
          La oportunidad volvera a disponibles y generara alerta nuevamente.
        </p>
        <label className="mt-4 block text-sm font-medium">
          Motivo
          <textarea
            autoFocus
            className="input-base mt-1 min-h-24"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ej: Se pospuso el credito equivocado"
          />
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="button-muted" disabled={saving} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={saving || !reason.trim()}
            onClick={() => void onConfirm(reason.trim())}
          >
            {saving ? "Guardando..." : "Quitar pospuesto"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReturnAvailableModal({
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
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold">Volver a disponible #{item.credito_id}</h2>
        <p className="mt-2 text-sm text-stone-600">
          Usa esta accion si el cliente se arrepintio o si la oportunidad se marco como aceptada por error.
        </p>
        <label className="mt-4 block text-sm font-medium">
          Motivo
          <textarea
            autoFocus
            className="input-base mt-1 min-h-24"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ej: Cliente se arrepintio o se marco la oportunidad equivocada"
          />
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="button-muted" disabled={saving} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={saving || !reason.trim()}
            onClick={() => void onConfirm(reason.trim())}
          >
            {saving ? "Guardando..." : "Volver a disponible"}
          </button>
        </div>
      </div>
    </div>
  );
}

function defaultPostponeDate() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function Metric({
  group,
  label,
  value,
  people,
}: {
  group?: string;
  label: string;
  value: number;
  people?: number;
}) {
  return (
    <div className="border-b px-1 py-3">
      {group ? <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">{group}</p> : null}
      <p className="text-xs uppercase tracking-wider text-stone-500">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
      {typeof people === "number" ? (
        <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-stone-600">
          <PersonIcon />
          <span>{people} personas</span>
        </p>
      ) : null}
    </div>
  );
}

function PersonIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 text-teal-700"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
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
