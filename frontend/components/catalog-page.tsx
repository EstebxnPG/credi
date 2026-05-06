"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError, apiFetch } from "@/lib/api";
import { readSession } from "@/lib/session";

type CatalogField =
  | {
      key: string;
      label: string;
      type?: "text" | "number";
      placeholder?: string;
      requiredOnCreate?: boolean;
    }
  | {
      key: string;
      label: string;
      type: "textarea";
      placeholder?: string;
      requiredOnCreate?: boolean;
    };

type CatalogRecord = {
  id: number;
  nombre: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: string | number | boolean | null | undefined;
};

type CatalogPageProps<TRecord extends CatalogRecord> = {
  title: string;
  description: string;
  endpoint: string;
  fields: CatalogField[];
  getSummary: (items: TRecord[]) => Array<{ label: string; value: string }>;
  renderDetailRows: (item: TRecord) => Array<{ label: string; value: string }>;
  getItemSubtitle?: (item: TRecord) => string;
};

function buildInitialForm(fields: CatalogField[]) {
  return fields.reduce<Record<string, string>>((accumulator, field) => {
    accumulator[field.key] = "";
    return accumulator;
  }, {});
}

export function CatalogPage<TRecord extends CatalogRecord>({
  title,
  description,
  endpoint,
  fields,
  getSummary,
  renderDetailRows,
  getItemSubtitle,
}: CatalogPageProps<TRecord>) {
  const router = useRouter();
  const [items, setItems] = useState<TRecord[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<Record<string, string>>(buildInitialForm(fields));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const session = readSession();
    if (!session) {
      router.replace(`/login?message=Inicia sesión para gestionar ${title.toLowerCase()}`);
      return;
    }
  }, [router, title]);

  async function loadItems() {
    setLoading(true);
    setError(null);

    try {
      const data = await apiFetch<TRecord[]>(`${endpoint}?solo_activas=false`);
      setItems(data);
      setSelectedId((current) => {
        if (current && data.some((item) => item.id === current)) {
          return current;
        }
        return data[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : `No se pudieron cargar ${title.toLowerCase()}`,
      );
      setItems([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

  const orderedItems = useMemo(() => {
    return [...items].sort((left, right) => {
      const leftActive = left.is_active !== false;
      const rightActive = right.is_active !== false;

      if (leftActive !== rightActive) {
        return leftActive ? -1 : 1;
      }

      return right.id - left.id;
    });
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return orderedItems;
    }

    return orderedItems.filter((item) =>
      Object.values(item).some((value) =>
        value !== null &&
        value !== undefined &&
        String(value).toLowerCase().includes(normalized),
      ),
    );
  }, [orderedItems, query]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  function resetForm() {
    setEditingId(null);
    setForm(buildInitialForm(fields));
  }

  function startEdit(item: TRecord) {
    setEditingId(item.id);
    const nextForm = buildInitialForm(fields);

    fields.forEach((field) => {
      nextForm[field.key] = item[field.key] ? String(item[field.key]) : "";
    });

    setForm(nextForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = fields.reduce<Record<string, string | number | null>>(
        (accumulator, field) => {
          const rawValue = form[field.key];
          if (field.type === "number") {
            accumulator[field.key] = rawValue === "" ? null : Number(rawValue);
          } else {
            accumulator[field.key] = rawValue.trim() === "" ? null : rawValue.trim();
          }
          return accumulator;
        },
        {},
      );

      const cleanedPayload = Object.fromEntries(
        Object.entries(payload).filter(([, value]) => value !== null),
      );

      const result = await apiFetch<TRecord>(
        editingId ? `${endpoint}/${editingId}` : `${endpoint}/`,
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify(cleanedPayload),
        },
      );

      setItems((current) => {
        if (editingId) {
          return current.map((item) => (item.id === result.id ? result : item));
        }
        return [result, ...current];
      });
      setSelectedId(result.id);
      setSuccess(editingId ? "Registro actualizado correctamente." : "Registro creado correctamente.");
      resetForm();
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : "No se pudo guardar el registro",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(item: TRecord) {
    const confirmed = window.confirm(
      `Vas a desactivar ${item.nombre}. ¿Deseas continuar?`,
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      const updated = await apiFetch<TRecord>(`${endpoint}/${item.id}`, {
        method: "DELETE",
      });

      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === updated.id ? updated : currentItem,
        ),
      );
      setSelectedId(updated.id);
      setSuccess("Registro desactivado correctamente.");
    } catch (deleteError) {
      setError(
        deleteError instanceof ApiError
          ? deleteError.message
          : "No se pudo desactivar el registro",
      );
    }
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <article className="glass-panel p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-stone-500">
            Catálogo funcional
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600">
            {description}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {getSummary(items).map((item) => (
              <SummaryCard key={item.label} label={item.label} value={item.value} />
            ))}
          </div>
        </article>

        <article className="glass-panel p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
                Formulario
              </p>
              <h2 className="mt-2 text-xl font-semibold text-stone-950">
                {editingId ? "Editar registro" : "Nuevo registro"}
              </h2>
            </div>

            {editingId ? (
              <button type="button" className="button-muted" onClick={resetForm}>
                Cancelar
              </button>
            ) : null}
          </div>

          <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
            {fields.map((field) =>
              field.type === "textarea" ? (
                <div key={field.key}>
                  <label className="mb-2 block text-sm font-medium text-stone-700">
                    {field.label}
                  </label>
                  <textarea
                    className="input-base min-h-[110px] resize-none"
                    value={form[field.key]}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                    placeholder={field.placeholder}
                    required={!editingId && field.requiredOnCreate}
                  />
                </div>
              ) : (
                <div key={field.key}>
                  <label className="mb-2 block text-sm font-medium text-stone-700">
                    {field.label}
                  </label>
                  <input
                    className="input-base"
                    value={form[field.key]}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                    placeholder={field.placeholder}
                    type={field.type ?? "text"}
                    required={!editingId && field.requiredOnCreate}
                  />
                </div>
              ),
            )}

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
              {saving ? "Guardando..." : editingId ? "Actualizar" : "Crear"}
            </button>
          </form>
        </article>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <article className="glass-panel overflow-hidden">
          <div className="border-b border-stone-800/10 px-6 py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-stone-950">
                  Listado
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  Busca por cualquier dato visible del catálogo.
                </p>
              </div>

              <input
                className="input-base max-w-[320px]"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar..."
              />
            </div>
          </div>

          <div className="space-y-3 p-4">
            {loading ? (
              <EmptyState text="Cargando registros..." />
            ) : filteredItems.length === 0 ? (
              <EmptyState text="No hay resultados para mostrar." />
            ) : (
              filteredItems.map((item) => {
                const active = item.id === selectedId;
                const itemIsActive = item.is_active !== false;

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
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] opacity-70">
                          Registro #{item.id}
                        </p>
                        <h3 className="mt-2 text-xl font-semibold">{item.nombre}</h3>
                        {getItemSubtitle ? (
                          <p className="mt-1 text-sm opacity-80">
                            {getItemSubtitle(item)}
                          </p>
                        ) : null}
                      </div>

                      <span
                        className={[
                          "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
                          itemIsActive
                            ? active
                              ? "bg-white/15 text-white"
                              : "bg-emerald-100 text-emerald-700"
                            : active
                              ? "bg-white/15 text-white"
                              : "bg-stone-900/5 text-stone-500",
                        ].join(" ")}
                      >
                        {itemIsActive ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </article>

        <article className="glass-panel p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
            Detalle rápido
          </p>

          {!selectedItem ? (
            <EmptyState text="Selecciona un registro para ver su detalle." />
          ) : (
            <div className="mt-5 space-y-4">
              {renderDetailRows(selectedItem).map((row) => (
                <DetailRow key={row.label} label={row.label} value={row.value} />
              ))}

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className="button-muted"
                  onClick={() => startEdit(selectedItem)}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="rounded-2xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:border-stone-800/10 disabled:bg-stone-100 disabled:text-stone-400"
                  onClick={() => void handleDeactivate(selectedItem)}
                  disabled={selectedItem.is_active === false}
                >
                  {selectedItem.is_active === false ? "Registro inactivo" : "Desactivar"}
                </button>
              </div>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
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
