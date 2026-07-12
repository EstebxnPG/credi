"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";

type Pagaduria = {
  id: number;
  nombre: string;
  is_active: boolean;
};

export default function PagaduriasPage() {
  const [items, setItems] = useState<Pagaduria[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Pagaduria | null>(null);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [nombre, setNombre] = useState("");

  async function loadItems() {
    setLoading(true);
    setError(null);
    try {
      setItems(await apiFetch<Pagaduria[]>("/api/v1/pagadurias/?solo_activas=false"));
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : "No se pudo cargar pagadurias");
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
    setNombre("");
    setFormError(null);
    setModalMode("create");
  }

  function openEdit(item: Pagaduria) {
    setSelected(item);
    setNombre(item.nombre);
    setFormError(null);
    setModalMode("edit");
  }

  function closeModal() {
    if (saving) return;
    setModalMode(null);
    setSelected(null);
    setNombre("");
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modalMode) return;

    setSaving(true);
    setFormError(null);
    try {
      if (modalMode === "create") {
        const created = await apiFetch<Pagaduria>("/api/v1/pagadurias/", {
          method: "POST",
          body: JSON.stringify({ nombre: nombre.trim() }),
        });
        setItems((current) => [created, ...current]);
      } else if (selected) {
        const updated = await apiFetch<Pagaduria>(`/api/v1/pagadurias/${selected.id}`, {
          method: "PATCH",
          body: JSON.stringify({ nombre: nombre.trim() }),
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

  async function handleDelete(item: Pagaduria) {
    if (!window.confirm(`Vas a desactivar la pagaduria ${item.nombre}.`)) return;
    setError(null);
    try {
      const deleted = await apiFetch<Pagaduria>(`/api/v1/pagadurias/${item.id}`, { method: "DELETE" });
      setItems((current) => current.map((value) => (value.id === deleted.id ? deleted : value)));
    } catch (deleteError) {
      setError(deleteError instanceof ApiError ? deleteError.message : "No se pudo desactivar");
    }
  }

  return (
    <section className="space-y-3">
      <Header query={query} onQuery={setQuery} onCreate={openCreate} />
      {loading ? <StateMessage text="Cargando pagadurias..." /> : null}
      {error ? <StateMessage tone="error" text={error} /> : null}
      {!loading && !error ? (
        <div className="overflow-hidden rounded-lg border border-stone-800/10 bg-white shadow-sm">
          <div className="hidden grid-cols-[1fr_0.7fr_120px] gap-3 border-b border-stone-800/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 md:grid">
            <span>Nombre</span>
            <span>Estado</span>
            <span className="text-right">Acciones</span>
          </div>
          <div className="divide-y divide-stone-800/10">
            {filtered.map((item) => (
              <div key={item.id} className="grid gap-3 px-3 py-2.5 text-sm md:grid-cols-[1fr_0.7fr_120px] md:items-center md:py-2">
                <p className="font-semibold text-stone-950">{item.nombre}</p>
                <StatusBadge active={item.is_active} />
                <Actions onEdit={() => openEdit(item)} onDelete={() => void handleDelete(item)} deleteDisabled={!item.is_active} />
              </div>
            ))}
            {filtered.length === 0 ? <EmptyState text="No hay pagadurias para la busqueda actual." /> : null}
          </div>
        </div>
      ) : null}
      {modalMode ? (
        <Modal title={modalMode === "create" ? "Crear pagaduria" : "Editar pagaduria"} error={formError} saving={saving} submitLabel={modalMode === "create" ? "Crear pagaduria" : "Guardar cambios"} onClose={closeModal} onSubmit={handleSubmit}>
          <Field label="Nombre" value={nombre} onChange={setNombre} required />
        </Modal>
      ) : null}
    </section>
  );
}

function Header({ query, onQuery, onCreate }: { query: string; onQuery: (value: string) => void; onCreate: () => void }) {
  return (
    <article className="rounded-lg border border-stone-800/10 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-stone-500">Configuracion</p>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-stone-950">Pagadurias</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-stone-600">Entidades pagadoras usadas en creditos.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:items-center">
          <input className="input-base min-w-0 sm:w-80" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Buscar por nombre o estado" />
          <button type="button" className="button-primary whitespace-nowrap" onClick={onCreate}>Crear pagaduria</button>
        </div>
      </div>
    </article>
  );
}

function Modal({ title, error, saving, submitLabel, onClose, onSubmit, children }: { title: string; error: string | null; saving: boolean; submitLabel: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 px-4 py-6 backdrop-blur-sm">
      <form onSubmit={onSubmit} className="max-h-[calc(100vh-48px)] w-full max-w-xl overflow-auto rounded-lg border border-stone-800/10 bg-white p-5 shadow-xl shadow-stone-950/20">
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

function Field({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      <span>{label}</span>
      <input className="input-base mt-2" value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </label>
  );
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
