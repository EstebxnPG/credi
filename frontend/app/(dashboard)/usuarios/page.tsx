"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError, apiFetch } from "@/lib/api";
import { readSession } from "@/lib/session";

type Usuario = {
  id: number;
  nombre: string;
  documento: string;
  correo: string;
  rol: "administrador" | "asesora";
  oficina_id: number;
  is_active: boolean;
  intentos_fallidos: number;
};

type Oficina = {
  id: number;
  nombre: string;
  is_active?: boolean;
};

type UsuarioFormState = {
  nombre: string;
  documento: string;
  correo: string;
  rol: "administrador" | "asesora";
  oficina_id: string;
  contrasena: string;
};

const initialForm: UsuarioFormState = {
  nombre: "",
  documento: "",
  correo: "",
  rol: "asesora",
  oficina_id: "",
  contrasena: "",
};

export default function UsuariosPage() {
  const router = useRouter();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [oficinas, setOficinas] = useState<Oficina[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<UsuarioFormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const session = readSession();
    if (!session) {
      router.replace("/login?message=Inicia sesion para administrar usuarios");
      return;
    }
  }, [router]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [usuariosData, oficinasData] = await Promise.all([
        apiFetch<Usuario[]>("/api/v1/usuarios/"),
        apiFetch<Oficina[]>("/api/v1/oficinas/?solo_activas=false"),
      ]);

      const orderedUsuarios = [...usuariosData].sort((left, right) => {
        if (left.is_active !== right.is_active) {
          return left.is_active ? -1 : 1;
        }
        return right.id - left.id;
      });

      const orderedOficinas = [...oficinasData].sort((left, right) => {
        const leftActive = left.is_active !== false;
        const rightActive = right.is_active !== false;
        if (leftActive !== rightActive) {
          return leftActive ? -1 : 1;
        }
        return left.nombre.localeCompare(right.nombre, "es");
      });

      setUsuarios(orderedUsuarios);
      setOficinas(orderedOficinas);
      setSelectedId((current) => {
        if (current && orderedUsuarios.some((item) => item.id === current)) {
          return current;
        }
        return orderedUsuarios[0]?.id ?? null;
      });
      setForm((current) => ({
        ...current,
        oficina_id: current.oficina_id || String(orderedOficinas[0]?.id ?? ""),
      }));
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : "No se pudieron cargar los usuarios",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const oficinasMap = useMemo(() => {
    return new Map(oficinas.map((oficina) => [oficina.id, oficina.nombre]));
  }, [oficinas]);

  const filteredUsuarios = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return usuarios;
    }

    return usuarios.filter((usuario) =>
      [usuario.nombre, usuario.documento, usuario.correo, usuario.rol]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [query, usuarios]);

  const selectedUsuario = useMemo(
    () => usuarios.find((usuario) => usuario.id === selectedId) ?? null,
    [selectedId, usuarios],
  );

  function resetForm() {
    setEditingId(null);
    setForm({
      ...initialForm,
      oficina_id: String(oficinas[0]?.id ?? ""),
    });
  }

  function startEdit(usuario: Usuario) {
    setEditingId(usuario.id);
    setForm({
      nombre: usuario.nombre,
      documento: usuario.documento,
      correo: usuario.correo,
      rol: usuario.rol,
      oficina_id: String(usuario.oficina_id),
      contrasena: "",
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = editingId
        ? {
            nombre: form.nombre.trim(),
            correo: form.correo.trim(),
            rol: form.rol,
            oficina_id: Number(form.oficina_id),
          }
        : {
            nombre: form.nombre.trim(),
            documento: form.documento.trim(),
            correo: form.correo.trim(),
            rol: form.rol,
            oficina_id: Number(form.oficina_id),
            contrasena: form.contrasena,
          };

      const usuario = await apiFetch<Usuario>(
        editingId ? `/api/v1/usuarios/${editingId}` : "/api/v1/usuarios/",
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );

      setUsuarios((current) => {
        if (editingId) {
          return current
            .map((item) => (item.id === usuario.id ? usuario : item))
            .sort((left, right) => {
              if (left.is_active !== right.is_active) {
                return left.is_active ? -1 : 1;
              }
              return right.id - left.id;
            });
        }

        return [usuario, ...current];
      });
      setSelectedId(usuario.id);
      setSuccess(editingId ? "Usuario actualizado correctamente." : "Usuario creado correctamente.");
      resetForm();
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : "No se pudo guardar el usuario",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(usuario: Usuario) {
    if (!window.confirm(`Vas a desactivar a ${usuario.nombre}. Deseas continuar?`)) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      await apiFetch<void>(`/api/v1/usuarios/${usuario.id}`, {
        method: "DELETE",
      });

      setUsuarios((current) =>
        current
          .map((item) =>
            item.id === usuario.id ? { ...item, is_active: false } : item,
          )
          .sort((left, right) => {
            if (left.is_active !== right.is_active) {
              return left.is_active ? -1 : 1;
            }
            return right.id - left.id;
          }),
      );
      setSuccess("Usuario desactivado correctamente.");
    } catch (deleteError) {
      setError(
        deleteError instanceof ApiError
          ? deleteError.message
          : "No se pudo desactivar el usuario",
      );
    }
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <article className="glass-panel p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-stone-500">
            Administracion
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
            Usuarios y roles
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600">
            Aqui controlas accesos, rol, oficina asignada y estado del usuario.
            Si este modulo queda flojo, despues todo el sistema se vuelve
            indisciplinado.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <MetricCard label="Total" value={String(usuarios.length)} />
            <MetricCard
              label="Activos"
              value={String(usuarios.filter((item) => item.is_active).length)}
            />
            <MetricCard
              label="Admins"
              value={String(usuarios.filter((item) => item.rol === "administrador").length)}
            />
          </div>
        </article>

        <article className="glass-panel p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
                Formulario
              </p>
              <h2 className="mt-2 text-xl font-semibold text-stone-950">
                {editingId ? "Editar usuario" : "Nuevo usuario"}
              </h2>
            </div>

            {editingId ? (
              <button type="button" className="button-muted" onClick={resetForm}>
                Cancelar
              </button>
            ) : null}
          </div>

          <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
            <InputField
              label="Nombre"
              value={form.nombre}
              onChange={(value) => setForm((current) => ({ ...current, nombre: value }))}
              required
            />
            <InputField
              label="Documento"
              value={form.documento}
              onChange={(value) =>
                setForm((current) => ({ ...current, documento: value }))
              }
              required={!editingId}
              disabled={Boolean(editingId)}
            />
            <InputField
              label="Correo"
              type="email"
              value={form.correo}
              onChange={(value) => setForm((current) => ({ ...current, correo: value }))}
              required
            />

            <div className="grid gap-3 md:grid-cols-2">
              <SelectField
                label="Rol"
                value={form.rol}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    rol: value as UsuarioFormState["rol"],
                  }))
                }
                options={[
                  { value: "asesora", label: "Asesora" },
                  { value: "administrador", label: "Administrador" },
                ]}
              />
              <SelectField
                label="Oficina"
                value={form.oficina_id}
                onChange={(value) =>
                  setForm((current) => ({ ...current, oficina_id: value }))
                }
                options={oficinas
                  .filter((item) => item.is_active !== false)
                  .map((item) => ({ value: String(item.id), label: item.nombre }))}
              />
            </div>

            {!editingId ? (
              <InputField
                label="Contrasena"
                type="password"
                value={form.contrasena}
                onChange={(value) =>
                  setForm((current) => ({ ...current, contrasena: value }))
                }
                required
              />
            ) : null}

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
              {saving ? "Guardando..." : editingId ? "Actualizar usuario" : "Crear usuario"}
            </button>
          </form>
        </article>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <article className="glass-panel overflow-hidden">
          <div className="border-b border-stone-800/10 px-6 py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-stone-950">Listado</h2>
                <p className="mt-1 text-sm text-stone-500">
                  Busca por nombre, documento, correo o rol.
                </p>
              </div>

              <input
                className="input-base max-w-[320px]"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar usuario..."
              />
            </div>
          </div>

          <div className="space-y-3 p-4">
            {loading ? (
              <EmptyState text="Cargando usuarios..." />
            ) : filteredUsuarios.length === 0 ? (
              <EmptyState text="No hay usuarios para mostrar." />
            ) : (
              filteredUsuarios.map((usuario) => {
                const active = usuario.id === selectedId;

                return (
                  <button
                    key={usuario.id}
                    type="button"
                    onClick={() => setSelectedId(usuario.id)}
                    className={[
                      "w-full rounded-3xl border px-5 py-4 text-left transition",
                      active
                        ? "border-teal-700/20 bg-teal-950 text-white shadow-xl shadow-teal-950/15"
                        : "border-stone-800/10 bg-white/65 hover:bg-white/90",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] opacity-70">
                          Usuario #{usuario.id}
                        </p>
                        <h3 className="mt-2 text-xl font-semibold">{usuario.nombre}</h3>
                        <p className="mt-1 text-sm opacity-80">{usuario.correo}</p>
                      </div>

                      <span
                        className={[
                          "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
                          usuario.is_active
                            ? active
                              ? "bg-white/15 text-white"
                              : "bg-emerald-100 text-emerald-700"
                            : active
                              ? "bg-white/15 text-white"
                              : "bg-stone-900/5 text-stone-500",
                        ].join(" ")}
                      >
                        {usuario.is_active ? "Activo" : "Inactivo"}
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
            Detalle rapido
          </p>

          {!selectedUsuario ? (
            <EmptyState text="Selecciona un usuario para ver su detalle." />
          ) : (
            <div className="mt-5 space-y-4">
              <DetailRow label="Nombre" value={selectedUsuario.nombre} />
              <DetailRow label="Documento" value={selectedUsuario.documento} />
              <DetailRow label="Correo" value={selectedUsuario.correo} />
              <DetailRow
                label="Rol"
                value={selectedUsuario.rol === "administrador" ? "Administrador" : "Asesora"}
              />
              <DetailRow
                label="Oficina"
                value={oficinasMap.get(selectedUsuario.oficina_id) ?? `Oficina #${selectedUsuario.oficina_id}`}
              />
              <DetailRow
                label="Intentos fallidos"
                value={String(selectedUsuario.intentos_fallidos)}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className="button-muted"
                  onClick={() => startEdit(selectedUsuario)}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="rounded-2xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:border-stone-800/10 disabled:bg-stone-100 disabled:text-stone-400"
                  onClick={() => void handleDeactivate(selectedUsuario)}
                  disabled={!selectedUsuario.is_active}
                >
                  {selectedUsuario.is_active ? "Desactivar" : "Usuario inactivo"}
                </button>
              </div>
            </div>
          )}
        </article>
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

function InputField({
  label,
  value,
  onChange,
  type = "text",
  required,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-stone-700">{label}</label>
      <input
        className="input-base disabled:cursor-not-allowed disabled:bg-stone-100"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        required={required}
        disabled={disabled}
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
        <option value="">Selecciona una opcion</option>
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
