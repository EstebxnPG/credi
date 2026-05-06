"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError, apiFetch } from "@/lib/api";
import { readSession, readSessionUserId } from "@/lib/session";

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

type CatalogItem = {
  id: number;
  nombre: string;
  is_active?: boolean;
};

type PensionadoItem = CatalogItem & {
  documento: string;
};

type CreditoFormState = {
  pensionado_id: string;
  oficina_id: string;
  cooperativa_id: string;
  pagaduria_id: string;
  monto_solicitado: string;
  plazo: string;
  nro_libranza: string;
  tipo_credito: string;
  nro_afiliacion: string;
  observaciones: string;
};

type EstadoFormState = {
  estado_nuevo: string;
  monto_aprobado: string;
  observaciones: string;
};

const initialForm: CreditoFormState = {
  pensionado_id: "",
  oficina_id: "",
  cooperativa_id: "",
  pagaduria_id: "",
  monto_solicitado: "",
  plazo: "",
  nro_libranza: "",
  tipo_credito: "",
  nro_afiliacion: "",
  observaciones: "",
};

const initialEstadoForm: EstadoFormState = {
  estado_nuevo: "",
  monto_aprobado: "",
  observaciones: "",
};

const estadoOptions = [
  "Todos",
  "Prospecto",
  "Enviado a cooperativa",
  "Devuelto por corrección",
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

function activeFirst<T extends { is_active?: boolean }>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftActive = left.is_active !== false;
    const rightActive = right.is_active !== false;
    if (leftActive !== rightActive) {
      return leftActive ? -1 : 1;
    }
    return 0;
  });
}

function getNextEstados(estado: string) {
  const transitions: Record<string, string[]> = {
    Prospecto: ["Enviado a cooperativa"],
    "Enviado a cooperativa": [
      "Devuelto por corrección",
      "Aprobado",
      "Rechazado",
    ],
    "Devuelto por corrección": ["Reenviado"],
    Reenviado: ["Devuelto por corrección", "Aprobado", "Rechazado"],
  };

  return transitions[estado] ?? [];
}

export default function CreditosPage() {
  const router = useRouter();
  const [estado, setEstado] = useState("Todos");
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [historial, setHistorial] = useState<HistorialItem[]>([]);
  const [pensionados, setPensionados] = useState<PensionadoItem[]>([]);
  const [oficinas, setOficinas] = useState<CatalogItem[]>([]);
  const [cooperativas, setCooperativas] = useState<CatalogItem[]>([]);
  const [pagadurias, setPagadurias] = useState<CatalogItem[]>([]);
  const [form, setForm] = useState<CreditoFormState>(initialForm);
  const [estadoForm, setEstadoForm] = useState<EstadoFormState>(initialEstadoForm);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingState, setChangingState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedCredito = useMemo(
    () => creditos.find((credito) => credito.id === selectedId) ?? null,
    [creditos, selectedId],
  );
  const nextEstados = useMemo(
    () => (selectedCredito ? getNextEstados(selectedCredito.estado) : []),
    [selectedCredito],
  );

  async function loadCatalogs() {
    setCatalogLoading(true);

    try {
      const [pensionadosData, oficinasData, cooperativasData, pagaduriasData] =
        await Promise.all([
          apiFetch<PensionadoItem[]>("/api/v1/pensionados/"),
          apiFetch<CatalogItem[]>("/api/v1/oficinas/"),
          apiFetch<CatalogItem[]>("/api/v1/cooperativas/"),
          apiFetch<CatalogItem[]>("/api/v1/pagadurias/"),
        ]);

      const activePensionados = activeFirst(
        pensionadosData.filter((item) => item.is_active),
      );
      const activeOficinas = activeFirst(oficinasData);
      const activeCooperativas = activeFirst(cooperativasData);
      const activePagadurias = activeFirst(pagaduriasData);

      setPensionados(activePensionados);
      setOficinas(activeOficinas);
      setCooperativas(activeCooperativas);
      setPagadurias(activePagadurias);

      setForm((current) => ({
        ...current,
        pensionado_id: current.pensionado_id || String(activePensionados[0]?.id ?? ""),
        oficina_id: current.oficina_id || String(activeOficinas[0]?.id ?? ""),
        cooperativa_id:
          current.cooperativa_id || String(activeCooperativas[0]?.id ?? ""),
        pagaduria_id: current.pagaduria_id || String(activePagadurias[0]?.id ?? ""),
      }));
    } catch (catalogError) {
      setFormError(
        catalogError instanceof ApiError
          ? catalogError.message
          : "No se pudieron cargar los catálogos del crédito",
      );
    } finally {
      setCatalogLoading(false);
    }
  }

  async function loadCreditos() {
    setLoading(true);
    setError(null);

    try {
      const query =
        estado !== "Todos" ? `?estado=${encodeURIComponent(estado)}` : "";
      const data = await apiFetch<Credito[]>(`/api/v1/creditos/${query}`);

      setCreditos(data);
      setSelectedId((current) => {
        if (current && data.some((credito) => credito.id === current)) {
          return current;
        }
        return data[0]?.id ?? null;
      });
    } catch (loadError) {
      const message =
        loadError instanceof ApiError
          ? loadError.message
          : "No se pudieron cargar los créditos";
      setError(message);
      setCreditos([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const session = readSession();
    if (!session) {
      router.replace("/login?message=Inicia sesión para consultar créditos");
      return;
    }

    void Promise.all([loadCatalogs(), loadCreditos()]);
  }, [router]);

  useEffect(() => {
    if (!readSession()) {
      return;
    }
    void loadCreditos();
  }, [estado]);

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

  useEffect(() => {
    setEstadoForm({
      ...initialEstadoForm,
      estado_nuevo: nextEstados[0] ?? "",
      monto_aprobado: selectedCredito?.monto_solicitado
        ? String(selectedCredito.monto_solicitado)
        : "",
    });
  }, [nextEstados, selectedCredito?.id, selectedCredito?.monto_solicitado]);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    setSuccess(null);

    try {
      const asesorId = readSessionUserId();
      if (!asesorId) {
        throw new Error("No se pudo identificar el usuario actual");
      }

      const created = await apiFetch<Credito>("/api/v1/creditos/", {
        method: "POST",
        body: JSON.stringify({
          pensionado_id: Number(form.pensionado_id),
          asesor_id: asesorId,
          oficina_id: Number(form.oficina_id),
          cooperativa_id: Number(form.cooperativa_id),
          pagaduria_id: Number(form.pagaduria_id),
          monto_solicitado: Number(form.monto_solicitado),
          plazo: Number(form.plazo),
          nro_libranza: form.nro_libranza || null,
          tipo_credito: form.tipo_credito || null,
          nro_afiliacion: form.nro_afiliacion || null,
          observaciones: form.observaciones || null,
        }),
      });

      setCreditos((current) => [created, ...current]);
      setSelectedId(created.id);
      setSuccess("Crédito creado correctamente.");
      setForm((current) => ({
        ...initialForm,
        pensionado_id: current.pensionado_id,
        oficina_id: current.oficina_id,
        cooperativa_id: current.cooperativa_id,
        pagaduria_id: current.pagaduria_id,
      }));
      await loadCreditos();
    } catch (submitError) {
      setFormError(
        submitError instanceof ApiError
          ? submitError.message
          : submitError instanceof Error
            ? submitError.message
            : "No se pudo crear el crédito",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleEstadoSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCredito || !estadoForm.estado_nuevo) {
      return;
    }

    setChangingState(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        estado_nuevo: estadoForm.estado_nuevo,
        observaciones: estadoForm.observaciones || null,
        monto_aprobado:
          estadoForm.estado_nuevo === "Aprobado"
            ? Number(estadoForm.monto_aprobado)
            : null,
      };

      const updated = await apiFetch<Credito>(
        `/api/v1/creditos/${selectedCredito.id}/estado`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      );

      setCreditos((current) =>
        current.map((credito) => (credito.id === updated.id ? updated : credito)),
      );
      setSuccess(`Crédito actualizado a ${updated.estado}.`);
      await loadCreditos();
    } catch (changeError) {
      setError(
        changeError instanceof ApiError
          ? changeError.message
          : "No se pudo cambiar el estado del crédito",
      );
    } finally {
      setChangingState(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <article className="glass-panel p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-stone-500">
                MVP operativo
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
                Créditos con alta real
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600">
                Ya puedes crear créditos desde el frontend usando pensionados,
                cooperativas, pagadurías y oficinas reales del backend. Debajo
                mantienes listado, filtro por estado y detalle con historial.
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
            <MetricCard label="En gestión" value={String(resumen.enviados)} />
            <MetricCard label="Finalizados" value={String(resumen.finales)} />
          </div>
        </article>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <article className="glass-panel p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
                Nuevo crédito
              </p>
              <h2 className="mt-2 text-xl font-semibold text-stone-950">
                Formulario de creación
              </h2>
            </div>
            {catalogLoading ? (
              <span className="text-sm text-stone-500">Cargando catálogos...</span>
            ) : null}
          </div>

          <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
            <div className="grid gap-3 md:grid-cols-2">
              <SelectField
                label="Pensionado"
                value={form.pensionado_id}
                onChange={(value) =>
                  setForm((current) => ({ ...current, pensionado_id: value }))
                }
                options={pensionados.map((item) => ({
                  value: String(item.id),
                  label: `${item.nombre} · ${item.documento}`,
                }))}
              />
              <SelectField
                label="Oficina"
                value={form.oficina_id}
                onChange={(value) =>
                  setForm((current) => ({ ...current, oficina_id: value }))
                }
                options={oficinas.map((item) => ({
                  value: String(item.id),
                  label: item.nombre,
                }))}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <SelectField
                label="Cooperativa"
                value={form.cooperativa_id}
                onChange={(value) =>
                  setForm((current) => ({ ...current, cooperativa_id: value }))
                }
                options={cooperativas.map((item) => ({
                  value: String(item.id),
                  label: item.nombre,
                }))}
              />
              <SelectField
                label="Pagaduría"
                value={form.pagaduria_id}
                onChange={(value) =>
                  setForm((current) => ({ ...current, pagaduria_id: value }))
                }
                options={pagadurias.map((item) => ({
                  value: String(item.id),
                  label: item.nombre,
                }))}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <InputField
                label="Monto solicitado"
                type="number"
                value={form.monto_solicitado}
                onChange={(value) =>
                  setForm((current) => ({ ...current, monto_solicitado: value }))
                }
                placeholder="5000000"
              />
              <InputField
                label="Plazo (meses)"
                type="number"
                value={form.plazo}
                onChange={(value) => setForm((current) => ({ ...current, plazo: value }))}
                placeholder="24"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <InputField
                label="Nro. libranza"
                value={form.nro_libranza}
                onChange={(value) =>
                  setForm((current) => ({ ...current, nro_libranza: value }))
                }
                placeholder="Opcional"
              />
              <InputField
                label="Tipo crédito"
                value={form.tipo_credito}
                onChange={(value) =>
                  setForm((current) => ({ ...current, tipo_credito: value }))
                }
                placeholder="Libre inversión"
              />
              <InputField
                label="Nro. afiliación"
                value={form.nro_afiliacion}
                onChange={(value) =>
                  setForm((current) => ({ ...current, nro_afiliacion: value }))
                }
                placeholder="Opcional"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                Observaciones
              </label>
              <textarea
                className="input-base min-h-[110px] resize-none"
                value={form.observaciones}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    observaciones: event.target.value,
                  }))
                }
                placeholder="Contexto comercial, notas o detalle del caso"
              />
            </div>

            {formError ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-700">
                {formError}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {success}
              </div>
            ) : null}

            <button
              type="submit"
              className="button-primary w-full"
              disabled={saving || catalogLoading}
            >
              {saving ? "Creando..." : "Crear crédito"}
            </button>
          </form>
        </article>

        <article className="glass-panel p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
            Atajo operativo
          </p>
          <div className="mt-4 space-y-3">
            <QuickHint text="El backend valida edad, monto, plazo y tiempo mínimo como pensionado contra la cooperativa." />
            <QuickHint text="Si el pensionado está inactivo, no aparecerá en el formulario de crédito." />
            <QuickHint text="El crédito nace en estado Prospecto y registra historial automático." />
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
              Listado de créditos
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Selecciona un crédito para revisar detalle e historial.
            </p>
          </div>

          <div className="space-y-3 p-4">
            {loading ? (
              <EmptyState text="Cargando créditos..." />
            ) : creditos.length === 0 ? (
              <EmptyState text="No hay créditos para el filtro actual." />
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
                          Crédito #{credito.id}
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
              Detalle rápido
            </p>

            {!selectedCredito ? (
              <EmptyState text="Selecciona un crédito para ver su información." />
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

                <form
                  className="rounded-3xl border border-stone-800/10 bg-white/70 p-4"
                  onSubmit={handleEstadoSubmit}
                >
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                    Cambio de estado
                  </p>

                  {nextEstados.length === 0 ? (
                    <p className="mt-3 text-sm leading-6 text-stone-600">
                      Este crédito está en un estado final o no tiene transiciones
                      disponibles.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      <SelectField
                        label="Nuevo estado"
                        value={estadoForm.estado_nuevo}
                        onChange={(value) =>
                          setEstadoForm((current) => ({
                            ...current,
                            estado_nuevo: value,
                          }))
                        }
                        options={nextEstados.map((item) => ({
                          value: item,
                          label: item,
                        }))}
                      />

                      {estadoForm.estado_nuevo === "Aprobado" ? (
                        <InputField
                          label="Monto aprobado"
                          type="number"
                          value={estadoForm.monto_aprobado}
                          onChange={(value) =>
                            setEstadoForm((current) => ({
                              ...current,
                              monto_aprobado: value,
                            }))
                          }
                          placeholder="Monto final aprobado"
                        />
                      ) : null}

                      <div>
                        <label className="mb-2 block text-sm font-medium text-stone-700">
                          Observación del cambio
                        </label>
                        <textarea
                          className="input-base min-h-[90px] resize-none"
                          value={estadoForm.observaciones}
                          onChange={(event) =>
                            setEstadoForm((current) => ({
                              ...current,
                              observaciones: event.target.value,
                            }))
                          }
                          placeholder="Motivo, comentario de cooperativa o seguimiento"
                        />
                      </div>

                      <button
                        type="submit"
                        className="button-primary w-full"
                        disabled={changingState}
                      >
                        {changingState ? "Actualizando..." : "Cambiar estado"}
                      </button>
                    </div>
                  )}
                </form>
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
                  Traza del crédito
                </h2>
              </div>
              {loadingHistory ? (
                <span className="text-sm text-stone-500">Actualizando...</span>
              ) : null}
            </div>

            <div className="mt-5 space-y-3">
              {!selectedCredito ? (
                <EmptyState text="Sin crédito seleccionado." />
              ) : historial.length === 0 ? (
                <EmptyState text="Este crédito aún no tiene historial visible." />
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
                      {item.observacion ?? "Sin observación registrada."}
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

function QuickHint({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-stone-800/10 bg-white/70 px-4 py-4 text-sm leading-6 text-stone-700">
      {text}
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-stone-700">
        {label}
      </label>
      <input
        className="input-base"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-stone-700">
        {label}
      </label>
      <select
        className="input-base"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Selecciona una opción</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
