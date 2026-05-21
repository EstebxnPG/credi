"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { readSession } from "@/lib/session";

type Pensionado = {
  id: number;
  nombre: string;
  segundo_nombre: string | null;
  apellidos: string;
  genero: string;
  nombre_completo: string;
  documento: string;
  fecha_nacimiento: string;
  correo?: string | null;
  telefono: string | null;
  celular: string | null;
  direccion: string;
  fecha_inicio_pension: string;
  is_active: boolean;
};

type Credito = {
  id: number;
  pensionado_id: number;
  monto_solicitado: number;
  monto_aprobado: number | null;
  plazo: number;
  estado: string;
  cooperativa_id: number;
  pagaduria_id: number;
  tiene_documentos_pendientes: boolean;
  documentos_pendientes: string | null;
  fecha_registro: string;
  created_at: string;
};

type Seguimiento = {
  id: number;
  pensionado_id: number;
  pensionado_nombre: string | null;
  oficina_nombre: string | null;
  usuario_nombre: string | null;
  tipo: string;
  comentario: string;
  resultado: string | null;
  fecha_proximo_contacto: string | null;
  created_at: string;
};

type LogItem = {
  id: number;
  usuario_id: number;
  tabla_afectada: string;
  registro_afectado: number;
  tipo_accion: string;
  valores_antes: Record<string, unknown> | null;
  valores_despues: Record<string, unknown> | null;
  created_at: string;
};

const views = [
  { key: "creditos", label: "Creditos" },
  { key: "seguimientos", label: "Seguimientos" },
  { key: "actualizaciones", label: "Actualizaciones" },
] as const;

type ViewKey = (typeof views)[number]["key"];

type FormValues = {
  nombre: string;
  segundo_nombre: string;
  apellidos: string;
  genero: string;
  correo: string;
  telefono: string;
  celular: string;
  direccion: string;
};

export default function PensionadoDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const pensionadoId = Number(params.id);
  const selectedView = normalizeView(searchParams.get("vista"));
  const session = readSession();

  const [pensionado, setPensionado] = useState<Pensionado | null>(null);
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(pensionadoId)) {
      setError("Pensionado invalido");
      setLoading(false);
      return;
    }

    let ignore = false;

    async function loadDetail() {
      setLoading(true);
      setError(null);
      setLogsError(null);

      try {
        const [pensionadoData, creditosData, seguimientosData] = await Promise.all([
          apiFetch<Pensionado>(`/api/v1/pensionados/${pensionadoId}`),
          apiFetch<Credito[]>(`/api/v1/creditos/?pensionado_id=${pensionadoId}`),
          apiFetch<Seguimiento[]>(`/api/v1/seguimientos/?pensionado_id=${pensionadoId}`),
        ]);

        if (!ignore) {
          setPensionado(pensionadoData);
          setCreditos(creditosData);
          setSeguimientos(seguimientosData);
        }

        if (session?.rol === "administrador") {
          try {
            const logsData = await apiFetch<LogItem[]>(
              "/api/v1/logs/?tabla_afectada=pensionados",
            );
            if (!ignore) {
              setLogs(logsData.filter((item) => item.registro_afectado === pensionadoId));
            }
          } catch (loadLogsError) {
            if (!ignore) {
              setLogsError(
                loadLogsError instanceof ApiError
                  ? loadLogsError.message
                  : "No se pudieron cargar las actualizaciones",
              );
            }
          }
        }
      } catch (loadError) {
        if (!ignore) {
          setError(
            loadError instanceof ApiError
              ? loadError.message
              : "No se pudo cargar la ficha del pensionado",
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      ignore = true;
    };
  }, [pensionadoId, session?.rol]);

  const resumen = useMemo(() => {
    const activos = creditos.filter((credito) =>
      ["Prospecto", "Enviado a cooperativa", "Devuelto por correccion", "Reenviado"].includes(
        credito.estado,
      ),
    );
    return {
      creditos: creditos.length,
      activos: activos.length,
      seguimientos: seguimientos.length,
      montoSolicitado: creditos.reduce(
        (total, credito) => total + Number(credito.monto_solicitado),
        0,
      ),
    };
  }, [creditos, seguimientos]);

  function openEditModal() {
    if (!pensionado) {
      return;
    }

    setForm({
      nombre: pensionado.nombre,
      segundo_nombre: pensionado.segundo_nombre ?? "",
      apellidos: pensionado.apellidos,
      genero: pensionado.genero,
      correo: pensionado.correo ?? "",
      telefono: pensionado.telefono ?? "",
      celular: pensionado.celular ?? "",
      direccion: pensionado.direccion,
    });
    setFormError(null);
  }

  function closeEditModal() {
    if (saving) {
      return;
    }

    setForm(null);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form || !pensionado) {
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const updated = await apiFetch<Pensionado>(`/api/v1/pensionados/${pensionado.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          segundo_nombre: nullableText(form.segundo_nombre),
          apellidos: form.apellidos.trim(),
          genero: form.genero,
          correo: nullableText(form.correo),
          telefono: nullableText(form.telefono),
          celular: nullableText(form.celular),
          direccion: form.direccion.trim(),
        }),
      });

      setPensionado(updated);
      setForm(null);
    } catch (saveError) {
      setFormError(
        saveError instanceof ApiError ? saveError.message : "No se pudo guardar el pensionado",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!pensionado) {
      return;
    }

    const confirmed = window.confirm(
      `Vas a borrar a ${pensionado.nombre_completo}. Esta accion lo marcara como inactivo.`,
    );

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const deleted = await apiFetch<Pensionado>(`/api/v1/pensionados/${pensionado.id}`, {
        method: "DELETE",
      });
      setPensionado(deleted);
    } catch (deleteError) {
      setError(
        deleteError instanceof ApiError
          ? deleteError.message
          : "No se pudo borrar el pensionado",
      );
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <StateMessage text="Cargando ficha del pensionado..." />;
  }

  if (error || !pensionado) {
    return <StateMessage tone="error" text={error ?? "Pensionado no encontrado"} />;
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-4">
        <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Link href="/pensionados" className="text-xs font-semibold text-teal-700">
                Volver a pensionados
              </Link>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-stone-950">
                {pensionado.nombre_completo}
              </h1>
              <p className="mt-2 text-sm text-stone-600">
                Documento {pensionado.documento} - {pensionado.direccion}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
              <button type="button" className="button-muted px-4 py-2 text-sm" onClick={openEditModal}>
                Editar
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-2xl border border-red-500/15 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={deleting || !pensionado.is_active}
                onClick={() => void handleDelete()}
              >
                {deleting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Creditos" value={String(resumen.creditos)} />
            <Metric label="Activos" value={String(resumen.activos)} />
            <Metric label="Seguimientos" value={String(resumen.seguimientos)} />
            <Metric label="Solicitado" value={formatCurrency(resumen.montoSolicitado)} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Detail label="Nombre" value={pensionado.nombre} />
            <Detail label="Segundo nombre" value={pensionado.segundo_nombre ?? "Sin registrar"} />
            <Detail label="Apellidos" value={pensionado.apellidos} />
            <Detail label="Genero" value={pensionado.genero} />
            <Detail label="Correo" value={pensionado.correo ?? "Sin correo registrado"} />
            <Detail
              label="Telefono"
              value={pensionado.telefono ?? "Sin telefono fijo"}
            />
            <Detail label="Celular" value={pensionado.celular ?? "Sin celular"} />
            <Detail label="Direccion" value={pensionado.direccion} />
            <Detail label="Nacimiento" value={formatDate(pensionado.fecha_nacimiento)} />
            <Detail
              label="Inicio pension"
              value={formatDate(pensionado.fecha_inicio_pension)}
            />
          </div>
        </article>

        {selectedView === "creditos" ? <CreditosList creditos={creditos} /> : null}
        {selectedView === "seguimientos" ? (
          <SeguimientosList seguimientos={seguimientos} />
        ) : null}
        {selectedView === "actualizaciones" ? (
          <ActualizacionesList
            logs={logs}
            logsError={logsError}
            isAdmin={session?.rol === "administrador"}
          />
        ) : null}
      </div>

      <aside className="rounded-2xl border border-stone-800/10 bg-white/85 p-4 shadow-lg shadow-stone-900/5 xl:sticky xl:top-28 xl:self-start">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">
          Ficha
        </p>
        <nav className="mt-4 space-y-2">
          {views.map((view) => (
            <Link
              key={view.key}
              href={`/pensionados/${pensionado.id}?vista=${view.key}`}
              className={[
                "block rounded-xl border px-4 py-3 text-sm font-medium transition",
                selectedView === view.key
                  ? "border-teal-700/20 bg-teal-950 text-white"
                  : "border-stone-800/10 bg-white/65 text-stone-700 hover:bg-white",
              ].join(" ")}
            >
              {view.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 rounded-xl border border-stone-800/10 bg-white/65 px-4 py-3 text-sm text-stone-700">
          Estado: <StatusBadge active={pensionado.is_active} />
        </div>
      </aside>

      {form ? (
        <PensionadoEditModal
          form={form}
          error={formError}
          saving={saving}
          onChange={setForm}
          onClose={closeEditModal}
          onSubmit={handleSubmit}
        />
      ) : null}
    </section>
  );
}

function normalizeView(value: string | null): ViewKey {
  return views.some((view) => view.key === value) ? (value as ViewKey) : "creditos";
}

function CreditosList({ creditos }: { creditos: Credito[] }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-stone-800/10 bg-white/85 shadow-lg shadow-stone-900/5">
      <div className="border-b border-stone-800/10 px-5 py-4">
        <h2 className="text-lg font-semibold text-stone-950">Creditos del pensionado</h2>
      </div>

      <div className="hidden grid-cols-[0.8fr_1fr_1fr_0.8fr_1fr_88px] gap-3 border-b border-stone-800/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 md:grid">
        <span>Credito</span>
        <span>Estado</span>
        <span>Solicitado</span>
        <span>Plazo</span>
        <span>Registro</span>
        <span className="text-right">Acciones</span>
      </div>

      <div className="divide-y divide-stone-800/10">
        {creditos.map((credito) => {
          const href = `/creditos/${credito.id}`;

          return (
            <Link
              key={credito.id}
              href={href}
              className="group grid gap-3 px-4 py-4 text-sm transition hover:bg-teal-50/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-700/35 md:grid-cols-[0.8fr_1fr_1fr_0.8fr_1fr_88px] md:items-center md:py-3"
            >
              <div className="min-w-0">
                <p className="font-semibold text-stone-950">#{credito.id}</p>
                <p className="mt-1 text-xs text-stone-500 md:hidden">
                  {formatDate(credito.fecha_registro)}
                </p>
              </div>
              <span>
                <CreditoStatusBadge estado={credito.estado} />
              </span>
              <span className="font-medium text-stone-800">
                {formatCurrency(credito.monto_solicitado)}
              </span>
              <span className="text-stone-700">{credito.plazo} meses</span>
              <span className="text-stone-700">
                {formatDate(credito.fecha_registro)}
                {credito.tiene_documentos_pendientes ? (
                  <span className="mt-1 block text-xs font-medium text-amber-700">
                    Documentos pendientes
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-2 md:justify-end">
                <span
                  aria-label={`Ver credito ${credito.id}`}
                  title="Ver credito"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-stone-800/10 bg-white text-stone-700 transition group-hover:border-teal-700/30 group-hover:bg-teal-50 group-hover:text-teal-800"
                >
                  <EyeIcon />
                </span>
              </span>
            </Link>
          );
        })}

        {creditos.length === 0 ? (
          <p className="px-5 py-6 text-sm text-stone-500">Este pensionado no tiene creditos.</p>
        ) : null}
      </div>
    </article>
  );
}

function SeguimientosList({ seguimientos }: { seguimientos: Seguimiento[] }) {
  return (
    <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
      <h2 className="text-lg font-semibold text-stone-950">Seguimientos</h2>
      <div className="mt-4 divide-y divide-stone-800/10">
        {seguimientos.map((seguimiento) => (
          <Link
            key={seguimiento.id}
            href={`/seguimientos/${seguimiento.id}`}
            className="block py-4 transition hover:bg-teal-50/60"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-stone-950">{seguimiento.tipo}</p>
              <p className="text-xs text-stone-500">
                {formatDateTime(seguimiento.created_at)}
              </p>
            </div>
            <p className="mt-2 text-sm text-stone-700">{seguimiento.comentario}</p>
            {seguimiento.fecha_proximo_contacto ? (
              <p className="mt-2 text-xs font-medium text-amber-700">
                Proximo contacto: {formatDateTime(seguimiento.fecha_proximo_contacto)}
              </p>
            ) : null}
          </Link>
        ))}

        {seguimientos.length === 0 ? (
          <p className="py-6 text-sm text-stone-500">Este pensionado no tiene seguimientos.</p>
        ) : null}
      </div>
    </article>
  );
}

function ActualizacionesList({
  logs,
  logsError,
  isAdmin,
}: {
  logs: LogItem[];
  logsError: string | null;
  isAdmin: boolean;
}) {
  if (!isAdmin) {
    return (
      <StateMessage text="Las actualizaciones de auditoria solo estan disponibles para administradores. Para trabajadores, la historia comercial vive en Seguimientos." />
    );
  }

  if (logsError) {
    return <StateMessage tone="error" text={logsError} />;
  }

  return (
    <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
      <h2 className="text-lg font-semibold text-stone-950">Actualizaciones</h2>
      <div className="mt-4 divide-y divide-stone-800/10">
        {logs.map((log) => (
          <div key={log.id} className="py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-stone-950">{log.tipo_accion}</p>
              <p className="text-xs text-stone-500">{formatDateTime(log.created_at)}</p>
            </div>
            <pre className="mt-3 overflow-auto rounded-xl bg-stone-950 p-3 text-xs text-stone-100">
              {JSON.stringify(log.valores_despues ?? log.valores_antes ?? {}, null, 2)}
            </pre>
          </div>
        ))}

        {logs.length === 0 ? (
          <p className="py-6 text-sm text-stone-500">No hay actualizaciones registradas.</p>
        ) : null}
      </div>
    </article>
  );
}

function PensionadoEditModal({
  form,
  error,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  form: FormValues;
  error: string | null;
  saving: boolean;
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
              Editar pensionado
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-950">
              {[form.nombre, form.segundo_nombre, form.apellidos]
                .map((value) => value.trim())
                .filter(Boolean)
                .join(" ")}
            </h2>
          </div>
          <button type="button" className="button-muted px-3 py-2 text-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {error ? <div className="mt-4"><StateMessage tone="error" text={error} /></div> : null}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" value={form.nombre} onChange={(value) => updateField("nombre", value)} required />
          <Field label="Segundo nombre" value={form.segundo_nombre} onChange={(value) => updateField("segundo_nombre", value)} />
          <Field label="Apellidos" value={form.apellidos} onChange={(value) => updateField("apellidos", value)} required />
          <SelectField
            label="Genero"
            value={form.genero}
            onChange={(value) => updateField("genero", value)}
            options={["Masculino", "Femenino", "Otro", "No especificado"]}
          />
          <Field label="Correo" type="email" value={form.correo} onChange={(value) => updateField("correo", value)} />
          <Field label="Telefono" value={form.telefono} onChange={(value) => updateField("telefono", value)} inputMode="tel" />
          <Field label="Celular" value={form.celular} onChange={(value) => updateField("celular", value)} inputMode="tel" />
          <div className="sm:col-span-2">
            <Field label="Direccion" value={form.direccion} onChange={(value) => updateField("direccion", value)} required />
          </div>
        </div>

        <p className="mt-4 text-xs text-stone-500">
          Documento y fechas no se editan aqui porque el backend de pensionados no los acepta en PATCH.
        </p>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="button-muted" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="button-primary" disabled={saving}>
            {saving ? "Guardando..." : "Guardar cambios"}
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
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  inputMode?: "tel";
}) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      <span>{label}</span>
      <input
        className="input-base mt-2"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-800/10 bg-white/65 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-stone-950">{value}</p>
    </div>
  );
}

function CreditoStatusBadge({ estado }: { estado: string }) {
  const tone = getCreditoStatusTone(estado);

  return (
    <span
      className={[
        "inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        tone === "success" ? "border-teal-700/20 bg-teal-50 text-teal-800" : "",
        tone === "warning" ? "border-amber-700/20 bg-amber-50 text-amber-800" : "",
        tone === "danger" ? "border-red-500/20 bg-red-50 text-red-700" : "",
        tone === "neutral" ? "border-stone-800/10 bg-stone-100 text-stone-700" : "",
      ].join(" ")}
    >
      {estado}
    </span>
  );
}

function getCreditoStatusTone(estado: string) {
  const normalized = estado.toLowerCase();

  if (normalized.includes("aprob") || normalized.includes("desembols")) {
    return "success";
  }

  if (
    normalized.includes("devuelto") ||
    normalized.includes("correccion") ||
    normalized.includes("pendiente")
  ) {
    return "warning";
  }

  if (normalized.includes("rechaz") || normalized.includes("cancel")) {
    return "danger";
  }

  return "neutral";
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-800/10 bg-white/65 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-stone-900">{value}</p>
    </div>
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
