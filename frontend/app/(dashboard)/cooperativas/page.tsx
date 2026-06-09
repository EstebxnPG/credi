"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

type Cooperativa = {
  id: number;
  nombre: string;
  edad_minima: number;
  edad_maxima: number;
  monto_minimo: number;
  monto_maximo: number;
  plazo_minimo: number;
  plazo_maximo: number;
  reglas_refinanciacion: ReglaRefinanciacion[];
  is_active: boolean;
};

type ReglaRefinanciacion = {
  id?: number;
  plazo_minimo: number;
  plazo_maximo: number;
  meses_para_refinanciar: number;
};

type FormValues = Omit<Cooperativa, "id" | "is_active">;

const emptyForm: FormValues = {
  nombre: "",
  edad_minima: 18,
  edad_maxima: 90,
  monto_minimo: 1000000,
  monto_maximo: 50000000,
  plazo_minimo: 6,
  plazo_maximo: 120,
  reglas_refinanciacion: [],
};

export default function CooperativasPage() {
  const [items, setItems] = useState<Cooperativa[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Cooperativa | null>(null);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);

  async function loadItems() {
    setLoading(true);
    setError(null);
    try {
      setItems(await apiFetch<Cooperativa[]>("/api/v1/cooperativas/?solo_activas=false"));
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : "No se pudo cargar cooperativas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      [item.nombre, item.is_active ? "activo" : "inactivo"].some((value) =>
        value.toLowerCase().includes(term),
      ),
    );
  }, [items, query]);

  function openCreate() {
    setSelected(null);
    setForm(emptyForm);
    setFormError(null);
    setModalMode("create");
  }

  function openEdit(item: Cooperativa) {
    setSelected(item);
    setForm({
      nombre: item.nombre,
      edad_minima: item.edad_minima,
      edad_maxima: item.edad_maxima,
      monto_minimo: item.monto_minimo,
      monto_maximo: item.monto_maximo,
      plazo_minimo: item.plazo_minimo,
      plazo_maximo: item.plazo_maximo,
      reglas_refinanciacion: item.reglas_refinanciacion ?? [],
    });
    setFormError(null);
    setModalMode("edit");
  }

  function closeModal() {
    if (saving) return;
    setModalMode(null);
    setSelected(null);
    setForm(emptyForm);
    setFormError(null);
  }

  function updateRule(index: number, field: keyof ReglaRefinanciacion, value: number) {
    setForm((current) => ({
      ...current,
      reglas_refinanciacion: current.reglas_refinanciacion.map((regla, itemIndex) =>
        itemIndex === index ? { ...regla, [field]: value } : regla,
      ),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modalMode) return;

    setSaving(true);
    setFormError(null);
    try {
      if (modalMode === "create") {
        const created = await apiFetch<Cooperativa>("/api/v1/cooperativas/", {
          method: "POST",
          body: JSON.stringify(form),
        });
        setItems((current) => [created, ...current]);
      } else if (selected) {
        const updated = await apiFetch<Cooperativa>(`/api/v1/cooperativas/${selected.id}`, {
          method: "PATCH",
          body: JSON.stringify(form),
        });
        setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      }
      closeModal();
    } catch (saveError) {
      setFormError(saveError instanceof ApiError ? saveError.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: Cooperativa) {
    if (!window.confirm(`Vas a desactivar la cooperativa ${item.nombre}.`)) return;
    setError(null);
    try {
      const deleted = await apiFetch<Cooperativa>(`/api/v1/cooperativas/${item.id}`, { method: "DELETE" });
      setItems((current) => current.map((value) => (value.id === deleted.id ? deleted : value)));
    } catch (deleteError) {
      setError(deleteError instanceof ApiError ? deleteError.message : "No se pudo desactivar");
    }
  }

  return (
    <section className="space-y-4">
      <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-stone-500">Configuracion</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-stone-950">Cooperativas</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">Reglas comerciales que validan monto, plazo y edad.</p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:items-center">
            <input className="input-base min-w-0 sm:w-80" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o estado" />
            <button type="button" className="button-primary whitespace-nowrap" onClick={openCreate}>Crear cooperativa</button>
          </div>
        </div>
      </article>

      {loading ? <StateMessage text="Cargando cooperativas..." /> : null}
      {error ? <StateMessage tone="error" text={error} /> : null}

      {!loading && !error ? (
        <div className="overflow-hidden rounded-2xl border border-stone-800/10 bg-white/85 shadow-lg shadow-stone-900/5">
          <div className="hidden grid-cols-[1.1fr_0.9fr_1.2fr_0.9fr_0.9fr_120px] gap-3 border-b border-stone-800/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 md:grid">
            <span>Nombre</span><span>Edad</span><span>Monto</span><span>Plazo</span><span>Estado</span><span className="text-right">Acciones</span>
          </div>
          <div className="divide-y divide-stone-800/10">
            {filtered.map((item) => (
              <div key={item.id} className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[1.1fr_0.9fr_1.2fr_0.9fr_0.9fr_120px] md:items-center md:py-3">
                <div><p className="font-semibold text-stone-950">{item.nombre}</p><p className="mt-1 text-xs text-stone-500">Cooperativa financiera</p></div>
                <p className="text-stone-700">{item.edad_minima} a {item.edad_maxima}</p>
                <p className="text-stone-700">{formatCurrency(item.monto_minimo)} a {formatCurrency(item.monto_maximo)}</p>
                <p className="text-stone-700">
                  {item.plazo_minimo} a {item.plazo_maximo} meses
                  <span className="mt-1 block text-xs text-stone-500">
                    Refi: {item.reglas_refinanciacion?.length ?? 0} regla(s)
                  </span>
                </p>
                <StatusBadge active={item.is_active} />
                <Actions onEdit={() => openEdit(item)} onDelete={() => void handleDelete(item)} deleteDisabled={!item.is_active} />
              </div>
            ))}
            {filtered.length === 0 ? <EmptyState text="No hay cooperativas para la busqueda actual." /> : null}
          </div>
        </div>
      ) : null}

      {modalMode ? (
        <Modal title={modalMode === "create" ? "Crear cooperativa" : "Editar cooperativa"} error={formError} saving={saving} submitLabel={modalMode === "create" ? "Crear cooperativa" : "Guardar cambios"} onClose={closeModal} onSubmit={handleSubmit}>
          <Field label="Nombre" value={form.nombre} onChange={(value) => setForm({ ...form, nombre: value })} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Edad minima" value={form.edad_minima} onChange={(value) => setForm({ ...form, edad_minima: value })} />
            <NumberField label="Edad maxima" value={form.edad_maxima} onChange={(value) => setForm({ ...form, edad_maxima: value })} />
            <NumberField label="Monto minimo" value={form.monto_minimo} onChange={(value) => setForm({ ...form, monto_minimo: value })} />
            <NumberField label="Monto maximo" value={form.monto_maximo} onChange={(value) => setForm({ ...form, monto_maximo: value })} />
            <NumberField label="Plazo minimo" value={form.plazo_minimo} onChange={(value) => setForm({ ...form, plazo_minimo: value })} />
            <NumberField label="Plazo maximo" value={form.plazo_maximo} onChange={(value) => setForm({ ...form, plazo_maximo: value })} />
          </div>
          <div className="rounded-xl border border-stone-800/10 bg-white/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-stone-950">Reglas de refinanciacion</h3>
              <button
                type="button"
                className="button-muted px-3 py-2 text-sm"
                onClick={() =>
                  setForm({
                    ...form,
                    reglas_refinanciacion: [
                      ...form.reglas_refinanciacion,
                      { plazo_minimo: 12, plazo_maximo: 14, meses_para_refinanciar: 6 },
                    ],
                  })
                }
              >
                Agregar regla
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              {form.reglas_refinanciacion.map((regla, index) => (
                <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <NumberField label="Plazo desde" value={regla.plazo_minimo} onChange={(value) => updateRule(index, "plazo_minimo", value)} />
                  <NumberField label="Plazo hasta" value={regla.plazo_maximo} onChange={(value) => updateRule(index, "plazo_maximo", value)} />
                  <NumberField label="Refi al mes" value={regla.meses_para_refinanciar} onChange={(value) => updateRule(index, "meses_para_refinanciar", value)} />
                  <button
                    type="button"
                    className="button-muted self-end px-3 py-2 text-sm"
                    onClick={() =>
                      setForm({
                        ...form,
                        reglas_refinanciacion: form.reglas_refinanciacion.filter((_, itemIndex) => itemIndex !== index),
                      })
                    }
                  >
                    Quitar
                  </button>
                </div>
              ))}
              {form.reglas_refinanciacion.length === 0 ? (
                <p className="text-sm text-stone-500">Sin reglas configuradas.</p>
              ) : null}
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

function Modal({ title, error, saving, submitLabel, onClose, onSubmit, children }: { title: string; error: string | null; saving: boolean; submitLabel: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 px-4 py-6 backdrop-blur-sm"><form onSubmit={onSubmit} className="max-h-[calc(100vh-48px)] w-full max-w-3xl overflow-auto rounded-2xl border border-stone-800/10 bg-white p-5 shadow-2xl shadow-stone-950/20"><div className="flex items-start justify-between gap-3 border-b border-stone-800/10 pb-4"><h2 className="text-xl font-semibold text-stone-950">{title}</h2><button type="button" className="button-muted px-3 py-2 text-sm" onClick={onClose}>Cerrar</button></div>{error ? <div className="mt-4"><StateMessage tone="error" text={error} /></div> : null}<div className="mt-5 grid gap-4">{children}</div><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" className="button-muted" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="button-primary" disabled={saving}>{saving ? "Guardando..." : submitLabel}</button></div></form></div>;
}

function Field({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label className="block text-sm font-medium text-stone-700"><span>{label}</span><input className="input-base mt-2" value={value} onChange={(event) => onChange(event.target.value)} required={required} /></label>;
}

function NumberField({ label, value, onChange, step = "1" }: { label: string; value: number; onChange: (value: number) => void; step?: string }) {
  return <label className="block text-sm font-medium text-stone-700"><span>{label}</span><input className="input-base mt-2" type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} required /></label>;
}

function Actions({ onEdit, onDelete, deleteDisabled }: { onEdit: () => void; onDelete: () => void; deleteDisabled?: boolean }) {
  return <div className="flex items-center gap-2 md:justify-end"><button type="button" className="button-muted px-3 py-2 text-sm" onClick={onEdit}>Editar</button><button type="button" className="inline-flex items-center justify-center rounded-2xl border border-red-500/15 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50" onClick={onDelete} disabled={deleteDisabled}>Eliminar</button></div>;
}

function StatusBadge({ active }: { active: boolean }) {
  return <span className={["inline-flex w-fit items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold", active ? "border-teal-700/20 bg-teal-50 text-teal-800" : "border-stone-800/10 bg-stone-100 text-stone-600"].join(" ")}>{active ? "Activo" : "Inactivo"}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-4 py-8 text-center text-sm text-stone-500">{text}</div>;
}

function StateMessage({ text, tone = "default" }: { text: string; tone?: "default" | "error" }) {
  return <div className={["rounded-2xl border px-5 py-4 text-sm", tone === "error" ? "border-red-500/20 bg-red-50 text-red-700" : "border-stone-800/10 bg-white/65 text-stone-500"].join(" ")}>{text}</div>;
}
