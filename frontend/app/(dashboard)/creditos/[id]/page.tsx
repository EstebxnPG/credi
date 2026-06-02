"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

type Credito = {
  id: number;
  pensionado_id: number;
  asesor_id: number;
  oficina_id: number;
  cooperativa_id: number;
  pagaduria_id: number;
  nro_libranza: string | null;
  tipo_credito: string | null;
  monto_solicitado: number;
  monto_aprobado: number | null;
  plazo: number;
  estado: string;
  valor_cuota: number | null;
  fecha_desembolso: string | null;
  fecha_fin_estimada: string | null;
  observaciones: string | null;
  tiene_documentos_pendientes: boolean;
  documentos_pendientes: string | null;
  fecha_registro: string;
  created_at: string;
  updated_at: string;
};

type HistorialCredito = {
  id: number;
  credito_id: number;
  usuario_id: number;
  usuario_nombre: string | null;
  estado_anterior: string | null;
  estado_nuevo: string;
  observacion: string | null;
  created_at: string;
};

type Documento = {
  id: number;
  credito_id: number;
  nombre: string;
  tipo: string;
  url: string;
  version: number;
  is_active: boolean;
  created_at: string;
};

type Pensionado = {
  id: number;
  nombre_completo: string;
  documento: string;
  telefono: string;
  celular: string | null;
  correo: string | null;
};

type PendienteCredito = {
  id: number;
  credito_id: number;
  documento_id: number | null;
  descripcion: string;
  estado: string;
  origen: string;
  observacion_resolucion: string | null;
  created_by: number;
  resolved_by: number | null;
  created_at: string;
  resolved_at: string | null;
};

type PendienteForm = {
  descripcion: string;
  origen: string;
};

type Cooperativa = {
  id: number;
  nombre: string;
};

type Pagaduria = {
  id: number;
  nombre: string;
};

type EditForm = {
  cooperativa_id: string;
  pagaduria_id: string;
  monto_solicitado: string;
  plazo: string;
  nro_libranza: string;
  tipo_credito: string;
  observaciones: string;
  tiene_documentos_pendientes: boolean;
  documentos_pendientes: string;
};

type EstadoForm = {
  estado_nuevo: string;
  observaciones: string;
  monto_aprobado: string;
  valor_cuota: string;
  fecha_desembolso: string;
  fecha_fin_estimada: string;
};

const emptyPendienteForm: PendienteForm = {
  descripcion: "",
  origen: "cooperativa",
};

const emptyEstadoForm: EstadoForm = {
  estado_nuevo: "",
  observaciones: "",
  monto_aprobado: "",
  valor_cuota: "",
  fecha_desembolso: "",
  fecha_fin_estimada: "",
};

const transitionsByStatus: Record<string, string[]> = {
  Prospecto: ["Enviado a cooperativa"],
  "Enviado a cooperativa": ["Devuelto por correccion", "Aprobado", "Rechazado"],
  "Devuelto por correccion": ["Reenviado"],
  Reenviado: ["Devuelto por correccion", "Aprobado", "Rechazado"],
  Aprobado: [],
  Rechazado: [],
};

export default function CreditoDetailPage() {
  const params = useParams<{ id: string }>();
  const creditoId = Number(params.id);
  const [credito, setCredito] = useState<Credito | null>(null);
  const [pensionado, setPensionado] = useState<Pensionado | null>(null);
  const [historial, setHistorial] = useState<HistorialCredito[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [pendientes, setPendientes] = useState<PendienteCredito[]>([]);
  const [cooperativas, setCooperativas] = useState<Cooperativa[]>([]);
  const [pagadurias, setPagadurias] = useState<Pagaduria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendienteForm, setPendienteForm] = useState<PendienteForm>(emptyPendienteForm);
  const [pendienteError, setPendienteError] = useState<string | null>(null);
  const [savingPendiente, setSavingPendiente] = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [estadoForm, setEstadoForm] = useState<EstadoForm>(emptyEstadoForm);
  const [estadoError, setEstadoError] = useState<string | null>(null);
  const [savingEstado, setSavingEstado] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(creditoId)) {
      setError("Credito invalido");
      setLoading(false);
      return;
    }

    let ignore = false;

    async function loadCredito() {
      setLoading(true);
      setError(null);

      try {
        const [
          creditoData,
          historialData,
          documentosData,
          pendientesData,
          cooperativasData,
          pagaduriasData,
        ] = await Promise.all([
          apiFetch<Credito>(`/api/v1/creditos/${creditoId}`),
          apiFetch<HistorialCredito[]>(`/api/v1/creditos/${creditoId}/historial`),
          apiFetch<Documento[]>(`/api/v1/documentos/?credito_id=${creditoId}`),
          apiFetch<PendienteCredito[]>(`/api/v1/pendientes-credito/?credito_id=${creditoId}`),
          apiFetch<Cooperativa[]>("/api/v1/cooperativas/"),
          apiFetch<Pagaduria[]>("/api/v1/pagadurias/"),
        ]);
        const pensionadoData = await apiFetch<Pensionado>(
          `/api/v1/pensionados/${creditoData.pensionado_id}`,
        );

        if (!ignore) {
          setCredito(creditoData);
          setPensionado(pensionadoData);
          setHistorial(historialData);
          setDocumentos(documentosData);
          setPendientes(pendientesData);
          setCooperativas(cooperativasData);
          setPagadurias(pagaduriasData);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(
            loadError instanceof ApiError
              ? loadError.message
              : "No se pudo cargar el credito",
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadCredito();

    return () => {
      ignore = true;
    };
  }, [creditoId]);

  function openEditModal() {
    if (!credito) {
      return;
    }

    setEditForm({
      cooperativa_id: String(credito.cooperativa_id),
      pagaduria_id: String(credito.pagaduria_id),
      monto_solicitado: String(credito.monto_solicitado),
      plazo: String(credito.plazo),
      nro_libranza: credito.nro_libranza ?? "",
      tipo_credito: credito.tipo_credito ?? "",
      observaciones: credito.observaciones ?? "",
      tiene_documentos_pendientes: credito.tiene_documentos_pendientes,
      documentos_pendientes: credito.documentos_pendientes ?? "",
    });
    setEditError(null);
  }

  function closeEditModal() {
    if (savingEdit) {
      return;
    }

    setEditForm(null);
    setEditError(null);
  }

  async function handleUpdateCredito(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!credito || !editForm) {
      return;
    }

    setSavingEdit(true);
    setEditError(null);

    try {
      const updated = await apiFetch<Credito>(`/api/v1/creditos/${credito.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          cooperativa_id: Number(editForm.cooperativa_id),
          pagaduria_id: Number(editForm.pagaduria_id),
          monto_solicitado: Number(editForm.monto_solicitado),
          plazo: Number(editForm.plazo),
          nro_libranza: nullableText(editForm.nro_libranza),
          tipo_credito: nullableText(editForm.tipo_credito),
          observaciones: nullableText(editForm.observaciones),
          tiene_documentos_pendientes: editForm.tiene_documentos_pendientes,
          documentos_pendientes: editForm.tiene_documentos_pendientes
            ? nullableText(editForm.documentos_pendientes)
            : null,
        }),
      });

      setCredito(updated);
      closeEditModal();
    } catch (saveError) {
      setEditError(saveError instanceof ApiError ? saveError.message : "No se pudo editar el credito");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleUploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!credito || !documentFile) {
      setDocumentError("Selecciona un archivo para adjuntar.");
      return;
    }

    setUploadingDocument(true);
    setDocumentError(null);

    try {
      const payload = new FormData();
      payload.append("credito_id", String(credito.id));
      payload.append("archivo", documentFile);

      const created = await apiFetch<Documento>("/api/v1/documentos/", {
        method: "POST",
        body: payload,
      });

      setDocumentos((current) => [created, ...current]);
      setDocumentFile(null);
      event.currentTarget.reset();
    } catch (uploadError) {
      setDocumentError(
        uploadError instanceof ApiError ? uploadError.message : "No se pudo adjuntar el documento",
      );
    } finally {
      setUploadingDocument(false);
    }
  }

  async function handleChangeEstado(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!credito || !estadoForm.estado_nuevo) {
      setEstadoError("Selecciona el nuevo estado.");
      return;
    }

    setSavingEstado(true);
    setEstadoError(null);

    try {
      const updated = await apiFetch<Credito>(`/api/v1/creditos/${credito.id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({
          estado_nuevo: toApiStatus(estadoForm.estado_nuevo),
          observaciones: nullableText(estadoForm.observaciones),
          monto_aprobado:
            estadoForm.estado_nuevo === "Aprobado" ? Number(estadoForm.monto_aprobado) : null,
          valor_cuota: nullableNumber(estadoForm.valor_cuota),
          fecha_desembolso: nullableText(estadoForm.fecha_desembolso),
          fecha_fin_estimada: nullableText(estadoForm.fecha_fin_estimada),
        }),
      });
      const historialData = await apiFetch<HistorialCredito[]>(
        `/api/v1/creditos/${credito.id}/historial`,
      );

      setCredito(updated);
      setHistorial(historialData);
      setEstadoForm(emptyEstadoForm);
    } catch (changeError) {
      setEstadoError(
        changeError instanceof ApiError ? changeError.message : "No se pudo cambiar el estado",
      );
    } finally {
      setSavingEstado(false);
    }
  }

  async function handleCreatePendiente(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!credito) {
      return;
    }

    setSavingPendiente(true);
    setPendienteError(null);

    try {
      const created = await apiFetch<PendienteCredito>("/api/v1/pendientes-credito/", {
        method: "POST",
        body: JSON.stringify({
          credito_id: credito.id,
          descripcion: pendienteForm.descripcion.trim(),
          origen: pendienteForm.origen,
        }),
      });

      setPendientes((current) => [created, ...current]);
      setPendienteForm(emptyPendienteForm);
    } catch (createError) {
      setPendienteError(
        createError instanceof ApiError
          ? createError.message
          : "No se pudo crear el pendiente",
      );
    } finally {
      setSavingPendiente(false);
    }
  }

  async function handleResolvePendiente(pendiente: PendienteCredito) {
    setResolvingId(pendiente.id);
    setPendienteError(null);

    try {
      const resolved = await apiFetch<PendienteCredito>(
        `/api/v1/pendientes-credito/${pendiente.id}/resolver`,
        {
          method: "PATCH",
          body: JSON.stringify({
            observacion_resolucion: "Resuelto desde la ficha del credito",
          }),
        },
      );

      setPendientes((current) =>
        current.map((item) => (item.id === resolved.id ? resolved : item)),
      );
    } catch (resolveError) {
      setPendienteError(
        resolveError instanceof ApiError
          ? resolveError.message
          : "No se pudo resolver el pendiente",
      );
    } finally {
      setResolvingId(null);
    }
  }

  if (loading) {
    return <StateMessage text="Cargando credito..." />;
  }

  if (error || !credito) {
    return <StateMessage tone="error" text={error ?? "Credito no encontrado"} />;
  }

  const availableTransitions = getAvailableTransitions(credito.estado);

  return (
    <section className="space-y-4">
      <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
        <Link
          href={`/pensionados/${credito.pensionado_id}?vista=creditos`}
          className="text-xs font-semibold text-teal-700"
        >
          Volver al pensionado
        </Link>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-stone-950">
              Credito #{credito.id}
            </h1>
            <p className="mt-2 text-sm text-stone-600">
              Estado actual: <span className="font-semibold">{credito.estado}</span>
            </p>
            <p className="mt-2 text-sm text-stone-700">
              {pensionado ? (
                <>
                  Pensionado:{" "}
                  <Link
                    href={`/pensionados/${pensionado.id}?vista=creditos`}
                    className="font-semibold text-teal-700 hover:text-teal-900"
                  >
                    {pensionado.nombre_completo}
                  </Link>{" "}
                  <span className="text-stone-500">CC {pensionado.documento}</span>
                </>
              ) : (
                `Pensionado #${credito.pensionado_id}`
              )}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="rounded-xl border border-stone-800/10 bg-white/70 px-4 py-3 text-sm text-stone-700">
              Registrado {formatDate(credito.fecha_registro)}
            </div>
            <button
              type="button"
              className="button-primary whitespace-nowrap"
              onClick={openEditModal}
              disabled={!isEditable(credito)}
              title={isEditable(credito) ? "Editar credito" : "Este credito no se puede editar"}
            >
              Editar
            </button>
          </div>
        </div>
      </article>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
          <h2 className="text-lg font-semibold text-stone-950">Pensionado</h2>
          {pensionado ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Detail label="Nombre" value={pensionado.nombre_completo} />
              <Detail label="Documento" value={pensionado.documento} />
              <Detail label="Telefono" value={pensionado.celular ?? pensionado.telefono} />
              <Detail label="Correo" value={pensionado.correo ?? "Sin correo"} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-stone-500">No se pudo cargar el pensionado.</p>
          )}
        </article>

        <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-stone-950">Estado del credito</h2>
              <p className="mt-1 text-sm text-stone-600">
                Cambia el estado segun el flujo permitido del credito.
              </p>
            </div>
            <span className="rounded-full border border-stone-800/10 bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
              {credito.estado}
            </span>
          </div>

          {availableTransitions.length > 0 ? (
            <form onSubmit={handleChangeEstado} className="mt-4 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="Nuevo estado"
                  value={estadoForm.estado_nuevo}
                  onChange={(value) => setEstadoForm((current) => ({ ...current, estado_nuevo: value }))}
                  options={availableTransitions.map((estado) => ({ value: estado, label: estado }))}
                  required
                />
                {estadoForm.estado_nuevo === "Aprobado" ? (
                  <Field
                    label="Monto aprobado"
                    type="number"
                    value={estadoForm.monto_aprobado}
                    onChange={(value) =>
                      setEstadoForm((current) => ({ ...current, monto_aprobado: value }))
                    }
                    required
                  />
                ) : null}
              </div>

              {estadoForm.estado_nuevo === "Aprobado" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Valor cuota" type="number" value={estadoForm.valor_cuota} onChange={(value) => setEstadoForm((current) => ({ ...current, valor_cuota: value }))} />
                  <Field label="Fecha desembolso" type="date" value={estadoForm.fecha_desembolso} onChange={(value) => setEstadoForm((current) => ({ ...current, fecha_desembolso: value }))} />
                  <Field label="Fecha fin estimada" type="date" value={estadoForm.fecha_fin_estimada} onChange={(value) => setEstadoForm((current) => ({ ...current, fecha_fin_estimada: value }))} />
                </div>
              ) : null}

              <TextareaField
                label="Observacion"
                value={estadoForm.observaciones}
                onChange={(value) =>
                  setEstadoForm((current) => ({ ...current, observaciones: value }))
                }
              />

              {estadoError ? <StateMessage tone="error" text={estadoError} /> : null}

              <div className="flex justify-end">
                <button type="submit" className="button-primary" disabled={savingEstado}>
                  {savingEstado ? "Actualizando..." : "Cambiar estado"}
                </button>
              </div>
            </form>
          ) : (
            <p className="mt-4 rounded-xl border border-stone-800/10 bg-white/65 px-4 py-3 text-sm text-stone-600">
              Este credito esta en estado final y no tiene mas transiciones.
            </p>
          )}
        </article>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
          <h2 className="text-lg font-semibold text-stone-950">Datos del credito</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Detail label="Solicitado" value={formatCurrency(credito.monto_solicitado)} />
            <Detail label="Aprobado" value={formatCurrency(credito.monto_aprobado)} />
            <Detail label="Plazo" value={`${credito.plazo} meses`} />
            <Detail label="Cuota" value={formatCurrency(credito.valor_cuota)} />
            <Detail label="Tipo" value={credito.tipo_credito ?? "Sin tipo"} />
            <Detail label="Libranza" value={credito.nro_libranza ?? "Sin libranza"} />
          </div>
          {credito.observaciones ? (
            <p className="mt-4 rounded-xl border border-stone-800/10 bg-white/65 px-4 py-3 text-sm text-stone-700">
              {credito.observaciones}
            </p>
          ) : null}
        </article>

        <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
          <h2 className="text-lg font-semibold text-stone-950">Documentos</h2>
          <form onSubmit={handleUploadDocument} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              id="document-upload"
              className="sr-only"
              type="file"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setDocumentFile(event.target.files?.[0] ?? null)
              }
              required
            />
            <label
              htmlFor="document-upload"
              className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-teal-700/35 bg-teal-50/50 px-4 py-2 text-sm text-stone-700 transition hover:border-teal-700/60 hover:bg-teal-50"
            >
              <span className="min-w-0 truncate">
                {documentFile ? documentFile.name : "Seleccionar documento"}
              </span>
              <span className="shrink-0 rounded-lg bg-white px-3 py-1 text-xs font-semibold text-teal-800">
                Buscar
              </span>
            </label>
            <button
              type="submit"
              className="button-primary whitespace-nowrap"
              disabled={uploadingDocument}
            >
              {uploadingDocument ? "Adjuntando..." : "Adjuntar"}
            </button>
          </form>
          {documentError ? <div className="mt-4"><StateMessage tone="error" text={documentError} /></div> : null}
          <div className="mt-4 divide-y divide-stone-800/10">
            {documentos.map((documento) => (
              <div key={documento.id} className="py-3 text-sm">
                <p className="font-semibold text-stone-950">{documento.nombre}</p>
                <p className="mt-1 text-stone-500">
                  {documento.tipo} - version {documento.version} -{" "}
                  {formatDateTime(documento.created_at)}
                </p>
              </div>
            ))}
            {documentos.length === 0 ? (
              <p className="py-6 text-sm text-stone-500">No hay documentos cargados.</p>
            ) : null}
          </div>
        </article>
      </div>

      <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-stone-950">Pendientes operativos</h2>
            <p className="mt-1 text-sm text-stone-600">
              Registra solicitudes de cooperativas, documentos faltantes o tareas internas.
            </p>
          </div>
          <span className="rounded-full border border-amber-700/20 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
            {pendientes.filter((item) => item.estado === "pendiente").length} abiertos
          </span>
        </div>

        <form onSubmit={handleCreatePendiente} className="mt-4 grid gap-3 lg:grid-cols-[1fr_180px_auto]">
          <input
            className="input-base"
            value={pendienteForm.descripcion}
            onChange={(event) =>
              setPendienteForm((current) => ({
                ...current,
                descripcion: event.target.value,
              }))
            }
            placeholder="Ej: Cooperativa pidio cedula legible"
            required
          />
          <select
            className="input-base"
            value={pendienteForm.origen}
            onChange={(event) =>
              setPendienteForm((current) => ({ ...current, origen: event.target.value }))
            }
          >
            <option value="cooperativa">Cooperativa</option>
            <option value="cliente">Cliente</option>
            <option value="interno">Interno</option>
          </select>
          <button type="submit" className="button-primary whitespace-nowrap" disabled={savingPendiente}>
            {savingPendiente ? "Guardando..." : "Crear pendiente"}
          </button>
        </form>

        {pendienteError ? <div className="mt-4"><StateMessage tone="error" text={pendienteError} /></div> : null}

        <div className="mt-4 divide-y divide-stone-800/10">
          {pendientes.map((pendiente) => (
            <div key={pendiente.id} className="grid gap-3 py-4 text-sm md:grid-cols-[1fr_120px_150px_auto] md:items-center">
              <div>
                <p className="font-semibold text-stone-950">{pendiente.descripcion}</p>
                <p className="mt-1 text-xs text-stone-500">
                  {pendiente.origen} - {formatDateTime(pendiente.created_at)}
                </p>
                {pendiente.observacion_resolucion ? (
                  <p className="mt-2 text-xs text-stone-600">{pendiente.observacion_resolucion}</p>
                ) : null}
              </div>
              <PendingBadge estado={pendiente.estado} />
              <span className="text-xs text-stone-500">
                {pendiente.resolved_at ? formatDateTime(pendiente.resolved_at) : "Sin resolver"}
              </span>
              <div className="md:text-right">
                {pendiente.estado === "pendiente" ? (
                  <button
                    type="button"
                    className="button-muted px-3 py-2 text-sm"
                    disabled={resolvingId === pendiente.id}
                    onClick={() => void handleResolvePendiente(pendiente)}
                  >
                    {resolvingId === pendiente.id ? "Resolviendo..." : "Resolver"}
                  </button>
                ) : null}
              </div>
            </div>
          ))}

          {pendientes.length === 0 ? (
            <p className="py-6 text-sm text-stone-500">Este credito no tiene pendientes operativos.</p>
          ) : null}
        </div>
      </article>

      <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
        <h2 className="text-lg font-semibold text-stone-950">Historial de estado</h2>
        <div className="mt-4 divide-y divide-stone-800/10">
          {historial.map((item) => (
            <div key={item.id} className="py-4 text-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-semibold text-stone-950">
                  {`${item.estado_anterior ?? "Creado"} -> ${item.estado_nuevo}`}
                </p>
                <p className="text-xs text-stone-500">{formatDateTime(item.created_at)}</p>
              </div>
              <p className="mt-2 text-stone-600">
                {item.observacion ?? "Sin observacion"}{" "}
                {item.usuario_nombre ? `por ${item.usuario_nombre}` : ""}
              </p>
            </div>
          ))}
        </div>
      </article>

      {editForm ? (
        <EditCreditoModal
          credito={credito}
          form={editForm}
          error={editError}
          saving={savingEdit}
          cooperativas={cooperativas}
          pagadurias={pagadurias}
          onChange={setEditForm}
          onClose={closeEditModal}
          onSubmit={handleUpdateCredito}
        />
      ) : null}
    </section>
  );
}

function EditCreditoModal({
  credito,
  form,
  error,
  saving,
  cooperativas,
  pagadurias,
  onChange,
  onClose,
  onSubmit,
}: {
  credito: Credito;
  form: EditForm;
  error: string | null;
  saving: boolean;
  cooperativas: Cooperativa[];
  pagadurias: Pagaduria[];
  onChange: (form: EditForm) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  function updateField(field: keyof EditForm, value: string | boolean) {
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
              Editar credito
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-950">Credito #{credito.id}</h2>
          </div>
          <button type="button" className="button-muted px-3 py-2 text-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {error ? <div className="mt-4"><StateMessage tone="error" text={error} /></div> : null}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Cooperativa"
            value={form.cooperativa_id}
            onChange={(value) => updateField("cooperativa_id", value)}
            options={cooperativas.map((cooperativa) => ({
              value: String(cooperativa.id),
              label: cooperativa.nombre,
            }))}
            required
          />
          <SelectField
            label="Pagaduria"
            value={form.pagaduria_id}
            onChange={(value) => updateField("pagaduria_id", value)}
            options={pagadurias.map((pagaduria) => ({
              value: String(pagaduria.id),
              label: pagaduria.nombre,
            }))}
            required
          />
          <Field label="Monto solicitado" type="number" value={form.monto_solicitado} onChange={(value) => updateField("monto_solicitado", value)} required />
          <Field label="Plazo" type="number" value={form.plazo} onChange={(value) => updateField("plazo", value)} required />
          <Field label="Nro libranza" value={form.nro_libranza} onChange={(value) => updateField("nro_libranza", value)} />
          <Field label="Tipo de credito" value={form.tipo_credito} onChange={(value) => updateField("tipo_credito", value)} />
          <label className="flex items-center gap-3 rounded-2xl border border-stone-800/10 bg-white/70 px-4 py-3 text-sm font-medium text-stone-700">
            <input
              type="checkbox"
              checked={form.tiene_documentos_pendientes}
              onChange={(event) => updateField("tiene_documentos_pendientes", event.target.checked)}
            />
            Documentos pendientes
          </label>
          <div className="sm:col-span-2">
            <TextareaField
              label="Documentos pendientes"
              value={form.documentos_pendientes}
              onChange={(value) => updateField("documentos_pendientes", value)}
              disabled={!form.tiene_documentos_pendientes}
            />
          </div>
          <div className="sm:col-span-2">
            <TextareaField label="Observaciones" value={form.observaciones} onChange={(value) => updateField("observaciones", value)} />
          </div>
        </div>

        <p className="mt-4 text-xs text-stone-500">
          Solo se pueden editar creditos en Prospecto o Devuelto por correccion.
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
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
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
      />
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      <span>{label}</span>
      <textarea
        className="input-base mt-2 min-h-24 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-800/10 bg-white/65 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-stone-900">{value}</p>
    </div>
  );
}

function PendingBadge({ estado }: { estado: string }) {
  const isOpen = estado === "pendiente";

  return (
    <span
      className={[
        "inline-flex w-fit items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        isOpen
          ? "border-amber-700/20 bg-amber-50 text-amber-800"
          : "border-teal-700/20 bg-teal-50 text-teal-800",
      ].join(" ")}
    >
      {isOpen ? "Pendiente" : "Resuelto"}
    </span>
  );
}

function isEditable(credito: Credito) {
  return ["Prospecto", "Devuelto por correccion"].includes(normalizeStatus(credito.estado));
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nullableNumber(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? Number(trimmed) : null;
}

function normalizeStatus(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getAvailableTransitions(estado: string) {
  return transitionsByStatus[normalizeStatus(estado)] ?? [];
}

function toApiStatus(estado: string) {
  if (estado === "Devuelto por correccion") {
    return "Devuelto por corrección";
  }

  return estado;
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
