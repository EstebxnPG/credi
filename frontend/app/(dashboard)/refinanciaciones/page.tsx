"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError, apiFetch } from "@/lib/api";
import { readSession } from "@/lib/session";

type Credito = {
  id: number;
  monto_solicitado: number;
  estado: string;
};

type Refinanciacion = {
  id: number;
  credito_id: number;
  obligacion_externa: string | null;
  entidad: string | null;
  valor_refinanciacion: number | null;
  valor_cuota_recoge: number | null;
  cuotas_recoge: number | null;
  nro_cuotas_anterior: number | null;
  created_at: string;
};

type RefinanciacionFormState = {
  credito_id: string;
  obligacion_externa: string;
  entidad: string;
  valor_refinanciacion: string;
  valor_cuota_recoge: string;
  cuotas_recoge: string;
  nro_cuotas_anterior: string;
};

const initialForm: RefinanciacionFormState = {
  credito_id: "",
  obligacion_externa: "",
  entidad: "",
  valor_refinanciacion: "",
  valor_cuota_recoge: "",
  cuotas_recoge: "",
  nro_cuotas_anterior: "",
};

export default function RefinanciacionesPage() {
  const router = useRouter();
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [refinanciaciones, setRefinanciaciones] = useState<Refinanciacion[]>([]);
  const [selectedCreditoId, setSelectedCreditoId] = useState<string>("todos");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<RefinanciacionFormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const session = readSession();
    if (!session) {
      router.replace("/login?message=Inicia sesion para gestionar refinanciaciones");
      return;
    }
  }, [router]);

  async function loadCreditos() {
    const data = await apiFetch<Credito[]>("/api/v1/creditos/");
    const ordered = [...data].sort((left, right) => right.id - left.id);
    setCreditos(ordered);
    setForm((current) => ({
      ...current,
      credito_id: current.credito_id || String(ordered[0]?.id ?? ""),
    }));
  }

  async function loadRefinanciaciones(creditoId?: string) {
    setLoading(true);
    setError(null);

    try {
      const query =
        creditoId && creditoId !== "todos" ? `?credito_id=${creditoId}` : "";
      const data = await apiFetch<Refinanciacion[]>(`/api/v1/refinanciaciones/${query}`);
      const ordered = [...data].sort((left, right) => right.id - left.id);
      setRefinanciaciones(ordered);
      setSelectedId((current) => {
        if (current && ordered.some((item) => item.id === current)) {
          return current;
        }
        return ordered[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : "No se pudieron cargar las refinanciaciones",
      );
      setRefinanciaciones([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function loadInitialData() {
      try {
        await loadCreditos();
        await loadRefinanciaciones();
      } catch (loadError) {
        setError(
          loadError instanceof ApiError
            ? loadError.message
            : "No se pudo cargar el modulo",
        );
        setLoading(false);
      }
    }

    void loadInitialData();
  }, []);

  useEffect(() => {
    if (!readSession()) {
      return;
    }

    void loadRefinanciaciones(selectedCreditoId);
  }, [selectedCreditoId]);

  const selectedRefinanciacion = useMemo(
    () => refinanciaciones.find((item) => item.id === selectedId) ?? null,
    [refinanciaciones, selectedId],
  );

  const creditosMap = useMemo(() => {
    return new Map(creditos.map((credito) => [credito.id, credito]));
  }, [creditos]);

  function resetForm() {
    setEditingId(null);
    setForm({
      ...initialForm,
      credito_id: String(creditos[0]?.id ?? ""),
    });
  }

  function startEdit(item: Refinanciacion) {
    setEditingId(item.id);
    setForm({
      credito_id: String(item.credito_id),
      obligacion_externa: item.obligacion_externa ?? "",
      entidad: item.entidad ?? "",
      valor_refinanciacion: item.valor_refinanciacion ? String(item.valor_refinanciacion) : "",
      valor_cuota_recoge: item.valor_cuota_recoge ? String(item.valor_cuota_recoge) : "",
      cuotas_recoge: item.cuotas_recoge ? String(item.cuotas_recoge) : "",
      nro_cuotas_anterior: item.nro_cuotas_anterior ? String(item.nro_cuotas_anterior) : "",
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        ...(editingId ? {} : { credito_id: Number(form.credito_id) }),
        obligacion_externa: form.obligacion_externa.trim() || null,
        entidad: form.entidad.trim() || null,
        valor_refinanciacion: form.valor_refinanciacion ? Number(form.valor_refinanciacion) : null,
        valor_cuota_recoge: form.valor_cuota_recoge ? Number(form.valor_cuota_recoge) : null,
        cuotas_recoge: form.cuotas_recoge ? Number(form.cuotas_recoge) : null,
        nro_cuotas_anterior: form.nro_cuotas_anterior ? Number(form.nro_cuotas_anterior) : null,
      };

      const result = await apiFetch<Refinanciacion>(
        editingId ? `/api/v1/refinanciaciones/${editingId}` : "/api/v1/refinanciaciones/",
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );

      setRefinanciaciones((current) => {
        if (editingId) {
          return current
            .map((item) => (item.id === result.id ? result : item))
            .sort((left, right) => right.id - left.id);
        }
        return [result, ...current];
      });
      setSelectedId(result.id);
      setSuccess(
        editingId
          ? "Refinanciacion actualizada correctamente."
          : "Refinanciacion creada correctamente.",
      );
      resetForm();
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : "No se pudo guardar la refinanciacion",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <article className="glass-panel p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-stone-500">
            Casos asociados
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
            Refinanciaciones
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600">
            Este modulo vive pegado al credito. Lo importante aqui no es adornar:
            es registrar bien la deuda anterior, la entidad y los valores para no
            perder trazabilidad comercial.
          </p>
        </article>

        <article className="glass-panel p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
            Filtro rapido
          </p>
          <div className="mt-4 space-y-3">
            <SelectField
              label="Credito"
              value={selectedCreditoId}
              onChange={setSelectedCreditoId}
              options={[
                { value: "todos", label: "Todos los creditos" },
                ...creditos.map((credito) => ({
                  value: String(credito.id),
                  label: `#${credito.id} · ${credito.estado} · ${formatCurrency(credito.monto_solicitado)}`,
                })),
              ]}
            />
          </div>
        </article>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <article className="glass-panel overflow-hidden">
          <div className="border-b border-stone-800/10 px-6 py-5">
            <h2 className="text-xl font-semibold text-stone-950">Listado</h2>
            <p className="mt-1 text-sm text-stone-500">
              Revisa refinanciaciones existentes o selecciona una para editarla.
            </p>
          </div>

          <div className="space-y-3 p-4">
            {loading ? (
              <EmptyState text="Cargando refinanciaciones..." />
            ) : refinanciaciones.length === 0 ? (
              <EmptyState text="No hay refinanciaciones para el filtro actual." />
            ) : (
              refinanciaciones.map((item) => {
                const active = item.id === selectedId;
                const credito = creditosMap.get(item.credito_id);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={[
                      "w-full rounded-3xl border px-5 py-4 text-left transition",
                      active
                        ? "border-teal-700/20 bg-teal-950 text-white shadow-xl shadow-teal-950/15"
                        : "border-stone-800/10 bg-white/65 hover:bg-white/90",
                    ].join(" ")}
                  >
                    <p className="text-xs uppercase tracking-[0.24em] opacity-70">
                      Refinanciacion #{item.id}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold">
                      {item.entidad ?? "Entidad sin registrar"}
                    </h3>
                    <div className={["mt-3 grid gap-2 text-sm sm:grid-cols-2", active ? "text-teal-50/85" : "text-stone-600"].join(" ")}>
                      <p>Credito #{item.credito_id}</p>
                      <p>{credito?.estado ?? "Estado no disponible"}</p>
                      <p>{formatCurrency(item.valor_refinanciacion)}</p>
                      <p>{formatDate(item.created_at)}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </article>

        <article className="glass-panel p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
                Formulario
              </p>
              <h2 className="mt-2 text-xl font-semibold text-stone-950">
                {editingId ? "Editar refinanciacion" : "Nueva refinanciacion"}
              </h2>
            </div>

            {editingId ? (
              <button type="button" className="button-muted" onClick={resetForm}>
                Cancelar
              </button>
            ) : null}
          </div>

          <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
            {!editingId ? (
              <SelectField
                label="Credito"
                value={form.credito_id}
                onChange={(value) => setForm((current) => ({ ...current, credito_id: value }))}
                options={creditos.map((credito) => ({
                  value: String(credito.id),
                  label: `#${credito.id} · ${credito.estado} · ${formatCurrency(credito.monto_solicitado)}`,
                }))}
              />
            ) : null}

            <InputField
              label="Obligacion externa"
              value={form.obligacion_externa}
              onChange={(value) =>
                setForm((current) => ({ ...current, obligacion_externa: value }))
              }
            />
            <InputField
              label="Entidad"
              value={form.entidad}
              onChange={(value) => setForm((current) => ({ ...current, entidad: value }))}
            />

            <div className="grid gap-3 md:grid-cols-2">
              <InputField
                label="Valor refinanciacion"
                type="number"
                value={form.valor_refinanciacion}
                onChange={(value) =>
                  setForm((current) => ({ ...current, valor_refinanciacion: value }))
                }
              />
              <InputField
                label="Valor cuota recoge"
                type="number"
                value={form.valor_cuota_recoge}
                onChange={(value) =>
                  setForm((current) => ({ ...current, valor_cuota_recoge: value }))
                }
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <InputField
                label="Cuotas recoge"
                type="number"
                value={form.cuotas_recoge}
                onChange={(value) =>
                  setForm((current) => ({ ...current, cuotas_recoge: value }))
                }
              />
              <InputField
                label="Nro. cuotas anterior"
                type="number"
                value={form.nro_cuotas_anterior}
                onChange={(value) =>
                  setForm((current) => ({ ...current, nro_cuotas_anterior: value }))
                }
              />
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {success}
              </div>
            ) : null}

            <button type="submit" className="button-primary w-full" disabled={saving}>
              {saving ? "Guardando..." : editingId ? "Actualizar refinanciacion" : "Crear refinanciacion"}
            </button>
          </form>

          {selectedRefinanciacion ? (
            <div className="mt-6 space-y-3 border-t border-stone-800/10 pt-5">
              <DetailRow label="Credito" value={`#${selectedRefinanciacion.credito_id}`} />
              <DetailRow
                label="Entidad"
                value={selectedRefinanciacion.entidad ?? "No registrada"}
              />
              <DetailRow
                label="Valor refinanciacion"
                value={formatCurrency(selectedRefinanciacion.valor_refinanciacion)}
              />
              <button
                type="button"
                className="button-muted w-full"
                onClick={() => startEdit(selectedRefinanciacion)}
              >
                Editar refinanciacion seleccionada
              </button>
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}

function formatCurrency(value: number | null) {
  if (value === null) {
    return "No registrado";
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

function InputField({
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
    <div>
      <label className="mb-2 block text-sm font-medium text-stone-700">{label}</label>
      <input
        className="input-base"
        value={value}
        onChange={(event) => onChange(event.target.value)}
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
      <label className="mb-2 block text-sm font-medium text-stone-700">{label}</label>
      <select
        className="input-base"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
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
