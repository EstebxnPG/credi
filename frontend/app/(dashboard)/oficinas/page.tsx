"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";

type Oficina = {
  id: number;
  nombre: string;
  direccion: string;
  color: string;
  is_active: boolean;
};

type FormValues = {
  nombre: string;
  direccion: string;
  color: string;
};

const emptyForm: FormValues = { nombre: "", direccion: "", color: "blue" };

export default function OficinasPage() {
  const [items, setItems] = useState<Oficina[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Oficina | null>(null);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);

  async function loadItems() {
    setLoading(true);
    setError(null);
    try {
      setItems(await apiFetch<Oficina[]>("/api/v1/oficinas/?solo_activas=false"));
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : "No se pudo cargar oficinas");
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
      [item.nombre, item.direccion, item.is_active ? "activo" : "inactivo"].some((value) =>
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

  function openEdit(item: Oficina) {
    setSelected(item);
    setForm({ nombre: item.nombre, direccion: item.direccion, color: item.color ?? "blue" });
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modalMode) return;

    setSaving(true);
    setFormError(null);
    try {
      if (modalMode === "create") {
        const created = await apiFetch<Oficina>("/api/v1/oficinas/", {
          method: "POST",
          body: JSON.stringify({ nombre: form.nombre.trim(), direccion: form.direccion.trim(), color: form.color }),
        });
        setItems((current) => [created, ...current]);
      } else if (selected) {
        const updated = await apiFetch<Oficina>(`/api/v1/oficinas/${selected.id}`, {
          method: "PATCH",
          body: JSON.stringify({ nombre: form.nombre.trim(), direccion: form.direccion.trim(), color: form.color }),
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

  async function handleDelete(item: Oficina) {
    if (!window.confirm(`Vas a desactivar la oficina ${item.nombre}.`)) return;
    setError(null);
    try {
      const deleted = await apiFetch<Oficina>(`/api/v1/oficinas/${item.id}`, { method: "DELETE" });
      setItems((current) => current.map((value) => (value.id === deleted.id ? deleted : value)));
    } catch (deleteError) {
      setError(deleteError instanceof ApiError ? deleteError.message : "No se pudo desactivar");
    }
  }

  return (
    <section className="space-y-3">
      <Header
        title="Oficinas"
        subtitle="Sedes y cobertura operacional."
        query={query}
        queryPlaceholder="Buscar por nombre, direccion o estado"
        buttonLabel="Crear oficina"
        onQuery={setQuery}
        onCreate={openCreate}
      />
      {loading ? <StateMessage text="Cargando oficinas..." /> : null}
      {error ? <StateMessage tone="error" text={error} /> : null}
      {!loading && !error ? (
        <CatalogTable headers={["Nombre", "Direccion", "Color", "Estado", "Acciones"]}>
          {filtered.map((item) => (
            <div key={item.id} className="grid gap-3 px-3 py-2.5 text-sm md:grid-cols-[1fr_1.3fr_0.7fr_0.7fr_120px] md:items-center md:py-2">
              <p className="font-semibold text-stone-950">{item.nombre}</p>
              <p className="text-stone-700">{item.direccion}</p>
              <OfficeColorBadge color={item.color} label={colorLabel(item.color)} />
              <StatusBadge active={item.is_active} />
              <Actions onEdit={() => openEdit(item)} onDelete={() => void handleDelete(item)} deleteDisabled={!item.is_active} />
            </div>
          ))}
          {filtered.length === 0 ? <EmptyState text="No hay oficinas para la búsqueda actual." /> : null}
        </CatalogTable>
      ) : null}
      {modalMode ? (
        <Modal title={modalMode === "create" ? "Crear oficina" : "Editar oficina"} error={formError} saving={saving} submitLabel={modalMode === "create" ? "Crear oficina" : "Guardar cambios"} onClose={closeModal} onSubmit={handleSubmit}>
          <Field label="Nombre" value={form.nombre} onChange={(value) => setForm({ ...form, nombre: value })} required />
          <Field label="Direccion" value={form.direccion} onChange={(value) => setForm({ ...form, direccion: value })} required />
          <ColorSelect value={form.color} onChange={(value) => setForm({ ...form, color: value })} />
        </Modal>
      ) : null}
    </section>
  );
}

function Header({ title, subtitle, query, queryPlaceholder, buttonLabel, onQuery, onCreate }: { title: string; subtitle: string; query: string; queryPlaceholder: string; buttonLabel: string; onQuery: (value: string) => void; onCreate: () => void }) {
  return (
    <article className="rounded-lg border border-stone-800/10 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-stone-500">Configuración</p>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-stone-950">{title}</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-stone-600">{subtitle}</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:items-center">
          <input className="input-base min-w-0 sm:w-80" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={queryPlaceholder} />
          <button type="button" className="button-primary whitespace-nowrap" onClick={onCreate}>{buttonLabel}</button>
        </div>
      </div>
    </article>
  );
}

function CatalogTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-stone-800/10 bg-white shadow-sm">
      <div className="hidden grid-cols-[1fr_1.3fr_0.7fr_0.7fr_120px] gap-3 border-b border-stone-800/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 md:grid">
        {headers.map((header) => <span key={header} className={header === "Acciones" ? "text-right" : ""}>{header}</span>)}
      </div>
      <div className="divide-y divide-stone-800/10">{children}</div>
    </div>
  );
}

function Modal({ title, error, saving, submitLabel, onClose, onSubmit, children }: { title: string; error: string | null; saving: boolean; submitLabel: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 px-4 py-6 backdrop-blur-sm">
      <form onSubmit={onSubmit} className="max-h-[calc(100vh-48px)] w-full max-w-2xl overflow-auto rounded-lg border border-stone-800/10 bg-white p-5 shadow-xl shadow-stone-950/20">
        <div className="flex items-start justify-between gap-3 border-b border-stone-800/10 pb-3">
          <h2 className="text-xl font-semibold text-stone-950">{title}</h2>
          <button type="button" className="button-muted px-3 py-2 text-sm" onClick={onClose}>Cerrar</button>
        </div>
        {error ? <div className="mt-4"><StateMessage tone="error" text={error} /></div> : null}
        <div className="mt-3 grid gap-3">{children}</div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="button-muted" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="button-primary" disabled={saving}>{saving ? "Guardando..." : submitLabel}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      <span>{label}</span>
      <input className="input-base mt-2" type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </label>
  );
}

function ColorSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const options = [
    { value: "blue", label: "Azul" },
    { value: "red", label: "Rojo" },
    { value: "teal", label: "Verde" },
    { value: "amber", label: "Amarillo" },
    { value: "stone", label: "Gris" },
  ];
  return (
    <label className="block text-sm font-medium text-stone-700">
      <span>Color operativo</span>
      <select className="input-base mt-2" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <span className="mt-2 block"><OfficeColorBadge color={value} label={colorLabel(value)} /></span>
    </label>
  );
}

function OfficeColorBadge({ color, label }: { color: string; label: string }) {
  const classes = {
    blue: "border-blue-700/20 bg-blue-50 text-blue-800",
    red: "border-red-500/20 bg-red-50 text-red-700",
    teal: "border-teal-700/20 bg-teal-50 text-teal-800",
    amber: "border-amber-700/20 bg-amber-50 text-amber-800",
    stone: "border-stone-800/10 bg-stone-100 text-stone-700",
  }[color] ?? "border-stone-800/10 bg-stone-100 text-stone-700";
  return <span className={["inline-flex w-fit items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold", classes].join(" ")}>{label}</span>;
}

function colorLabel(color: string) {
  return ({ blue: "Azul", red: "Rojo", teal: "Verde", amber: "Amarillo", stone: "Gris" } as Record<string, string>)[color] ?? "Gris";
}

function Actions({ onEdit, onDelete, deleteDisabled }: { onEdit: () => void; onDelete: () => void; deleteDisabled?: boolean }) {
  return (
    <div className="flex items-center gap-2 md:justify-end">
      <button type="button" className="button-muted px-3 py-2 text-sm" onClick={onEdit}>Editar</button>
      <button type="button" className="inline-flex items-center justify-center rounded-lg border border-red-500/15 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50" onClick={onDelete} disabled={deleteDisabled}>Eliminar</button>
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return <span className={["inline-flex w-fit items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold", active ? "border-teal-700/20 bg-teal-50 text-teal-800" : "border-stone-800/10 bg-stone-100 text-stone-600"].join(" ")}>{active ? "Activo" : "Inactivo"}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-4 py-8 text-center text-sm text-stone-500">{text}</div>;
}

function StateMessage({ text, tone = "default" }: { text: string; tone?: "default" | "error" }) {
  return <div className={["rounded-lg border px-5 py-4 text-sm", tone === "error" ? "border-red-500/20 bg-red-50 text-red-700" : "border-stone-800/10 bg-white/65 text-stone-500"].join(" ")}>{text}</div>;
}
