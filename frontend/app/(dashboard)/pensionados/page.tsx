"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";

type Pensionado = {
  id: number;
  nombre: string;
  segundo_nombre: string | null;
  apellidos: string;
  genero: string;
  nombre_completo: string;
  documento: string;
  fecha_nacimiento: string;
  telefono: string | null;
  celular: string | null;
  direccion: string;
  fecha_inicio_pension: string;
  is_active: boolean;
};

type PensionadoCreatePayload = {
  nombre: string;
  segundo_nombre: string | null;
  apellidos: string;
  genero: string;
  documento: string;
  fecha_nacimiento: string;
  telefono: string;
  celular: string | null;
  direccion: string;
  fecha_inicio_pension: string;
};

type PensionadoUpdatePayload = {
  nombre: string;
  segundo_nombre: string | null;
  apellidos: string;
  genero: string;
  telefono: string | null;
  celular: string | null;
  direccion: string;
};

type FormValues = {
  nombre: string;
  segundo_nombre: string;
  apellidos: string;
  genero: string;
  documento: string;
  fecha_nacimiento: string;
  telefono: string;
  celular: string;
  direccion: string;
  fecha_inicio_pension: string;
};

type FormMode = "create" | "edit";

const emptyForm: FormValues = {
  nombre: "",
  segundo_nombre: "",
  apellidos: "",
  genero: "No especificado",
  documento: "",
  fecha_nacimiento: "",
  telefono: "",
  celular: "",
  direccion: "",
  fecha_inicio_pension: "",
};

export default function PensionadosPage() {
  const router = useRouter();
  const [pensionados, setPensionados] = useState<Pensionado[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<FormMode | null>(null);
  const [selected, setSelected] = useState<Pensionado | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);

  async function loadPensionados() {
    setLoading(true);
    setError(null);

    try {
      const data = await apiFetch<Pensionado[]>(
        "/api/v1/pensionados/?limit=200",
      );
      setPensionados(data);
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : "No se pudo cargar la lista de pensionados",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPensionados();
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return pensionados;
    }

    return pensionados.filter((pensionado) =>
      [
        pensionado.nombre,
        pensionado.segundo_nombre,
        pensionado.apellidos,
        pensionado.nombre_completo,
        pensionado.genero,
        pensionado.documento,
        pensionado.celular,
        pensionado.telefono,
        pensionado.direccion,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [pensionados, query]);

  function openCreateModal() {
    setSelected(null);
    setForm(emptyForm);
    setFormError(null);
    setModalMode("create");
  }

  function openEditModal(pensionado: Pensionado) {
    setSelected(pensionado);
    setForm({
      nombre: pensionado.nombre,
      segundo_nombre: pensionado.segundo_nombre ?? "",
      apellidos: pensionado.apellidos,
      genero: pensionado.genero,
      documento: pensionado.documento,
      fecha_nacimiento: pensionado.fecha_nacimiento,
      telefono: pensionado.telefono ?? "",
      celular: pensionado.celular ?? "",
      direccion: pensionado.direccion,
      fecha_inicio_pension: pensionado.fecha_inicio_pension,
    });
    setFormError(null);
    setModalMode("edit");
  }

  function closeModal() {
    if (saving) {
      return;
    }

    setModalMode(null);
    setSelected(null);
    setForm(emptyForm);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!modalMode) {
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      if (modalMode === "create") {
        const payload: PensionadoCreatePayload = {
          nombre: form.nombre.trim(),
          segundo_nombre: nullableText(form.segundo_nombre),
          apellidos: form.apellidos.trim(),
          genero: form.genero,
          documento: form.documento.trim(),
          fecha_nacimiento: form.fecha_nacimiento,
          telefono: form.telefono.trim(),
          celular: nullableText(form.celular),
          direccion: form.direccion.trim(),
          fecha_inicio_pension: form.fecha_inicio_pension,
        };

        const created = await apiFetch<Pensionado>("/api/v1/pensionados/", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        setPensionados((current) => [created, ...current]);
      } else if (selected) {
        const payload: PensionadoUpdatePayload = {
          nombre: form.nombre.trim(),
          segundo_nombre: nullableText(form.segundo_nombre),
          apellidos: form.apellidos.trim(),
          genero: form.genero,
          telefono: nullableText(form.telefono),
          celular: nullableText(form.celular),
          direccion: form.direccion.trim(),
        };

        const updated = await apiFetch<Pensionado>(`/api/v1/pensionados/${selected.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });

        setPensionados((current) =>
          current.map((pensionado) => (pensionado.id === updated.id ? updated : pensionado)),
        );
      }

      closeModal();
    } catch (saveError) {
      setFormError(
        saveError instanceof ApiError ? saveError.message : "No se pudo guardar el pensionado",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(pensionado: Pensionado) {
    const confirmed = window.confirm(
      `Vas a borrar a ${pensionado.nombre_completo}. Esta accion lo marcara como inactivo.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(pensionado.id);
    setError(null);

    try {
      await apiFetch<Pensionado>(`/api/v1/pensionados/${pensionado.id}`, {
        method: "DELETE",
      });

      setPensionados((current) =>
        current.map((item) => (item.id === pensionado.id ? { ...item, is_active: false } : item)),
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof ApiError
          ? deleteError.message
          : "No se pudo borrar el pensionado",
      );
    } finally {
      setDeletingId(null);
    }
  }

  function openDetail(pensionadoId: number) {
    router.push(`/pensionados/${pensionadoId}`);
  }

  function handleRowKeyDown(event: React.KeyboardEvent<HTMLDivElement>, pensionadoId: number) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail(pensionadoId);
    }
  }

  return (
    <section className="space-y-4">
      <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-stone-500">
              Pensionados
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-stone-950">
              Contactos y base comercial
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              Gestiona pensionados, consulta su ficha y manten actualizada la informacion de
              contacto.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:items-center">
            <input
              className="input-base min-w-0 sm:w-80"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre, documento o telefono"
            />
            <button type="button" className="button-primary whitespace-nowrap" onClick={openCreateModal}>
              Crear pensionado
            </button>
          </div>
        </div>
      </article>

      {loading ? <StateMessage text="Cargando pensionados..." /> : null}
      {error ? <StateMessage tone="error" text={error} /> : null}

      {!loading && !error ? (
        <div className="overflow-hidden rounded-2xl border border-stone-800/10 bg-white/85 shadow-lg shadow-stone-900/5">
          <div className="hidden grid-cols-[1.2fr_0.75fr_0.95fr_0.95fr_0.7fr_120px] gap-3 border-b border-stone-800/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 md:grid">
            <span>Nombre</span>
            <span>Documento</span>
            <span>Contacto</span>
            <span>Pension desde</span>
            <span>Estado</span>
            <span className="text-right">Acciones</span>
          </div>

          <div className="divide-y divide-stone-800/10">
            {filtered.map((pensionado) => (
              <div
                key={pensionado.id}
                role="link"
                tabIndex={0}
                onClick={() => openDetail(pensionado.id)}
                onKeyDown={(event) => handleRowKeyDown(event, pensionado.id)}
                className="grid cursor-pointer gap-3 px-4 py-4 text-sm transition hover:bg-teal-50/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-700/35 md:grid-cols-[1.2fr_0.75fr_0.95fr_0.95fr_0.7fr_120px] md:items-center md:py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-stone-950">
                    {pensionado.nombre_completo}
                  </p>
                  <p className="mt-1 text-xs text-stone-500 md:hidden">
                    Documento {pensionado.documento}
                  </p>
                </div>
                <span className="hidden text-stone-700 md:block">{pensionado.documento}</span>
                <span className="text-stone-700">
                  {pensionado.celular ?? pensionado.telefono ?? "Sin contacto"}
                </span>
                <span className="text-stone-700">
                  {formatDate(pensionado.fecha_inicio_pension)}
                </span>
                <span>
                  <StatusBadge active={pensionado.is_active} />
                </span>
                <div className="flex items-center gap-2 md:justify-end">
                  <ActionLink href={`/pensionados/${pensionado.id}`} label="Ver">
                    <EyeIcon />
                  </ActionLink>
                  <ActionButton label="Editar" onClick={() => openEditModal(pensionado)}>
                    <EditIcon />
                  </ActionButton>
                  <ActionButton
                    label="Borrar"
                    tone="danger"
                    disabled={deletingId === pensionado.id || !pensionado.is_active}
                    onClick={() => void handleDelete(pensionado)}
                  >
                    <TrashIcon />
                  </ActionButton>
                </div>
              </div>
            ))}

            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-stone-500">
                No hay pensionados para la busqueda actual.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {modalMode ? (
        <PensionadoModal
          mode={modalMode}
          form={form}
          error={formError}
          saving={saving}
          onChange={setForm}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      ) : null}
    </section>
  );
}

function PensionadoModal({
  mode,
  form,
  error,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  mode: FormMode;
  form: FormValues;
  error: string | null;
  saving: boolean;
  onChange: (form: FormValues) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isEdit = mode === "edit";

  function updateField(field: keyof FormValues, value: string) {
    onChange({ ...form, [field]: value });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 px-4 py-6 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="max-h-[calc(100vh-48px)] w-full max-w-3xl overflow-auto rounded-2xl border border-stone-800/10 bg-white p-5 shadow-2xl shadow-stone-950/20"
      >
        <div className="flex flex-col gap-3 border-b border-stone-800/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">
              {isEdit ? "Editar pensionado" : "Nuevo pensionado"}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-950">
              {isEdit ? fullNameFromForm(form) : "Crear pensionado"}
            </h2>
          </div>
          <button type="button" className="button-muted px-3 py-2 text-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {error ? <div className="mt-4"><StateMessage tone="error" text={error} /></div> : null}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field
            label="Nombre"
            value={form.nombre}
            onChange={(value) => updateField("nombre", value)}
            required
          />
          <Field
            label="Segundo nombre"
            value={form.segundo_nombre}
            onChange={(value) => updateField("segundo_nombre", value)}
          />
          <Field
            label="Apellidos"
            value={form.apellidos}
            onChange={(value) => updateField("apellidos", value)}
            required
          />
          <SelectField
            label="Genero"
            value={form.genero}
            onChange={(value) => updateField("genero", value)}
            options={["Masculino", "Femenino", "Otro", "No especificado"]}
          />
          <Field
            label="Documento"
            value={form.documento}
            onChange={(value) => updateField("documento", value)}
            required
            disabled={isEdit}
            inputMode="numeric"
          />
          <Field
            label="Fecha de nacimiento"
            type="date"
            value={form.fecha_nacimiento}
            onChange={(value) => updateField("fecha_nacimiento", value)}
            required
            disabled={isEdit}
          />
          <Field
            label="Inicio de pension"
            type="date"
            value={form.fecha_inicio_pension}
            onChange={(value) => updateField("fecha_inicio_pension", value)}
            required
            disabled={isEdit}
          />
          <Field
            label="Telefono"
            value={form.telefono}
            onChange={(value) => updateField("telefono", value)}
            required={!isEdit}
            inputMode="tel"
          />
          <Field
            label="Celular"
            value={form.celular}
            onChange={(value) => updateField("celular", value)}
            inputMode="tel"
          />
          <div className="sm:col-span-2">
            <Field
              label="Direccion"
              value={form.direccion}
              onChange={(value) => updateField("direccion", value)}
              required
            />
          </div>
        </div>

        {isEdit ? (
          <p className="mt-4 text-xs text-stone-500">
            Documento y fechas no se editan desde este formulario porque el backend no los acepta
            en PATCH.
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="button-muted" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="button-primary" disabled={saving}>
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear pensionado"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  disabled = false,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  inputMode?: "numeric" | "tel";
}) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      <span>{label}</span>
      <input
        className="input-base mt-2 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={disabled}
        inputMode={inputMode}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      <span>{label}</span>
      <select
        className="input-base mt-2"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ActionLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      onClick={(event) => event.stopPropagation()}
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-stone-800/10 bg-white text-stone-700 transition hover:border-teal-700/30 hover:bg-teal-50 hover:text-teal-800"
    >
      {children}
    </Link>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        active
          ? "border-teal-700/20 bg-teal-50 text-teal-800"
          : "border-stone-800/10 bg-stone-100 text-stone-600",
      ].join(" ")}
    >
      {active ? "Activo" : "Inactivo"}
    </span>
  );
}

function ActionButton({
  label,
  children,
  onClick,
  disabled = false,
  tone = "default",
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className={[
        "inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-white transition disabled:cursor-not-allowed disabled:opacity-50",
        tone === "danger"
          ? "border-red-500/15 text-red-700 hover:bg-red-50"
          : "border-stone-800/10 text-stone-700 hover:border-teal-700/30 hover:bg-teal-50 hover:text-teal-800",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 20h9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="m16.5 3.5 4 4L8 20H4v-4L16.5 3.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 6h18M9 6V4h6v2m-8 0 1 14h8l1-14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function fullNameFromForm(form: FormValues) {
  return [form.nombre, form.segundo_nombre, form.apellidos]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");
}

function StateMessage({
  text,
  tone = "default",
}: {
  text: string;
  tone?: "default" | "error";
}) {
  return (
    <div
      className={[
        "rounded-2xl border px-5 py-4 text-sm",
        tone === "error"
          ? "border-red-500/20 bg-red-50 text-red-700"
          : "border-stone-800/10 bg-white/65 text-stone-500",
      ].join(" ")}
    >
      {text}
    </div>
  );
}
