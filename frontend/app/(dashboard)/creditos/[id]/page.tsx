"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";

import { ApiError, apiDownload, apiFetch } from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatMoneyInput,
  parseMoneyInput,
  parseNullableMoneyInput,
  sanitizeMoneyInput,
} from "@/lib/format";

type Credito = {
  id: number;
  is_active: boolean;
  pensionado_id: number;
  asesor_id: number;
  asesor_nombre: string | null;
  oficina_id: number;
  cooperativa_id: number;
  credito_refinanciado_id: number | null;
  pagaduria_id: number;
  nro_libranza: string | null;
  tipo_credito: string | null;
  entidad_financiera_origen: string | null;
  monto_solicitado: number;
  monto_aprobado: number | null;
  plazo: number;
  estado: string;
  motivo_finalizacion: string | null;
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
  simulador_url: string | null;
};

type Pagaduria = {
  id: number;
  nombre: string;
};

type Oficina = {
  id: number;
  nombre: string;
  color: string;
};

type Opportunity = {
  credito_id: number;
  estado_refinanciacion: string;
  estado_comercial: string;
  disponible_desde: string;
  meses_transcurridos: number;
  meses_requeridos: number;
};

type EditForm = {
  cooperativa_id: string;
  pagaduria_id: string;
  monto_solicitado: string;
  monto_aprobado: string;
  plazo: string;
  valor_cuota: string;
  nro_libranza: string;
  tipo_credito: string;
  motivo_finalizacion: string;
  credito_refinanciado_id: string;
  entidad_financiera_origen: string;
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
  motivo_finalizacion: string;
};

type ObservacionesForm = {
  observaciones: string;
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
  motivo_finalizacion: "",
};

const transitionsByStatus: Record<string, string[]> = {
  Prospecto: ["Enviado a cooperativa"],
  "Enviado a cooperativa": ["Devuelto por correccion", "Aprobado", "Rechazado"],
  "Devuelto por correccion": ["Reenviado"],
  Reenviado: ["Devuelto por correccion", "Aprobado", "Rechazado"],
  Aprobado: ["Finalizado"],
  Rechazado: [],
  Finalizado: [],
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
  const [oficinas, setOficinas] = useState<Oficina[]>([]);
  const [creditosPensionado, setCreditosPensionado] = useState<Credito[]>([]);
  const [refinanceOpportunity, setRefinanceOpportunity] = useState<Opportunity | null>(null);
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
  const [openingDocumentId, setOpeningDocumentId] = useState<number | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<number | null>(null);
  const [estadoForm, setEstadoForm] = useState<EstadoForm>(emptyEstadoForm);
  const [estadoError, setEstadoError] = useState<string | null>(null);
  const [savingEstado, setSavingEstado] = useState(false);
  const [observacionesForm, setObservacionesForm] = useState<ObservacionesForm | null>(null);
  const [observacionesError, setObservacionesError] = useState<string | null>(null);
  const [savingObservaciones, setSavingObservaciones] = useState(false);

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
          oficinasData,
        ] = await Promise.all([
          apiFetch<Credito>(`/api/v1/creditos/${creditoId}`),
          apiFetch<HistorialCredito[]>(`/api/v1/creditos/${creditoId}/historial`),
          apiFetch<Documento[]>(`/api/v1/documentos/?credito_id=${creditoId}&limit=15`),
          apiFetch<PendienteCredito[]>(`/api/v1/pendientes-credito/?credito_id=${creditoId}&limit=15`),
          apiFetch<Cooperativa[]>("/api/v1/cooperativas/"),
          apiFetch<Pagaduria[]>("/api/v1/pagadurias/"),
          apiFetch<Oficina[]>("/api/v1/oficinas/"),
        ]);
        const [pensionadoData, creditosPensionadoData] = await Promise.all([
          apiFetch<Pensionado>(`/api/v1/pensionados/${creditoData.pensionado_id}`),
          apiFetch<Credito[]>(
            `/api/v1/creditos/?pensionado_id=${creditoData.pensionado_id}&limit=15`,
          ),
        ]);

        if (!ignore) {
          setCredito(creditoData);
          setPensionado(pensionadoData);
          setHistorial(historialData);
          setDocumentos(documentosData);
          setPendientes(pendientesData);
          setCooperativas(cooperativasData);
          setPagadurias(pagaduriasData);
          setOficinas(oficinasData);
          setCreditosPensionado(creditosPensionadoData);
          void apiFetch<Opportunity[]>(
            `/api/v1/refinanciaciones/elegibles/?credito_id=${creditoData.id}&limit=1`,
          )
            .then((items) => {
              if (!ignore) {
                setRefinanceOpportunity(items[0] ?? null);
              }
            })
            .catch(() => {
              if (!ignore) {
                setRefinanceOpportunity(null);
              }
            });
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
      monto_aprobado: credito.monto_aprobado ? String(credito.monto_aprobado) : "",
      plazo: String(credito.plazo),
      valor_cuota: credito.valor_cuota ? String(credito.valor_cuota) : "",
      nro_libranza: credito.nro_libranza ?? "",
      tipo_credito: credito.tipo_credito ?? "NUEVO",
      motivo_finalizacion: credito.motivo_finalizacion ?? "",
      credito_refinanciado_id: credito.credito_refinanciado_id
        ? String(credito.credito_refinanciado_id)
        : "",
      entidad_financiera_origen: credito.entidad_financiera_origen ?? "",
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

  function openObservacionesModal() {
    if (!credito) {
      return;
    }

    setObservacionesForm({ observaciones: credito.observaciones ?? "" });
    setObservacionesError(null);
  }

  function closeObservacionesModal() {
    if (savingObservaciones) {
      return;
    }

    setObservacionesForm(null);
    setObservacionesError(null);
  }

  async function handleUpdateCredito(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!credito || !editForm) {
      return;
    }

    setSavingEdit(true);
    setEditError(null);

    try {
      const updatePayload =
        normalizeStatus(credito.estado).toLowerCase() === "aprobado"
          ? {
              cooperativa_id: Number(editForm.cooperativa_id),
              monto_solicitado: parseMoneyInput(editForm.monto_solicitado),
              monto_aprobado: parseNullableMoneyInput(editForm.monto_aprobado),
              plazo: Number(editForm.plazo),
              valor_cuota: parseNullableMoneyInput(editForm.valor_cuota),
              nro_libranza: nullableText(editForm.nro_libranza),
              tipo_credito: editForm.tipo_credito,
              motivo_finalizacion: nullableText(editForm.motivo_finalizacion),
              observaciones: nullableText(editForm.observaciones),
            }
          : {
              cooperativa_id: Number(editForm.cooperativa_id),
              pagaduria_id: Number(editForm.pagaduria_id),
              monto_solicitado: parseMoneyInput(editForm.monto_solicitado),
              monto_aprobado: parseNullableMoneyInput(editForm.monto_aprobado),
              plazo: Number(editForm.plazo),
              valor_cuota: parseNullableMoneyInput(editForm.valor_cuota),
              nro_libranza: nullableText(editForm.nro_libranza),
              tipo_credito: editForm.tipo_credito,
              motivo_finalizacion: nullableText(editForm.motivo_finalizacion),
              credito_refinanciado_id:
                editForm.tipo_credito === "REFINANCIACION"
                  ? Number(editForm.credito_refinanciado_id)
                  : null,
              entidad_financiera_origen:
                editForm.tipo_credito === "COMPRA CARTERA"
                  ? nullableText(editForm.entidad_financiera_origen)
                  : null,
              observaciones: nullableText(editForm.observaciones),
              tiene_documentos_pendientes: editForm.tiene_documentos_pendientes,
              documentos_pendientes: editForm.tiene_documentos_pendientes
                ? nullableText(editForm.documentos_pendientes)
                : null,
            };
      const updated = await apiFetch<Credito>(`/api/v1/creditos/${credito.id}`, {
        method: "PATCH",
        body: JSON.stringify(updatePayload),
      });

      setCredito(updated);
      closeEditModal();
    } catch (saveError) {
      setEditError(saveError instanceof ApiError ? saveError.message : "No se pudo editar el credito");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleUpdateObservaciones(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!credito || !observacionesForm) {
      return;
    }

    setSavingObservaciones(true);
    setObservacionesError(null);

    try {
      const updated = await apiFetch<Credito>(`/api/v1/creditos/${credito.id}/observaciones`, {
        method: "PATCH",
        body: JSON.stringify({
          observaciones: nullableText(observacionesForm.observaciones),
        }),
      });

      setCredito(updated);
      closeObservacionesModal();
    } catch (saveError) {
      setObservacionesError(
        saveError instanceof ApiError
          ? saveError.message
          : "No se pudieron guardar las observaciones",
      );
    } finally {
      setSavingObservaciones(false);
    }
  }

  async function handleUploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;

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
      formElement.reset();
    } catch (uploadError) {
      setDocumentError(
        uploadError instanceof ApiError ? uploadError.message : "No se pudo adjuntar el documento",
      );
    } finally {
      setUploadingDocument(false);
    }
  }

  async function handleOpenDocument(documento: Documento) {
    setOpeningDocumentId(documento.id);
    setDocumentError(null);
    const previewWindow = window.open("", "_blank");

    try {
      const blob = await apiDownload(`/api/v1/documentos/${documento.id}/descargar`);
      const typedBlob = new Blob([blob], { type: documentMimeType(documento.tipo) });
      const objectUrl = window.URL.createObjectURL(typedBlob);
      if (previewWindow) {
        previewWindow.opener = null;
        previewWindow.location.href = objectUrl;
      } else {
        window.location.href = objectUrl;
      }
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000);
    } catch (downloadError) {
      previewWindow?.close();
      setDocumentError(
        downloadError instanceof ApiError
          ? downloadError.message
          : "No se pudo abrir el documento",
      );
    } finally {
      setOpeningDocumentId(null);
    }
  }

  async function handleDeleteDocument(documento: Documento) {
    const confirmed = window.confirm(
      `Vas a eliminar el documento ${documento.nombre}. Esta accion lo ocultara del credito.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingDocumentId(documento.id);
    setDocumentError(null);

    try {
      await apiFetch<Documento>(`/api/v1/documentos/${documento.id}`, {
        method: "DELETE",
      });
      setDocumentos((current) => current.filter((item) => item.id !== documento.id));
    } catch (deleteError) {
      setDocumentError(
        deleteError instanceof ApiError
          ? deleteError.message
          : "No se pudo eliminar el documento",
      );
    } finally {
      setDeletingDocumentId(null);
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
            estadoForm.estado_nuevo === "Aprobado"
              ? parseMoneyInput(estadoForm.monto_aprobado)
              : null,
          valor_cuota: parseNullableMoneyInput(estadoForm.valor_cuota),
          fecha_desembolso: nullableText(estadoForm.fecha_desembolso),
          fecha_fin_estimada: nullableText(estadoForm.fecha_fin_estimada),
          motivo_finalizacion:
            estadoForm.estado_nuevo === "Finalizado"
              ? estadoForm.motivo_finalizacion
              : null,
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
  const cooperativaActual = cooperativas.find((item) => item.id === credito.cooperativa_id);
  const oficinaActual = oficinas.find((item) => item.id === credito.oficina_id);
  const canRefinance = isReadyToRefinance(refinanceOpportunity);

  return (
    <section className="space-y-3">
      <article className="rounded-lg border border-stone-800/10 bg-white p-3 shadow-sm">
        <Link
          href={`/pensionados/${credito.pensionado_id}?vista=creditos`}
          className="text-xs font-semibold text-teal-700"
        >
          Volver al pensionado
        </Link>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-stone-950">
              Credito #{credito.id}
            </h1>
            <p className="mt-2 text-sm text-stone-600">
              Estado actual: <span className="font-semibold">{credito.estado}</span>
            </p>
            <div className="mt-2">
              <OfficeBadge oficina={oficinaActual} />
            </div>
            <p className="mt-2 text-sm text-stone-700">
              Responsable del credito:{" "}
              <span className="font-semibold text-stone-950">
                {credito.asesor_nombre ?? `Asesor #${credito.asesor_id}`}
              </span>
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
            <div className="rounded-md border border-stone-800/10 bg-white/70 px-3 py-2 text-sm text-stone-700">
              Registrado {formatDate(credito.fecha_registro)}
            </div>
            {canRefinance ? (
              <Link
                href={`/creditos?refinanciar=${credito.id}`}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-emerald-700/30 bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-emerald-900/20 transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-xs">
                  $
                </span>
                Refinanciar ahora
              </Link>
            ) : refinanceOpportunity ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                Refinanciacion {refinanceOpportunity.estado_refinanciacion.toLowerCase()}
              </div>
            ) : null}
            <button
              type="button"
              className="button-primary whitespace-nowrap"
              onClick={openEditModal}
              disabled={!credito.is_active || !isCreditoEditable(credito)}
              title={
                credito.is_active && isCreditoEditable(credito)
                  ? "Editar credito"
                  : "Solo se bloquean creditos finalizados o rechazados"
              }
            >
              Editar
            </button>
          </div>
        </div>
      </article>

      <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
        <article className="rounded-lg border border-stone-800/10 bg-white p-3 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-950">Pensionado</h2>
          {pensionado ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Detail label="Nombre" value={pensionado.nombre_completo} />
              <Detail label="Documento" value={pensionado.documento} />
              <Detail label="Telefono" value={pensionado.celular ?? pensionado.telefono} />
              <Detail label="Correo" value={pensionado.correo ?? "Sin correo"} />
              <Detail label="Oficina del credito" value={oficinaActual?.nombre ?? `Oficina #${credito.oficina_id}`} />
              <Detail label="Responsable del credito" value={credito.asesor_nombre ?? `Asesor #${credito.asesor_id}`} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-stone-500">No se pudo cargar el pensionado.</p>
          )}
        </article>

        <article className="rounded-lg border border-stone-800/10 bg-white p-3 shadow-sm">
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
                  onChange={(value) =>
                    setEstadoForm((current) => ({
                      ...current,
                      estado_nuevo: value,
                      monto_aprobado:
                        value === "Aprobado"
                          ? String(credito.monto_solicitado)
                          : current.monto_aprobado,
                      fecha_fin_estimada:
                        value === "Aprobado" && current.fecha_desembolso
                          ? addMonthsToIsoDate(current.fecha_desembolso, credito.plazo)
                          : current.fecha_fin_estimada,
                      motivo_finalizacion:
                        value === "Finalizado" ? current.motivo_finalizacion : "",
                    }))
                  }
                  options={availableTransitions.map((estado) => ({ value: estado, label: estado }))}
                  required
                />
                {estadoForm.estado_nuevo === "Aprobado" ? (
                  <MoneyField
                    label="Monto aprobado"
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
                  <MoneyField label="Valor cuota" value={estadoForm.valor_cuota} onChange={(value) => setEstadoForm((current) => ({ ...current, valor_cuota: value }))} />
                  <Field
                    label="Fecha desembolso"
                    type="date"
                    value={estadoForm.fecha_desembolso}
                    onChange={(value) =>
                      setEstadoForm((current) => ({
                        ...current,
                        fecha_desembolso: value,
                        fecha_fin_estimada: value
                          ? addMonthsToIsoDate(value, credito.plazo)
                          : "",
                      }))
                    }
                    required
                  />
                  <Field
                    label="Fecha fin estimada"
                    type="date"
                    value={estadoForm.fecha_fin_estimada}
                    onChange={(value) =>
                      setEstadoForm((current) => ({ ...current, fecha_fin_estimada: value }))
                    }
                    required
                  />
                </div>
              ) : null}

              {estadoForm.estado_nuevo === "Finalizado" ? (
                <SelectField
                  label="Motivo de finalizacion"
                  value={estadoForm.motivo_finalizacion}
                  onChange={(value) =>
                    setEstadoForm((current) => ({ ...current, motivo_finalizacion: value }))
                  }
                  options={[
                    { value: "PAGO_NORMAL", label: "Pago normal" },
                    { value: "REFINANCIADO", label: "Refinanciado" },
                    { value: "AJUSTE_MIGRACION", label: "Ajuste migracion" },
                    { value: "ANULADO", label: "Anulado" },
                    { value: "OTRO", label: "Otro" },
                  ]}
                  required
                />
              ) : null}

              <TextareaField
                label="Observación del cambio de estado"
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
            <p className="mt-4 rounded-md border border-stone-800/10 bg-white/65 px-3 py-2 text-sm text-stone-600">
              Este credito esta en estado final y no tiene mas transiciones.
            </p>
          )}
        </article>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-lg border border-stone-800/10 bg-white p-3 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-950">Datos del credito</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Detail label="Solicitado" value={formatCurrency(credito.monto_solicitado)} />
            <Detail label="Aprobado" value={formatCurrency(credito.monto_aprobado)} />
            <Detail label="Plazo" value={`${credito.plazo} meses`} />
            <Detail label="Cuota" value={formatCurrency(credito.valor_cuota)} />
            <Detail label="Cooperativa" value={cooperativaActual?.nombre ?? "Sin cooperativa"} />
            {cooperativaActual?.simulador_url ? <a href={cooperativaActual.simulador_url} target="_blank" rel="noopener noreferrer" className="self-end pb-3 text-sm font-semibold text-teal-700 hover:underline">Abrir simuladora ↗</a> : null}
            <Detail label="Tipo" value={credito.tipo_credito ?? "Sin tipo"} />
            {credito.estado === "Finalizado" || credito.motivo_finalizacion ? (
              <Detail
                label="Motivo finalizacion"
                value={formatFinalizationReason(credito.motivo_finalizacion)}
              />
            ) : null}
            {credito.tipo_credito === "REFINANCIACION" ? (
              <Detail
                label="Credito refinanciado"
                value={
                  credito.credito_refinanciado_id
                    ? `#${credito.credito_refinanciado_id}`
                    : "Sin credito relacionado"
                }
              />
            ) : null}
            {credito.tipo_credito === "COMPRA CARTERA" ? (
              <Detail
                label="Entidad de origen"
                value={credito.entidad_financiera_origen ?? "Sin entidad registrada"}
              />
            ) : null}
            <Detail label="Libranza" value={credito.nro_libranza ?? "Sin libranza"} />
          </div>
          <div className="mt-4 rounded-md border border-stone-800/10 bg-white/65 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                Descripcion / observaciones
              </p>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-stone-800/10 bg-white text-stone-700 transition hover:border-teal-700/30 hover:bg-teal-50 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                title="Editar observaciones"
                aria-label="Editar observaciones"
                onClick={openObservacionesModal}
                disabled={!credito.is_active}
              >
                <PencilIcon />
              </button>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm font-medium text-stone-800">
              {credito.observaciones ?? "Sin descripcion registrada"}
            </p>
          </div>
        </article>

        <article className="rounded-lg border border-stone-800/10 bg-white p-3 shadow-sm">
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
              className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border border-dashed border-teal-700/35 bg-teal-50/50 px-4 py-2 text-sm text-stone-700 transition hover:border-teal-700/60 hover:bg-teal-50"
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
              <div
                key={documento.id}
                className="grid gap-3 py-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-stone-950">{documento.nombre}</p>
                  <p className="mt-1 text-stone-500">
                    {documento.tipo} - version {documento.version} -{" "}
                    {formatDateTime(documento.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <button
                    type="button"
                    className="button-muted px-3 py-2 text-sm"
                    disabled={openingDocumentId === documento.id}
                    onClick={() => void handleOpenDocument(documento)}
                  >
                    {openingDocumentId === documento.id ? "Abriendo..." : "Ver"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md border border-red-500/15 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={deletingDocumentId === documento.id}
                    onClick={() => void handleDeleteDocument(documento)}
                  >
                    {deletingDocumentId === documento.id ? "Eliminando..." : "Eliminar"}
                  </button>
                </div>
              </div>
            ))}
            {documentos.length === 0 ? (
              <p className="py-6 text-sm text-stone-500">No hay documentos cargados.</p>
            ) : null}
          </div>
        </article>
      </div>

      <article className="rounded-lg border border-stone-800/10 bg-white p-3 shadow-sm">
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

      <article className="rounded-lg border border-stone-800/10 bg-white p-3 shadow-sm">
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
              <div className="mt-3 rounded-md border border-stone-800/10 bg-stone-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                  Observación del cambio de estado
                </p>
                <p className="mt-2 text-stone-700">
                  {item.observacion?.trim() ? item.observacion : "Sin observación registrada"}
                </p>
                {item.usuario_nombre ? (
                  <p className="mt-2 text-xs text-stone-500">Registrado por {item.usuario_nombre}</p>
                ) : null}
              </div>
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
          creditosPensionado={creditosPensionado}
          onChange={setEditForm}
          onClose={closeEditModal}
          onSubmit={handleUpdateCredito}
        />
      ) : null}
      {observacionesForm ? (
        <ObservacionesModal
          form={observacionesForm}
          error={observacionesError}
          saving={savingObservaciones}
          onChange={setObservacionesForm}
          onClose={closeObservacionesModal}
          onSubmit={handleUpdateObservaciones}
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
  creditosPensionado,
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
  creditosPensionado: Credito[];
  onChange: (form: EditForm) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isApprovedEdit = normalizeStatus(credito.estado).toLowerCase() === "aprobado";

  function updateField(field: keyof EditForm, value: string | boolean) {
    if (field === "tipo_credito") {
      onChange({
        ...form,
        tipo_credito: String(value),
        credito_refinanciado_id: "",
        entidad_financiera_origen: "",
      });
      return;
    }
    onChange({ ...form, [field]: value });
  }

  const creditosRefinanciables = creditosPensionado.filter(
    (item) => item.estado === "Aprobado" && item.id !== credito.id,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 px-4 py-6 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="max-h-[calc(100vh-32px)] w-full max-w-3xl overflow-auto rounded-lg border border-stone-800/10 bg-white p-4 shadow-xl shadow-stone-950/10"
      >
        <div className="flex flex-col gap-3 border-b border-stone-800/10 pb-3 sm:flex-row sm:items-start sm:justify-between">
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

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
          {!isApprovedEdit ? (
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
          ) : null}
          <MoneyField label="Monto solicitado" value={form.monto_solicitado} onChange={(value) => updateField("monto_solicitado", value)} required />
          <MoneyField label="Monto aprobado" value={form.monto_aprobado} onChange={(value) => updateField("monto_aprobado", value)} />
          <Field label="Plazo" type="number" value={form.plazo} onChange={(value) => updateField("plazo", value)} required />
          <MoneyField label="Valor cuota" value={form.valor_cuota} onChange={(value) => updateField("valor_cuota", value)} />
          <Field label="Nro libranza" value={form.nro_libranza} onChange={(value) => updateField("nro_libranza", value)} />
          <SelectField
            label="Tipo de credito"
            value={form.tipo_credito}
            onChange={(value) => updateField("tipo_credito", value)}
            options={[
              { value: "NUEVO", label: "NUEVO" },
              { value: "REFINANCIACION", label: "REFINANCIACION" },
              { value: "COMPRA CARTERA", label: "COMPRA CARTERA" },
            ]}
            required
          />
          <SelectField
            label="Motivo finalizacion"
            value={form.motivo_finalizacion}
            onChange={(value) => updateField("motivo_finalizacion", value)}
            options={[
              { value: "PAGO_NORMAL", label: "Pago normal" },
              { value: "REFINANCIADO", label: "Refinanciado" },
              { value: "AJUSTE_MIGRACION", label: "Ajuste migracion" },
              { value: "ANULADO", label: "Anulado" },
              { value: "OTRO", label: "Otro" },
            ]}
          />
          {form.tipo_credito === "REFINANCIACION" ? (
            <SelectField
              label="Credito que refinancia"
              value={form.credito_refinanciado_id}
              onChange={(value) => updateField("credito_refinanciado_id", value)}
              options={creditosRefinanciables.map((item) => ({
                value: String(item.id),
                label: `#${item.id} - ${formatCurrency(
                  item.monto_aprobado ?? item.monto_solicitado,
                )}`,
              }))}
              required
            />
          ) : null}
          {form.tipo_credito === "COMPRA CARTERA" ? (
            <Field
              label="Entidad financiera de origen"
              value={form.entidad_financiera_origen}
              onChange={(value) => updateField("entidad_financiera_origen", value)}
              required
            />
          ) : null}
          {!isApprovedEdit ? (
            <>
              <label className="flex items-center gap-3 rounded-lg border border-stone-800/10 bg-white/70 px-3 py-2 text-sm font-medium text-stone-700">
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
            </>
          ) : null}
          <div className="sm:col-span-2">
            <TextareaField label="Observaciones" value={form.observaciones} onChange={(value) => updateField("observaciones", value)} />
          </div>
        </div>

        <p className="mt-4 text-xs text-stone-500">
          Puedes corregir creditos aprobados en campos operativos. Los creditos finalizados o
          rechazados permanecen cerrados.
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

function MoneyField({
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
      <input
        className="input-base mt-2"
        type="text"
        inputMode="numeric"
        value={formatMoneyInput(value)}
        onChange={(event) => onChange(sanitizeMoneyInput(event.target.value))}
        placeholder="0"
        required={required}
      />
    </label>
  );
}

function ObservacionesModal({
  form,
  error,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  form: ObservacionesForm;
  error: string | null;
  saving: boolean;
  onChange: (form: ObservacionesForm) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 px-4 py-6 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-2xl rounded-lg border border-stone-800/10 bg-white p-5 shadow-xl shadow-stone-950/20"
      >
        <div className="flex flex-col gap-3 border-b border-stone-800/10 pb-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">
              Observaciones
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-950">
              Editar descripcion del credito
            </h2>
          </div>
          <button type="button" className="button-muted px-3 py-2 text-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {error ? <div className="mt-4"><StateMessage tone="error" text={error} /></div> : null}

        <div className="mt-4">
          <TextareaField
            label="Descripcion / observaciones"
            value={form.observaciones}
            onChange={(value) => onChange({ observaciones: value })}
          />
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="button-muted" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="button-primary" disabled={saving}>
            {saving ? "Guardando..." : "Guardar observaciones"}
          </button>
        </div>
      </form>
    </div>
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
    <div className="rounded-md border border-stone-800/10 bg-white/65 px-4 py-3">
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

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function documentMimeType(tipo: string) {
  const normalized = tipo.toUpperCase();
  if (normalized === "PDF") {
    return "application/pdf";
  }
  if (normalized === "PNG") {
    return "image/png";
  }
  return "image/jpeg";
}

function normalizeStatus(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getAvailableTransitions(estado: string) {
  return transitionsByStatus[normalizeStatus(estado)] ?? [];
}

function isCreditoEditable(credito: Credito) {
  return !["finalizado", "rechazado"].includes(
    normalizeStatus(credito.estado).toLowerCase(),
  );
}

function isReadyToRefinance(opportunity: Opportunity | null) {
  return (
    opportunity?.estado_refinanciacion === "Listo" &&
    !["rechazado", "convertido"].includes(opportunity.estado_comercial)
  );
}

function formatFinalizationReason(value: string | null) {
  const labels: Record<string, string> = {
    PAGO_NORMAL: "Pago normal",
    REFINANCIADO: "Refinanciado",
    AJUSTE_MIGRACION: "Ajuste migracion",
    ANULADO: "Anulado",
    OTRO: "Otro",
  };

  return value ? labels[value] ?? value : "Sin motivo registrado";
}

function addMonthsToIsoDate(value: string, months: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  if (date.getUTCDate() !== day) {
    date.setUTCDate(0);
  }
  return date.toISOString().slice(0, 10);
}

function toApiStatus(estado: string) {
  if (estado === "Devuelto por correccion") {
    return "Devuelto por corrección";
  }

  return estado;
}

function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
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

function OfficeBadge({ oficina }: { oficina?: Oficina }) {
  const color = oficina?.color ?? "stone";
  const classes = {
    blue: "border-blue-700/20 bg-blue-50 text-blue-800",
    red: "border-red-500/20 bg-red-50 text-red-700",
    teal: "border-teal-700/20 bg-teal-50 text-teal-800",
    amber: "border-amber-700/20 bg-amber-50 text-amber-800",
    stone: "border-stone-800/10 bg-stone-100 text-stone-700",
  }[color] ?? "border-stone-800/10 bg-stone-100 text-stone-700";
  return (
    <span className={["inline-flex w-fit items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold", classes].join(" ")}>
      {oficina?.nombre ?? "Sin oficina"}
    </span>
  );
}
