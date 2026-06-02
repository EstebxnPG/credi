"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError, apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { readSession } from "@/lib/session";

type Seguimiento = {
  id: number;
  pensionado_id: number;
  pensionado_nombre: string | null;
  pensionado_documento: string | null;
  oficina_id: number;
  oficina_nombre: string | null;
  usuario_id: number;
  usuario_nombre: string | null;
  tipo: string;
  comentario: string;
  resultado: string | null;
  fecha_proximo_contacto: string | null;
  created_at: string;
  is_active: boolean;
};

type Pensionado = {
  id: number;
  nombre_completo: string;
  documento: string;
};

type Oficina = {
  id: number;
  nombre: string;
  is_active: boolean;
};

type FormValues = {
  pensionado_id: string;
  oficina_id: string;
  tipo: string;
  comentario: string;
  resultado: string;
  fecha_proximo_contacto: string;
};

const seguimientoTipos = [
  { value: "cotizacion", label: "Cotizacion" },
  { value: "llamada", label: "Llamada" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "visita", label: "Visita" },
  { value: "documentos", label: "Documentos" },
  { value: "objecion", label: "Objecion" },
  { value: "seguimiento", label: "Seguimiento" },
  { value: "cierre_perdido", label: "Cierre perdido" },
];

const emptyForm: FormValues = {
  pensionado_id: "",
  oficina_id: "",
  tipo: "llamada",
  comentario: "",
  resultado: "",
  fecha_proximo_contacto: "",
};

export default function SeguimientosPage() {
  const router = useRouter();
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [pensionados, setPensionados] = useState<Pensionado[]>([]);
  const [oficinas, setOficinas] = useState<Oficina[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<FormValues>(emptyForm);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [seguimientosData, pensionadosData, oficinasData] = await Promise.all([
        apiFetch<Seguimiento[]>("/api/v1/seguimientos/"),
        apiFetch<Pensionado[]>("/api/v1/pensionados/?limit=500"),
        apiFetch<Oficina[]>("/api/v1/oficinas/"),
      ]);

      setSeguimientos(seguimientosData);
      setPensionados(pensionadosData);
      setOficinas(oficinasData);
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : "No se pudo cargar la lista de seguimientos",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return seguimientos;
    }

    return seguimientos.filter((seguimiento) =>
      [
        seguimiento.id,
        seguimiento.tipo,
        seguimiento.comentario,
        seguimiento.resultado,
        seguimiento.pensionado_nombre,
        seguimiento.pensionado_documento,
        seguimiento.oficina_nombre,
        seguimiento.usuario_nombre,
      ]
        .filter((value) => value !== null && value !== undefined)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [query, seguimientos]);

  function openCreateModal() {
    const session = readSession();
    const defaultOficinaId = session?.oficinaId ?? oficinas[0]?.id ?? "";

    setForm({
      ...emptyForm,
      oficina_id: defaultOficinaId ? String(defaultOficinaId) : "",
    });
    setFormError(null);
    setIsModalOpen(true);
  }

  function closeModal() {
    if (saving) {
      return;
    }

    setIsModalOpen(false);
    setForm(emptyForm);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.pensionado_id || !form.oficina_id) {
      setFormError("Selecciona pensionado y oficina.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const created = await apiFetch<Seguimiento>("/api/v1/seguimientos/", {
        method: "POST",
        body: JSON.stringify({
          pensionado_id: Number(form.pensionado_id),
          oficina_id: Number(form.oficina_id),
          tipo: form.tipo,
          comentario: form.comentario.trim(),
          resultado: nullableText(form.resultado),
          fecha_proximo_contacto: form.fecha_proximo_contacto
            ? new Date(form.fecha_proximo_contacto).toISOString()
            : null,
        }),
      });

      setSeguimientos((current) => [created, ...current]);
      closeModal();
    } catch (saveError) {
      setFormError(
        saveError instanceof ApiError ? saveError.message : "No se pudo crear el seguimiento",
      );
    } finally {
      setSaving(false);
    }
  }

  function openDetail(seguimientoId: number) {
    router.push(`/seguimientos/${seguimientoId}`);
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>, seguimientoId: number) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail(seguimientoId);
    }
  }

  return (
    <section className="space-y-4">
      <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-stone-500">
              Seguimientos
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-stone-950">
              Contactos y proximas gestiones
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              Consulta la historia comercial, registra contactos y agenda nuevas gestiones.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:items-center">
            <input
              className="input-base min-w-0 sm:w-96"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por pensionado, documento, tipo o comentario"
            />
            <button type="button" className="button-primary whitespace-nowrap" onClick={openCreateModal}>
              Crear seguimiento
            </button>
          </div>
        </div>
      </article>

      {loading ? <StateMessage text="Cargando seguimientos..." /> : null}
      {error ? <StateMessage tone="error" text={error} /> : null}

      {!loading && !error ? (
        <div className="overflow-hidden rounded-2xl border border-stone-800/10 bg-white/85 shadow-lg shadow-stone-900/5">
          <div className="hidden grid-cols-[0.65fr_1.2fr_0.8fr_1fr_1fr_120px] gap-3 border-b border-stone-800/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 md:grid">
            <span>ID</span>
            <span>Pensionado</span>
            <span>Tipo</span>
            <span>Oficina</span>
            <span>Proximo contacto</span>
            <span className="text-right">Acciones</span>
          </div>

          <div className="divide-y divide-stone-800/10">
            {filtered.map((seguimiento) => (
              <div
                key={seguimiento.id}
                role="link"
                tabIndex={0}
                onClick={() => openDetail(seguimiento.id)}
                onKeyDown={(event) => handleRowKeyDown(event, seguimiento.id)}
                className="grid cursor-pointer gap-3 px-4 py-4 text-sm transition hover:bg-teal-50/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-700/35 md:grid-cols-[0.65fr_1.2fr_0.8fr_1fr_1fr_120px] md:items-center md:py-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-stone-950">#{seguimiento.id}</p>
                  <p className="mt-1 text-xs text-stone-500 md:hidden">
                    {formatDateTime(seguimiento.created_at)}
                  </p>
                </div>
                <div className="min-w-0 text-stone-700">
                  <p className="truncate font-medium text-stone-900">
                    {seguimiento.pensionado_nombre ?? `Pensionado #${seguimiento.pensionado_id}`}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    {seguimiento.pensionado_documento ?? "Documento sin cargar"}
                  </p>
                </div>
                <span>
                  <TipoBadge tipo={seguimiento.tipo} />
                </span>
                <span className="text-stone-700">
                  {seguimiento.oficina_nombre ?? `Oficina #${seguimiento.oficina_id}`}
                </span>
                <span className="text-stone-700">
                  {seguimiento.fecha_proximo_contacto
                    ? formatDateTime(seguimiento.fecha_proximo_contacto)
                    : "Sin programar"}
                </span>
                <div className="flex items-center gap-2 md:justify-end">
                  <ActionLink href={`/seguimientos/${seguimiento.id}`} label="Ver">
                    <EyeIcon />
                  </ActionLink>
                  <ActionLink
                    href={`/pensionados/${seguimiento.pensionado_id}?vista=seguimientos`}
                    label="Pensionado"
                  >
                    <UserIcon />
                  </ActionLink>
                </div>
              </div>
            ))}

            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-stone-500">
                No hay seguimientos para la busqueda actual.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isModalOpen ? (
        <SeguimientoModal
          form={form}
          error={formError}
          saving={saving}
          pensionados={pensionados}
          oficinas={oficinas}
          onChange={setForm}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      ) : null}
    </section>
  );
}

function SeguimientoModal({
  form,
  error,
  saving,
  pensionados,
  oficinas,
  onChange,
  onClose,
  onSubmit,
}: {
  form: FormValues;
  error: string | null;
  saving: boolean;
  pensionados: Pensionado[];
  oficinas: Oficina[];
  onChange: (form: FormValues) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
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
              Nuevo seguimiento
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-950">
              Registrar contacto
            </h2>
          </div>
          <button type="button" className="button-muted px-3 py-2 text-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {error ? <div className="mt-4"><StateMessage tone="error" text={error} /></div> : null}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <SearchSelectField
              label="Pensionado"
              value={form.pensionado_id}
              options={pensionados.map((pensionado) => ({
                value: String(pensionado.id),
                label: pensionado.nombre_completo,
                description: `Documento ${pensionado.documento}`,
              }))}
              onChange={(value) => updateField("pensionado_id", value)}
              placeholder="Buscar pensionado por nombre o documento"
              required
            />
          </div>
          <SelectField
            label="Tipo"
            value={form.tipo}
            onChange={(value) => updateField("tipo", value)}
            options={seguimientoTipos.map((tipo) => ({
              value: tipo.value,
              label: tipo.label,
            }))}
            required
          />
          <SelectField
            label="Oficina"
            value={form.oficina_id}
            onChange={(value) => updateField("oficina_id", value)}
            options={oficinas.map((oficina) => ({
              value: String(oficina.id),
              label: oficina.nombre,
            }))}
            required
          />
          <div className="sm:col-span-2">
            <TextareaField
              label="Comentario"
              value={form.comentario}
              onChange={(value) => updateField("comentario", value)}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <TextareaField
              label="Resultado"
              value={form.resultado}
              onChange={(value) => updateField("resultado", value)}
            />
          </div>
          <Field
            label="Proximo contacto"
            type="datetime-local"
            value={form.fecha_proximo_contacto}
            onChange={(value) => updateField("fecha_proximo_contacto", value)}
          />
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="button-muted" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="button-primary" disabled={saving}>
            {saving ? "Guardando..." : "Crear seguimiento"}
          </button>
        </div>
      </form>
    </div>
  );
}

type SearchOption = {
  value: string;
  label: string;
  description: string;
};

function SearchSelectField({
  label,
  value,
  options,
  onChange,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  options: SearchOption[];
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
}) {
  const selected = options.find((option) => option.value === value);
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (selected) {
      setSearch(`${selected.label} - ${selected.description}`);
    }
  }, [selected]);

  const filteredOptions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return options.slice(0, 20);
    }

    return options
      .filter((option) =>
        [option.label, option.description].some((item) => item.toLowerCase().includes(term)),
      )
      .slice(0, 20);
  }, [options, search]);

  return (
    <div className="block text-sm font-medium text-stone-700">
      <label>
        <span>{label}</span>
      </label>
      <input
        className="input-base mt-2"
        value={search}
        onFocus={() => setIsOpen(true)}
        onChange={(event) => {
          setSearch(event.target.value);
          setIsOpen(true);
          if (value) {
            onChange("");
          }
        }}
        placeholder={placeholder}
        required={required}
      />
      {isOpen ? (
        <div className="mt-2 max-h-48 overflow-auto rounded-xl border border-stone-800/10 bg-white shadow-lg shadow-stone-900/5">
          {filteredOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={[
                "block w-full px-4 py-3 text-left text-sm transition hover:bg-teal-50",
                option.value === value ? "bg-teal-50 text-teal-900" : "text-stone-700",
              ].join(" ")}
              onClick={() => {
                onChange(option.value);
                setSearch(`${option.label} - ${option.description}`);
                setIsOpen(false);
              }}
            >
              <span className="block font-semibold text-stone-950">{option.label}</span>
              <span className="mt-1 block text-xs text-stone-500">{option.description}</span>
            </button>
          ))}
          {filteredOptions.length === 0 ? (
            <p className="px-4 py-3 text-sm text-stone-500">No hay resultados.</p>
          ) : null}
        </div>
      ) : null}
      {required && !value ? (
        <p className="mt-1 text-xs text-stone-500">Selecciona una opcion de la lista.</p>
      ) : null}
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      <span>{label}</span>
      <select
        className="input-base mt-2"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      >
        <option value="">Seleccionar</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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
        className="input-base mt-2"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      <span>{label}</span>
      <textarea
        className="input-base mt-2 min-h-24"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      />
    </label>
  );
}

function TipoBadge({ tipo }: { tipo: string }) {
  return (
    <span className="inline-flex items-center justify-center rounded-full border border-teal-700/20 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
      {seguimientoTipos.find((item) => item.value === tipo)?.label ?? tipo}
    </span>
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
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path d="M20 21a8 8 0 0 0-16 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
