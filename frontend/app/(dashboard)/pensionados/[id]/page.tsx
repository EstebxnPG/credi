"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { readSession } from "@/lib/session";

type Pensionado = {
  id: number;
  nombre: string;
  segundo_nombre: string | null;
  apellidos: string | null;
  genero: string | null;
  nombre_completo: string;
  documento: string;
  fecha_nacimiento: string | null;
  correo?: string | null;
  telefono: string | null;
  celular: string | null;
  direccion: string | null;
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

type PendienteCredito = {
  id: number;
  credito_id: number;
  descripcion: string;
  estado: string;
  origen: string;
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

type Oficina = {
  id: number;
  nombre: string;
  is_active: boolean;
};

type LogItem = {
  id: number;
  usuario_id: number;
  usuario_nombre: string | null;
  tabla_afectada: string;
  registro_afectado: number;
  tipo_accion: string;
  valores_antes: Record<string, unknown> | null;
  valores_despues: Record<string, unknown> | null;
  created_at: string;
};

type LogPage = {
  items: LogItem[];
  total: number;
  page: number;
  page_size: number;
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
  fecha_nacimiento: string;
  correo: string;
  telefono: string;
  celular: string;
  direccion: string;
};

type SeguimientoFormValues = {
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

const emptySeguimientoForm: SeguimientoFormValues = {
  oficina_id: "",
  tipo: "llamada",
  comentario: "",
  resultado: "",
  fecha_proximo_contacto: "",
};

const auditFieldLabels: Record<string, string> = {
  nombre: "Nombre",
  segundo_nombre: "Segundo nombre",
  apellidos: "Apellidos",
  genero: "Genero",
  fecha_nacimiento: "Fecha de nacimiento",
  correo: "Correo",
  telefono: "Telefono",
  celular: "Celular",
  direccion: "Direccion",
  is_active: "Estado",
  oficina_id: "Oficina",
};

export default function PensionadoDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const pensionadoId = Number(params.id);
  const selectedView = normalizeView(searchParams.get("vista"));
  const session = readSession();

  const [pensionado, setPensionado] = useState<Pensionado | null>(null);
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [pendientes, setPendientes] = useState<PendienteCredito[]>([]);
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [oficinas, setOficinas] = useState<Oficina[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [seguimientoForm, setSeguimientoForm] = useState<SeguimientoFormValues | null>(null);
  const [seguimientoError, setSeguimientoError] = useState<string | null>(null);
  const [savingSeguimiento, setSavingSeguimiento] = useState(false);

  const loadLogs = useCallback(async () => {
    if (session?.rol !== "administrador") {
      setLogs([]);
      setLogsError(null);
      return;
    }

    try {
      const logsData = await apiFetch<LogPage>(
        `/api/v1/logs/?tabla_afectada=pensionados&registro_afectado=${pensionadoId}&page_size=100`,
      );
      setLogs(logsData.items);
      setLogsError(null);
    } catch (loadLogsError) {
      setLogsError(
        loadLogsError instanceof ApiError
          ? loadLogsError.message
          : "No se pudieron cargar las actualizaciones",
      );
    }
  }, [pensionadoId, session?.rol]);

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
        const [
          pensionadoData,
          creditosData,
          seguimientosData,
          pendientesData,
          oficinasData,
        ] = await Promise.all([
          apiFetch<Pensionado>(`/api/v1/pensionados/${pensionadoId}`),
          apiFetch<Credito[]>(`/api/v1/creditos/?pensionado_id=${pensionadoId}&limit=15`),
          apiFetch<Seguimiento[]>(`/api/v1/seguimientos/?pensionado_id=${pensionadoId}&limit=15`),
          apiFetch<PendienteCredito[]>("/api/v1/pendientes-credito/?estado=pendiente&limit=15"),
          apiFetch<Oficina[]>("/api/v1/oficinas/"),
        ]);

        if (!ignore) {
          const creditoIds = new Set(creditosData.map((credito) => credito.id));
          setPensionado(pensionadoData);
          setCreditos(creditosData);
          setPendientes(
            pendientesData.filter((pendiente) => creditoIds.has(pendiente.credito_id)),
          );
          setSeguimientos(seguimientosData);
          setOficinas(oficinasData);
        }

        if (!ignore) {
          await loadLogs();
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
  }, [loadLogs, pensionadoId]);

  const resumen = useMemo(() => {
    const activos = creditos.filter((credito) =>
      ["prospecto", "enviado a cooperativa", "devuelto por correccion", "reenviado", "aprobado"].includes(
        normalizeText(credito.estado),
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
      nombre: pensionado.nombre ?? "",
      segundo_nombre: pensionado.segundo_nombre ?? "",
      apellidos: pensionado.apellidos ?? "",
      genero: pensionado.genero ?? "No especificado",
      fecha_nacimiento: pensionado.fecha_nacimiento ?? "",
      correo: pensionado.correo ?? "",
      telefono: pensionado.telefono ?? "",
      celular: pensionado.celular ?? "",
      direccion: pensionado.direccion ?? "",
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

  function openSeguimientoModal() {
    const defaultOficinaId = session?.oficinaId ?? oficinas[0]?.id ?? "";
    setSeguimientoForm({
      ...emptySeguimientoForm,
      oficina_id: defaultOficinaId ? String(defaultOficinaId) : "",
    });
    setSeguimientoError(null);
  }

  function closeSeguimientoModal() {
    if (savingSeguimiento) {
      return;
    }

    setSeguimientoForm(null);
    setSeguimientoError(null);
  }

  async function handleSeguimientoSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!seguimientoForm || !pensionado) {
      return;
    }

    if (!seguimientoForm.oficina_id) {
      setSeguimientoError("Selecciona la oficina del seguimiento.");
      return;
    }

    setSavingSeguimiento(true);
    setSeguimientoError(null);

    try {
      const created = await apiFetch<Seguimiento>("/api/v1/seguimientos/", {
        method: "POST",
        body: JSON.stringify({
          pensionado_id: pensionado.id,
          oficina_id: Number(seguimientoForm.oficina_id),
          tipo: seguimientoForm.tipo,
          comentario: seguimientoForm.comentario.trim(),
          resultado: nullableText(seguimientoForm.resultado),
          fecha_proximo_contacto: seguimientoForm.fecha_proximo_contacto
            ? new Date(seguimientoForm.fecha_proximo_contacto).toISOString()
            : null,
        }),
      });

      setSeguimientos((current) => [created, ...current]);
      setSeguimientoForm(null);
    } catch (saveError) {
      setSeguimientoError(
        saveError instanceof ApiError
          ? saveError.message
          : "No se pudo crear el seguimiento",
      );
    } finally {
      setSavingSeguimiento(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form || !pensionado) {
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const payload: Record<string, string | null> = {
        nombre: form.nombre.trim(),
        segundo_nombre: nullableText(form.segundo_nombre),
        apellidos: nullableText(form.apellidos),
        genero: form.genero,
        correo: nullableText(form.correo),
        telefono: nullableText(form.telefono),
        celular: nullableText(form.celular),
        direccion: nullableText(form.direccion),
      };

      if (form.fecha_nacimiento && form.fecha_nacimiento !== pensionado.fecha_nacimiento) {
        payload.fecha_nacimiento = form.fecha_nacimiento;
      }

      const updated = await apiFetch<Pensionado>(`/api/v1/pensionados/${pensionado.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      setPensionado(updated);
      setForm(null);
      const freshPensionado = await apiFetch<Pensionado>(`/api/v1/pensionados/${pensionado.id}`);
      setPensionado(freshPensionado);
      await loadLogs();
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
    <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-3">
        <article className="rounded-lg border border-stone-800/10 bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Link href="/pensionados" className="text-xs font-semibold text-teal-700">
                Volver a pensionados
              </Link>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-stone-950">
                {pensionado.nombre_completo}
              </h1>
              <p className="mt-2 text-sm text-stone-600">
                Documento {pensionado.documento} - {pensionado.direccion ?? "Sin direccion"}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
              <button type="button" className="button-muted px-4 py-2 text-sm" onClick={openEditModal}>
                Editar
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg border border-red-500/15 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={deleting || !pensionado.is_active}
                onClick={() => void handleDelete()}
              >
                {deleting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Creditos" value={String(resumen.creditos)} />
            <Metric label="Activos" value={String(resumen.activos)} />
            <Metric label="Seguimientos" value={String(resumen.seguimientos)} />
            <Metric label="Solicitado" value={formatCurrency(resumen.montoSolicitado)} />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Detail label="Nombre" value={pensionado.nombre} />
            <Detail label="Segundo nombre" value={pensionado.segundo_nombre ?? "Sin registrar"} />
            <Detail label="Apellidos" value={pensionado.apellidos ?? "Sin registrar"} />
            <Detail label="Genero" value={pensionado.genero ?? "Sin registrar"} />
            <Detail label="Correo" value={pensionado.correo ?? "Sin correo registrado"} />
            <Detail
              label="Telefono"
              value={pensionado.telefono ?? "Sin telefono fijo"}
            />
            <Detail label="Celular" value={pensionado.celular ?? "Sin celular"} />
            <Detail label="Direccion" value={pensionado.direccion ?? "Sin direccion"} />
            <Detail label="Nacimiento" value={formatDate(pensionado.fecha_nacimiento)} />
          </div>
        </article>

        {selectedView === "creditos" ? (
          <CreditosList creditos={creditos} pendientes={pendientes} />
        ) : null}
        {selectedView === "seguimientos" ? (
          <SeguimientosList seguimientos={seguimientos} onCreate={openSeguimientoModal} />
        ) : null}
        {selectedView === "actualizaciones" ? (
          <ActualizacionesList
            logs={logs}
            logsError={logsError}
            isAdmin={session?.rol === "administrador"}
          />
        ) : null}
      </div>

      <aside className="rounded-lg border border-stone-800/10 bg-white p-3 shadow-sm xl:sticky xl:top-28 xl:self-start">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">
          Ficha
        </p>
        <nav className="mt-4 space-y-2">
          {views.map((view) => (
            <Link
              key={view.key}
              href={`/pensionados/${pensionado.id}?vista=${view.key}`}
              className={[
                "block rounded-md border px-3 py-2 text-sm font-medium transition",
                selectedView === view.key
                  ? "border-teal-700/20 bg-teal-950 text-white"
                  : "border-stone-800/10 bg-white/65 text-stone-700 hover:bg-white",
              ].join(" ")}
            >
              {view.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 rounded-md border border-stone-800/10 bg-white/65 px-3 py-2 text-sm text-stone-700">
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
      {seguimientoForm ? (
        <SeguimientoCreateModal
          form={seguimientoForm}
          error={seguimientoError}
          saving={savingSeguimiento}
          oficinas={oficinas}
          onChange={setSeguimientoForm}
          onClose={closeSeguimientoModal}
          onSubmit={handleSeguimientoSubmit}
        />
      ) : null}
    </section>
  );
}

function normalizeView(value: string | null): ViewKey {
  return views.some((view) => view.key === value) ? (value as ViewKey) : "creditos";
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function CreditosList({
  creditos,
  pendientes,
}: {
  creditos: Credito[];
  pendientes: PendienteCredito[];
}) {
  const pendientesByCreditoId = useMemo(() => {
    const grouped = new Map<number, PendienteCredito[]>();
    pendientes.forEach((pendiente) => {
      const current = grouped.get(pendiente.credito_id) ?? [];
      grouped.set(pendiente.credito_id, [...current, pendiente]);
    });
    return grouped;
  }, [pendientes]);

  return (
    <article className="overflow-hidden rounded-lg border border-stone-800/10 bg-white shadow-sm">
      <div className="border-b border-stone-800/10 px-5 py-4">
        <h2 className="text-lg font-semibold text-stone-950">Creditos del pensionado</h2>
      </div>

      <div className="hidden grid-cols-[0.8fr_1fr_1fr_0.8fr_1fr_88px] gap-3 border-b border-stone-800/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 md:grid">
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
          const pendientesAbiertos = pendientesByCreditoId.get(credito.id) ?? [];

          return (
            <Link
              key={credito.id}
              href={href}
              className="group grid gap-3 px-3 py-2.5 text-sm transition hover:bg-teal-50/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-700/35 md:grid-cols-[0.8fr_1fr_1fr_0.8fr_1fr_88px] md:items-center md:py-2"
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
                <PendingSummary
                  pendientes={pendientesAbiertos}
                />
              </span>
              <span className="flex items-center gap-2 md:justify-end">
                <span
                  aria-label={`Ver credito ${credito.id}`}
                  title="Ver credito"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-800/10 bg-white text-stone-700 transition group-hover:border-teal-700/30 group-hover:bg-teal-50 group-hover:text-teal-800"
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

function SeguimientosList({
  seguimientos,
  onCreate,
}: {
  seguimientos: Seguimiento[];
  onCreate: () => void;
}) {
  return (
    <article className="rounded-lg border border-stone-800/10 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-stone-950">Seguimientos</h2>
        <button type="button" className="button-primary" onClick={onCreate}>
          Crear seguimiento
        </button>
      </div>
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

function SeguimientoCreateModal({
  form,
  error,
  saving,
  oficinas,
  onChange,
  onClose,
  onSubmit,
}: {
  form: SeguimientoFormValues;
  error: string | null;
  saving: boolean;
  oficinas: Oficina[];
  onChange: (form: SeguimientoFormValues) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  function updateField(field: keyof SeguimientoFormValues, value: string) {
    onChange({ ...form, [field]: value });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 px-4 py-6 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="max-h-[calc(100vh-48px)] w-full max-w-2xl overflow-auto rounded-lg border border-stone-800/10 bg-white p-5 shadow-xl shadow-stone-950/20"
      >
        <div className="flex flex-col gap-3 border-b border-stone-800/10 pb-3 sm:flex-row sm:items-start sm:justify-between">
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

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Tipo"
            value={form.tipo}
            onChange={(value) => updateField("tipo", value)}
            options={seguimientoTipos.map((tipo) => tipo.label)}
            optionValues={seguimientoTipos.map((tipo) => tipo.value)}
          />
          <SelectField
            label="Oficina"
            value={form.oficina_id}
            onChange={(value) => updateField("oficina_id", value)}
            options={oficinas.map((oficina) => oficina.nombre)}
            optionValues={oficinas.map((oficina) => String(oficina.id))}
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

function PendingSummary({
  pendientes,
}: {
  pendientes: PendienteCredito[];
}) {
  if (pendientes.length === 0) {
    return null;
  }

  return (
    <span className="mt-1 block space-y-1 text-xs font-medium text-amber-700">
      <span className="block">
        {pendientes.length} pendiente{pendientes.length === 1 ? "" : "s"} operativo
        {pendientes.length === 1 ? "" : "s"}
      </span>
    </span>
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
    <article className="rounded-lg border border-stone-800/10 bg-white p-3 shadow-sm">
      <h2 className="text-lg font-semibold text-stone-950">Actualizaciones</h2>
      <div className="mt-4 divide-y divide-stone-800/10">
        {logs.map((log) => {
          const summary = describePensionadoLog(log);

          return (
            <div key={log.id} className="py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-stone-950">{summary.title}</p>
                  <p className="mt-1 text-sm text-stone-600">
                    {summary.description} Por {log.usuario_nombre ?? `usuario #${log.usuario_id}`}.
                  </p>
                </div>
                <p className="text-xs text-stone-500">{formatDateTime(log.created_at)}</p>
              </div>
              {summary.changes.length > 0 ? (
                <div className="mt-3 overflow-hidden rounded-md border border-stone-800/10">
                  {summary.changes.map((change) => (
                    <div
                      key={change.field}
                      className="grid gap-2 border-b border-stone-800/10 px-3 py-2 text-sm last:border-b-0 md:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)]"
                    >
                      <span className="font-semibold text-stone-800">{change.field}</span>
                      <span className="text-stone-500">
                        Antes: <span className="text-stone-800">{change.before}</span>
                      </span>
                      <span className="text-stone-500">
                        Despues: <span className="text-stone-800">{change.after}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}

        {logs.length === 0 ? (
          <p className="py-6 text-sm text-stone-500">No hay actualizaciones registradas.</p>
        ) : null}
      </div>
    </article>
  );
}

function describePensionadoLog(log: LogItem) {
  const changes = getAuditChanges(log);

  if (log.tipo_accion === "crear") {
    return {
      title: "Ficha creada",
      description: "Se registro el pensionado en el sistema.",
      changes,
    };
  }

  if (log.tipo_accion === "desactivar") {
    return {
      title: "Ficha desactivada",
      description: "El pensionado fue marcado como inactivo.",
      changes,
    };
  }

  if (log.tipo_accion === "actualizar") {
    return {
      title: "Datos actualizados",
      description:
        changes.length > 0
          ? `Se modificaron ${changes.length} campo${changes.length === 1 ? "" : "s"} de la ficha.`
          : "Se actualizo la ficha del pensionado.",
      changes,
    };
  }

  return {
    title: formatActionLabel(log.tipo_accion),
    description: "Se registro una actualizacion en la ficha.",
    changes,
  };
}

function getAuditChanges(log: LogItem) {
  const before = log.valores_antes ?? {};
  const after = log.valores_despues ?? {};
  const fieldNames = new Set([...Object.keys(before), ...Object.keys(after)]);

  return Array.from(fieldNames)
    .filter((field) => !["created_by", "documento"].includes(field))
    .filter((field) => formatAuditValue(before[field]) !== formatAuditValue(after[field]))
    .map((field) => ({
      field: auditFieldLabels[field] ?? formatActionLabel(field),
      before: formatAuditValue(before[field]),
      after: formatAuditValue(after[field]),
    }));
}

function formatAuditValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "Sin registrar";
  }

  if (typeof value === "boolean") {
    return value ? "Activo" : "Inactivo";
  }

  return String(value);
}

function formatActionLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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
        className="max-h-[calc(100vh-32px)] w-full max-w-3xl overflow-auto rounded-lg border border-stone-800/10 bg-white p-4 shadow-xl shadow-stone-950/10"
      >
        <div className="flex flex-col gap-3 border-b border-stone-800/10 pb-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">
              Editar pensionado
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-950">
              {[form.nombre, form.segundo_nombre, form.apellidos]
                .map((value) => value?.trim() ?? "")
                .filter(Boolean)
                .join(" ")}
            </h2>
          </div>
          <button type="button" className="button-muted px-3 py-2 text-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {error ? <div className="mt-4"><StateMessage tone="error" text={error} /></div> : null}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Nombre" value={form.nombre} onChange={(value) => updateField("nombre", value)} required />
          <Field label="Segundo nombre" value={form.segundo_nombre} onChange={(value) => updateField("segundo_nombre", value)} />
          <Field label="Apellidos" value={form.apellidos} onChange={(value) => updateField("apellidos", value)} />
          <SelectField
            label="Genero"
            value={form.genero}
            onChange={(value) => updateField("genero", value)}
            options={["Masculino", "Femenino", "Otro", "No especificado"]}
          />
          <Field
            label="Fecha de nacimiento"
            type="date"
            value={form.fecha_nacimiento}
            onChange={(value) => updateField("fecha_nacimiento", value)}
          />
          <Field label="Correo" type="email" value={form.correo} onChange={(value) => updateField("correo", value)} />
          <Field label="Telefono" value={form.telefono} onChange={(value) => updateField("telefono", value)} inputMode="tel" />
          <Field label="Celular" value={form.celular} onChange={(value) => updateField("celular", value)} inputMode="tel" />
          <div className="sm:col-span-2">
            <Field label="Direccion" value={form.direccion} onChange={(value) => updateField("direccion", value)} />
          </div>
        </div>

        <p className="mt-4 text-xs text-stone-500">
          Corrige las fechas solo cuando exista un error de digitacion. Estos datos afectan las
          reglas de edad usadas al crear creditos.
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
  optionValues,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  optionValues?: string[];
}) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      <span>{label}</span>
      <select
        className="input-base mt-2"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option, index) => (
          <option key={optionValues?.[index] ?? option} value={optionValues?.[index] ?? option}>
            {option}
          </option>
        ))}
      </select>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-stone-800/10 bg-white/65 px-4 py-3">
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

  if (normalized.includes("finaliz")) {
    return "warning";
  }

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
    <div className="rounded-md border border-stone-800/10 bg-white/65 px-4 py-3">
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
        "rounded-lg border px-5 py-4 text-sm",
        tone === "error"
          ? "border-red-500/20 bg-red-50 text-red-700"
          : "border-stone-800/10 bg-white/65 text-stone-500",
      ].join(" ")}
    >
      {text}
    </div>
  );
}
