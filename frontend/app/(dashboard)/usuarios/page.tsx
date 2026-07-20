"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";

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
  is_active: boolean;
};

type FormValues = {
  nombre: string;
  documento: string;
  correo: string;
  rol: "administrador" | "asesora";
  oficina_id: string;
  contrasena: string;
};

const emptyForm: FormValues = {
  nombre: "",
  documento: "",
  correo: "",
  rol: "asesora",
  oficina_id: "",
  contrasena: "",
};

const MAX_FAILED_ATTEMPTS = 5;

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [oficinas, setOficinas] = useState<Oficina[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Usuario | null>(null);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [usuariosData, oficinasData] = await Promise.all([
        apiFetch<Usuario[]>("/api/v1/usuarios/?limit=15"),
        apiFetch<Oficina[]>("/api/v1/oficinas/?solo_activas=false"),
      ]);
      setUsuarios(usuariosData);
      setOficinas(oficinasData);
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : "No se pudo cargar usuarios");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const oficinaById = useMemo(() => {
    return new Map(oficinas.map((oficina) => [oficina.id, oficina]));
  }, [oficinas]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return usuarios;
    return usuarios.filter((usuario) =>
      [
        usuario.nombre,
        usuario.documento,
        usuario.correo,
        usuario.rol,
        oficinaById.get(usuario.oficina_id)?.nombre,
        usuario.intentos_fallidos >= MAX_FAILED_ATTEMPTS ? "bloqueado" : null,
        usuario.is_active ? "activo" : "inactivo",
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [usuarios, oficinaById, query]);

  function openCreate() {
    setSelected(null);
    setForm({ ...emptyForm, oficina_id: oficinas.find((oficina) => oficina.is_active)?.id.toString() ?? "" });
    setFormError(null);
    setModalMode("create");
  }

  function openEdit(usuario: Usuario) {
    setSelected(usuario);
    setForm({
      nombre: usuario.nombre,
      documento: usuario.documento,
      correo: usuario.correo,
      rol: usuario.rol,
      oficina_id: String(usuario.oficina_id),
      contrasena: "",
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modalMode) return;

    setSaving(true);
    setFormError(null);
    try {
      if (modalMode === "create") {
        const created = await apiFetch<Usuario>("/api/v1/usuarios/", {
          method: "POST",
          body: JSON.stringify({
            nombre: form.nombre.trim(),
            documento: form.documento.trim(),
            correo: form.correo.trim(),
            rol: form.rol,
            oficina_id: Number(form.oficina_id),
            contrasena: form.contrasena,
          }),
        });
        setUsuarios((current) => [created, ...current]);
      } else if (selected) {
        const payload: Record<string, string | number> = {
          nombre: form.nombre.trim(),
          documento: form.documento.trim(),
          correo: form.correo.trim(),
          rol: form.rol,
          oficina_id: Number(form.oficina_id),
        };

        if (form.contrasena.trim()) {
          payload.contrasena = form.contrasena;
        }

        const updated = await apiFetch<Usuario>(`/api/v1/usuarios/${selected.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setUsuarios((current) => current.map((usuario) => (usuario.id === updated.id ? updated : usuario)));
      }
      closeModal();
    } catch (saveError) {
      setFormError(saveError instanceof ApiError ? saveError.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(usuario: Usuario) {
    if (!window.confirm(`Vas a desactivar el usuario ${usuario.nombre}.`)) return;
    setError(null);
    try {
      await apiFetch<void>(`/api/v1/usuarios/${usuario.id}`, { method: "DELETE" });
      setUsuarios((current) =>
        current.map((item) => (item.id === usuario.id ? { ...item, is_active: false } : item)),
      );
    } catch (deleteError) {
      setError(deleteError instanceof ApiError ? deleteError.message : "No se pudo desactivar");
    }
  }

  async function handleUnlock(usuario: Usuario) {
    setError(null);
    try {
      const updated = await apiFetch<Usuario>(`/api/v1/usuarios/${usuario.id}/desbloquear`, { method: "PATCH" });
      setUsuarios((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (selected?.id === updated.id) {
        setSelected(updated);
      }
    } catch (unlockError) {
      setError(unlockError instanceof ApiError ? unlockError.message : "No se pudo desbloquear");
    }
  }

  return (
    <section className="space-y-3">
      <article className="rounded-lg border border-stone-800/10 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-stone-500">Configuración</p>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-stone-950">Usuarios</h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-stone-600">Administra accesos, roles y oficina asignada.</p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:items-center">
            <input className="input-base min-w-0 sm:w-80" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, correo, documento o rol" />
            <button type="button" className="button-primary whitespace-nowrap" onClick={openCreate}>Crear usuario</button>
          </div>
        </div>
      </article>

      {loading ? <StateMessage text="Cargando usuarios..." /> : null}
      {error ? <StateMessage tone="error" text={error} /> : null}

      {!loading && !error ? (
        <div className="overflow-hidden rounded-lg border border-stone-800/10 bg-white shadow-sm">
          <div className="hidden grid-cols-[1.1fr_1.1fr_0.7fr_0.9fr_0.8fr_180px] gap-3 border-b border-stone-800/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 md:grid">
            <span>Usuario</span><span>Correo</span><span>Rol</span><span>Oficina</span><span>Estado</span><span className="text-right">Acciones</span>
          </div>
          <div className="divide-y divide-stone-800/10">
            {filtered.map((usuario) => (
              <div key={usuario.id} className="grid gap-3 px-3 py-2.5 text-sm md:grid-cols-[1.1fr_1.1fr_0.7fr_0.9fr_0.8fr_180px] md:items-center md:py-2">
                <div><p className="font-semibold text-stone-950">{usuario.nombre}</p><p className="mt-1 text-xs text-stone-500">{usuario.documento}</p></div>
                <p className="break-all text-stone-700">{usuario.correo}</p>
                <p className="text-stone-700">{usuario.rol}</p>
                <p className="text-stone-700">{oficinaById.get(usuario.oficina_id)?.nombre ?? `Oficina #${usuario.oficina_id}`}</p>
                <StatusBadge active={usuario.is_active} attempts={usuario.intentos_fallidos} />
                <Actions onEdit={() => openEdit(usuario)} onUnlock={() => void handleUnlock(usuario)} onDelete={() => void handleDelete(usuario)} deleteDisabled={!usuario.is_active} unlockVisible={usuario.is_active && usuario.intentos_fallidos >= MAX_FAILED_ATTEMPTS} />
              </div>
            ))}
            {filtered.length === 0 ? <EmptyState text="No hay usuarios para la búsqueda actual." /> : null}
          </div>
        </div>
      ) : null}

      {modalMode ? (
        <Modal title={modalMode === "create" ? "Crear usuario" : "Editar usuario"} error={formError} saving={saving} submitLabel={modalMode === "create" ? "Crear usuario" : "Guardar cambios"} onClose={closeModal} onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" value={form.nombre} onChange={(value) => setForm({ ...form, nombre: value })} required />
            <Field label="Documento" value={form.documento} onChange={(value) => setForm({ ...form, documento: value })} required />
            <Field label="Correo" type="email" value={form.correo} onChange={(value) => setForm({ ...form, correo: value })} required />
            <SelectField label="Rol" value={form.rol} onChange={(value) => setForm({ ...form, rol: value as FormValues["rol"] })} options={[{ value: "asesora", label: "Asesora" }, { value: "administrador", label: "Administrador" }]} />
            <SelectField label="Oficina" value={form.oficina_id} onChange={(value) => setForm({ ...form, oficina_id: value })} options={oficinas.filter((oficina) => oficina.is_active || String(oficina.id) === form.oficina_id).map((oficina) => ({ value: String(oficina.id), label: oficina.nombre }))} />
            <Field label={modalMode === "create" ? "Contraseña" : "Nueva contraseña"} type="password" value={form.contrasena} onChange={(value) => setForm({ ...form, contrasena: value })} required={modalMode === "create"} />
          </div>
          {modalMode === "edit" && selected ? (
            <div className="rounded-lg border border-stone-800/10 bg-stone-50 p-3 text-sm text-stone-700">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">Intentos fallidos: {selected.intentos_fallidos}</p>
                  <p className="mt-1 text-xs text-stone-500">Deja la nueva contraseña vacía si no quieres cambiarla.</p>
                </div>
                {selected.intentos_fallidos >= MAX_FAILED_ATTEMPTS ? (
                  <button type="button" className="button-muted whitespace-nowrap" onClick={() => void handleUnlock(selected)} disabled={saving}>
                    Desbloquear cuenta
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </Modal>
      ) : null}
    </section>
  );
}

function Modal({ title, error, saving, submitLabel, onClose, onSubmit, children }: { title: string; error: string | null; saving: boolean; submitLabel: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 px-4 py-6 backdrop-blur-sm"><form onSubmit={onSubmit} className="max-h-[calc(100vh-32px)] w-full max-w-3xl overflow-auto rounded-lg border border-stone-800/10 bg-white p-4 shadow-xl shadow-stone-950/10"><div className="flex items-start justify-between gap-3 border-b border-stone-800/10 pb-3"><h2 className="text-xl font-semibold text-stone-950">{title}</h2><button type="button" className="button-muted px-3 py-2 text-sm" onClick={onClose}>Cerrar</button></div>{error ? <div className="mt-4"><StateMessage tone="error" text={error} /></div> : null}<div className="mt-3 grid gap-3">{children}</div><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" className="button-muted" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="button-primary" disabled={saving}>{saving ? "Guardando..." : submitLabel}</button></div></form></div>;
}

function Field({ label, value, onChange, type = "text", required = false, disabled = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; disabled?: boolean }) {
  return <label className="block text-sm font-medium text-stone-700"><span>{label}</span><input className="input-base mt-2 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500" type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} disabled={disabled} /></label>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return <label className="block text-sm font-medium text-stone-700"><span>{label}</span><select className="input-base mt-2" value={value} onChange={(event) => onChange(event.target.value)} required><option value="">Seleccionar</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function Actions({ onEdit, onUnlock, onDelete, deleteDisabled, unlockVisible }: { onEdit: () => void; onUnlock: () => void; onDelete: () => void; deleteDisabled?: boolean; unlockVisible?: boolean }) {
  return <div className="flex flex-wrap items-center gap-2 md:justify-end"><button type="button" className="button-muted px-3 py-2 text-sm" onClick={onEdit}>Editar</button>{unlockVisible ? <button type="button" className="button-primary px-3 py-2 text-sm" onClick={onUnlock}>Desbloquear</button> : null}<button type="button" className="inline-flex items-center justify-center rounded-lg border border-red-500/15 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50" onClick={onDelete} disabled={deleteDisabled}>Eliminar</button></div>;
}

function StatusBadge({ active, attempts }: { active: boolean; attempts: number }) {
  const blocked = active && attempts >= MAX_FAILED_ATTEMPTS;
  const label = blocked ? "Bloqueado" : active ? "Activo" : "Inactivo";
  const classes = blocked ? "border-red-500/20 bg-red-50 text-red-700" : active ? "border-teal-700/20 bg-teal-50 text-teal-800" : "border-stone-800/10 bg-stone-100 text-stone-600";
  return <span className={["inline-flex w-fit items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold", classes].join(" ")}>{label}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-4 py-8 text-center text-sm text-stone-500">{text}</div>;
}

function StateMessage({ text, tone = "default" }: { text: string; tone?: "default" | "error" }) {
  return <div className={["rounded-lg border px-5 py-4 text-sm", tone === "error" ? "border-red-500/20 bg-red-50 text-red-700" : "border-stone-800/10 bg-white/65 text-stone-500"].join(" ")}>{text}</div>;
}
