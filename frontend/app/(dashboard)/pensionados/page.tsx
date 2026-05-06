"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError, apiFetch } from "@/lib/api";
import { readSession, readSessionUserId } from "@/lib/session";

type Pensionado = {
  id: number;
  nombre: string;
  documento: string;
  fecha_nacimiento: string;
  telefono: string;
  celular: string | null;
  direccion: string;
  fecha_inicio_pension: string;
  is_active: boolean;
};

type Credito = {
  id: number;
  pensionado_id: number;
  asesor_id: number;
  cooperativa_id: number;
  oficina_id: number;
  pagaduria_id: number;
  nro_libranza: string | null;
  tipo_credito: string | null;
  monto_solicitado: number;
  monto_aprobado: number | null;
  plazo: number;
  estado: string;
  tasa_mensual?: number | null;
  valor_cuota?: number | null;
  fecha_desembolso?: string | null;
  fecha_fin_estimada?: string | null;
  nro_afiliacion: string | null;
  observaciones: string | null;
  tiene_documentos_pendientes?: boolean;
  documentos_pendientes?: string | null;
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

type Refinanciacion = {
  id: number;
  credito_id: number;
  obligacion_externa: string | null;
  entidad: string | null;
  valor_refinanciacion: number | null;
  valor_cuota_recoge: number | null;
  cuotas_recoge: number | null;
  nro_cuotas_anterior: number | null;
  created_at: string;
};

type CatalogItem = {
  id: number;
  nombre: string;
  is_active?: boolean;
};

type HistorialItem = {
  id: number;
  usuario_nombre: string | null;
  estado_anterior: string | null;
  estado_nuevo: string;
  observacion: string | null;
  created_at: string;
};

type PensionadoFormState = {
  nombre: string;
  documento: string;
  fecha_nacimiento: string;
  telefono: string;
  celular: string;
  direccion: string;
  fecha_inicio_pension: string;
};

type CreditoFormState = {
  oficina_id: string;
  cooperativa_id: string;
  pagaduria_id: string;
  monto_solicitado: string;
  plazo: string;
  nro_libranza: string;
  tipo_credito: string;
  nro_afiliacion: string;
  observaciones: string;
};

type CreditoEditFormState = {
  cooperativa_id: string;
  pagaduria_id: string;
  monto_solicitado: string;
  plazo: string;
  nro_libranza: string;
  tipo_credito: string;
  nro_afiliacion: string;
  observaciones: string;
  tiene_documentos_pendientes: boolean;
  documentos_pendientes: string;
};

type CreditoEstadoFormState = {
  estado_nuevo: string;
  observaciones: string;
  monto_aprobado: string;
  tasa_mensual: string;
  valor_cuota: string;
  fecha_desembolso: string;
  fecha_fin_estimada: string;
};

const initialForm: PensionadoFormState = {
  nombre: "",
  documento: "",
  fecha_nacimiento: "",
  telefono: "",
  celular: "",
  direccion: "",
  fecha_inicio_pension: "",
};

const initialCreditoForm: CreditoFormState = {
  oficina_id: "",
  cooperativa_id: "",
  pagaduria_id: "",
  monto_solicitado: "",
  plazo: "",
  nro_libranza: "",
  tipo_credito: "",
  nro_afiliacion: "",
  observaciones: "",
};

const initialCreditoEditForm: CreditoEditFormState = {
  cooperativa_id: "",
  pagaduria_id: "",
  monto_solicitado: "",
  plazo: "",
  nro_libranza: "",
  tipo_credito: "",
  nro_afiliacion: "",
  observaciones: "",
  tiene_documentos_pendientes: false,
  documentos_pendientes: "",
};

const initialCreditoEstadoForm: CreditoEstadoFormState = {
  estado_nuevo: "",
  observaciones: "",
  monto_aprobado: "",
  tasa_mensual: "",
  valor_cuota: "",
  fecha_desembolso: "",
  fecha_fin_estimada: "",
};

const estadoTransitions: Record<string, string[]> = {
  Prospecto: ["Enviado a cooperativa"],
  "Enviado a cooperativa": ["Devuelto por corrección", "Aprobado", "Rechazado"],
  "Devuelto por corrección": ["Reenviado"],
  Reenviado: ["Devuelto por corrección", "Aprobado", "Rechazado"],
  Aprobado: [],
  Rechazado: [],
};
const ESTADOS_EDITABLES = new Set(["Prospecto", "Devuelto por corrección"]);

const PAGE_SIZE = 5;

function sortPensionados(items: Pensionado[]) {
  return [...items].sort((left, right) => {
    if (left.is_active !== right.is_active) {
      return left.is_active ? -1 : 1;
    }
    return right.id - left.id;
  });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCurrency(value: number | null) {
  if (value === null) {
    return "Sin valor";
  }

  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function PensionadosPage() {
  const router = useRouter();
  const session = readSession();
  const isAdmin = session?.rol === "administrador";
  const [items, setItems] = useState<Pensionado[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedCreditoId, setSelectedCreditoId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<PensionadoFormState>(initialForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingRelacionados, setLoadingRelacionados] = useState(false);
  const [loadingCreditoDetalle, setLoadingCreditoDetalle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [refinanciaciones, setRefinanciaciones] = useState<Refinanciacion[]>([]);
  const [historial, setHistorial] = useState<HistorialItem[]>([]);
  const [oficinas, setOficinas] = useState<CatalogItem[]>([]);
  const [cooperativas, setCooperativas] = useState<CatalogItem[]>([]);
  const [pagadurias, setPagadurias] = useState<CatalogItem[]>([]);
  const [showCreditoForm, setShowCreditoForm] = useState(false);
  const [savingCredito, setSavingCredito] = useState(false);
  const [creditoError, setCreditoError] = useState<string | null>(null);
  const [creditoForm, setCreditoForm] = useState<CreditoFormState>(initialCreditoForm);
  const [showCreditoEditForm, setShowCreditoEditForm] = useState(false);
  const [showCreditoEstadoForm, setShowCreditoEstadoForm] = useState(false);
  const [savingCreditoEdit, setSavingCreditoEdit] = useState(false);
  const [savingCreditoEstado, setSavingCreditoEstado] = useState(false);
  const [creditoEditError, setCreditoEditError] = useState<string | null>(null);
  const [creditoEstadoError, setCreditoEstadoError] = useState<string | null>(null);
  const [relacionadosError, setRelacionadosError] = useState<string | null>(null);
  const [detalleError, setDetalleError] = useState<string | null>(null);
  const [creditoEditForm, setCreditoEditForm] =
    useState<CreditoEditFormState>(initialCreditoEditForm);
  const [creditoEstadoForm, setCreditoEstadoForm] =
    useState<CreditoEstadoFormState>(initialCreditoEstadoForm);

  useEffect(() => {
    const session = readSession();
    if (!session) {
      router.replace("/login?message=Inicia sesion para consultar contactos");
    }
  }, [router]);

  async function loadPensionados() {
    setLoading(true);
    setError(null);

    try {
      const data = await apiFetch<Pensionado[]>("/api/v1/pensionados/");
      const ordered = sortPensionados(data);
      setItems(ordered);
      setSelectedId((current) => {
        if (current && ordered.some((item) => item.id === current)) {
          return current;
        }
        return ordered[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : "No se pudieron cargar los pensionados",
      );
      setItems([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPensionados();
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadCatalogosCredito() {
      try {
        const [oficinasData, cooperativasData, pagaduriasData] = await Promise.all([
          apiFetch<CatalogItem[]>("/api/v1/oficinas/"),
          apiFetch<CatalogItem[]>("/api/v1/cooperativas/"),
          apiFetch<CatalogItem[]>("/api/v1/pagadurias/"),
        ]);

        if (!ignore) {
          setOficinas(oficinasData);
          setCooperativas(cooperativasData);
          setPagadurias(pagaduriasData);
          setCreditoForm((current) => ({
            ...current,
            oficina_id: current.oficina_id || String(oficinasData[0]?.id ?? ""),
            cooperativa_id: current.cooperativa_id || String(cooperativasData[0]?.id ?? ""),
            pagaduria_id: current.pagaduria_id || String(pagaduriasData[0]?.id ?? ""),
          }));
        }
      } catch {
        if (!ignore) {
          setOficinas([]);
          setCooperativas([]);
          setPagadurias([]);
        }
      }
    }

    void loadCatalogosCredito();

    return () => {
      ignore = true;
    };
  }, []);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return items;
    }

    return items.filter((item) =>
      [item.nombre, item.documento, item.telefono, item.celular ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [items, query]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, page]);

  const selectedPensionado = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const selectedCredito = useMemo(
    () => creditos.find((credito) => credito.id === selectedCreditoId) ?? null,
    [creditos, selectedCreditoId],
  );
  const canEditSelectedCredito = selectedCredito
    ? ESTADOS_EDITABLES.has(selectedCredito.estado)
    : false;

  const pensionadoResumen = useMemo(() => {
    const activos = creditos.filter((credito) =>
      ["Prospecto", "Enviado a cooperativa", "Devuelto por corrección", "Reenviado", "Aprobado"].includes(
        credito.estado,
      ),
    ).length;

    return {
      totalCreditos: creditos.length,
      activos,
      documentosActivos: documentos.filter((documento) => documento.is_active).length,
      refinanciaciones: refinanciaciones.length,
    };
  }, [creditos, documentos, refinanciaciones]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    const pensionadoId = selectedPensionado?.id;

    if (!pensionadoId) {
      setCreditos([]);
      setSelectedCreditoId(null);
      return;
    }

    let ignore = false;

    async function loadRelacionados() {
      setLoadingRelacionados(true);
      setRelacionadosError(null);

      try {
        const data = await apiFetch<Credito[]>(`/api/v1/creditos/?pensionado_id=${pensionadoId}`);
        const ordered = [...data].sort((left, right) => right.id - left.id);

        if (!ignore) {
          setCreditos(ordered);
          setSelectedCreditoId((current) => {
            if (current && ordered.some((credito) => credito.id === current)) {
              return current;
            }
            return ordered[0]?.id ?? null;
          });
        }
      } catch {
        if (!ignore) {
          setCreditos([]);
          setSelectedCreditoId(null);
          setRelacionadosError("No se pudieron cargar los creditos del contacto.");
        }
      } finally {
        if (!ignore) {
          setLoadingRelacionados(false);
        }
      }
    }

    void loadRelacionados();

    return () => {
      ignore = true;
    };
  }, [selectedPensionado]);

  useEffect(() => {
    const creditoId = selectedCredito?.id;

    if (!creditoId) {
      setDocumentos([]);
      setHistorial([]);
      setRefinanciaciones([]);
      return;
    }

    let ignore = false;

    async function loadCreditoDetalle() {
      setLoadingCreditoDetalle(true);
      setDetalleError(null);

      try {
        const [documentosData, historialData, refinanciacionesData] = await Promise.all([
          apiFetch<Documento[]>(`/api/v1/documentos/?credito_id=${creditoId}&solo_activos=false`),
          apiFetch<HistorialItem[]>(`/api/v1/creditos/${creditoId}/historial`),
          apiFetch<Refinanciacion[]>(`/api/v1/refinanciaciones/?credito_id=${creditoId}`),
        ]);

        if (!ignore) {
          setDocumentos([...documentosData].sort((left, right) => right.id - left.id));
          setHistorial(historialData);
          setRefinanciaciones(
            [...refinanciacionesData].sort((left, right) => right.id - left.id),
          );
        }
      } catch {
        if (!ignore) {
          setDocumentos([]);
          setHistorial([]);
          setRefinanciaciones([]);
          setDetalleError("No se pudo cargar el detalle del credito seleccionado.");
        }
      } finally {
        if (!ignore) {
          setLoadingCreditoDetalle(false);
        }
      }
    }

    void loadCreditoDetalle();

    return () => {
      ignore = true;
    };
  }, [selectedCredito]);

  function resetForm() {
    setForm(initialForm);
    setEditingId(null);
    setShowForm(false);
  }

  function resetCreditoForm() {
    setCreditoForm({
      ...initialCreditoForm,
      oficina_id: String(oficinas[0]?.id ?? ""),
      cooperativa_id: String(cooperativas[0]?.id ?? ""),
      pagaduria_id: String(pagadurias[0]?.id ?? ""),
    });
    setShowCreditoForm(false);
    setCreditoError(null);
  }

  function resetCreditoEditForm() {
    setCreditoEditForm(initialCreditoEditForm);
    setShowCreditoEditForm(false);
    setCreditoEditError(null);
  }

  function resetCreditoEstadoForm() {
    setCreditoEstadoForm(initialCreditoEstadoForm);
    setShowCreditoEstadoForm(false);
    setCreditoEstadoError(null);
  }

  function startCreate() {
    setEditingId(null);
    setForm(initialForm);
    setShowForm(true);
    setError(null);
    setSuccess(null);
  }

  function startEdit(item: Pensionado) {
    setEditingId(item.id);
    setForm({
      nombre: item.nombre,
      documento: item.documento,
      fecha_nacimiento: item.fecha_nacimiento,
      telefono: item.telefono,
      celular: item.celular ?? "",
      direccion: item.direccion,
      fecha_inicio_pension: item.fecha_inicio_pension,
    });
    setShowForm(true);
    setError(null);
    setSuccess(null);
  }

  function startCreateCredito() {
    setShowCreditoForm(true);
    setCreditoError(null);
    setCreditoForm((current) => ({
      ...initialCreditoForm,
      oficina_id: current.oficina_id || String(oficinas[0]?.id ?? ""),
      cooperativa_id: current.cooperativa_id || String(cooperativas[0]?.id ?? ""),
      pagaduria_id: current.pagaduria_id || String(pagadurias[0]?.id ?? ""),
    }));
  }

  function startEditCredito() {
    if (!selectedCredito) {
      return;
    }

    setCreditoEditError(null);
    setShowCreditoEditForm(true);
    setCreditoEditForm({
      cooperativa_id: String(selectedCredito.cooperativa_id),
      pagaduria_id: String(selectedCredito.pagaduria_id),
      monto_solicitado: String(selectedCredito.monto_solicitado),
      plazo: String(selectedCredito.plazo),
      nro_libranza: selectedCredito.nro_libranza ?? "",
      tipo_credito: selectedCredito.tipo_credito ?? "",
      nro_afiliacion: selectedCredito.nro_afiliacion ?? "",
      observaciones: selectedCredito.observaciones ?? "",
      tiene_documentos_pendientes: selectedCredito.tiene_documentos_pendientes ?? false,
      documentos_pendientes: selectedCredito.documentos_pendientes ?? "",
    });
  }

  function startChangeCreditoEstado() {
    if (!selectedCredito) {
      return;
    }

    const nextOptions = estadoTransitions[selectedCredito.estado] ?? [];
    if (nextOptions.length === 0) {
      setCreditoEstadoError("Este credito ya esta en un estado final y no puede cambiar.");
      return;
    }

    setCreditoEstadoError(null);
    setShowCreditoEstadoForm(true);
    setCreditoEstadoForm({
      ...initialCreditoEstadoForm,
      estado_nuevo: nextOptions[0],
      observaciones: "",
      monto_aprobado: selectedCredito.monto_aprobado ? String(selectedCredito.monto_aprobado) : "",
      tasa_mensual: selectedCredito.tasa_mensual ? String(selectedCredito.tasa_mensual) : "",
      valor_cuota: selectedCredito.valor_cuota ? String(selectedCredito.valor_cuota) : "",
      fecha_desembolso: selectedCredito.fecha_desembolso ?? "",
      fecha_fin_estimada: selectedCredito.fecha_fin_estimada ?? "",
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (editingId) {
        const updated = await apiFetch<Pensionado>(`/api/v1/pensionados/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            nombre: form.nombre,
            telefono: form.telefono,
            celular: form.celular || null,
            direccion: form.direccion,
          }),
        });

        setItems((current) =>
          sortPensionados(current.map((item) => (item.id === updated.id ? updated : item))),
        );
        setSelectedId(updated.id);
        setSuccess("Contacto actualizado correctamente.");
      } else {
        const created = await apiFetch<Pensionado>("/api/v1/pensionados/", {
          method: "POST",
          body: JSON.stringify({
            ...form,
            celular: form.celular || null,
          }),
        });

        setItems((current) => sortPensionados([created, ...current]));
        setSelectedId(created.id);
        setSuccess("Contacto creado correctamente.");
      }

      resetForm();
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : "No se pudo guardar el contacto",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: Pensionado) {
    const confirmed = window.confirm(
      `Vas a desactivar a ${item.nombre}. Esta accion no elimina fisicamente el registro. Deseas continuar?`,
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      const deleted = await apiFetch<Pensionado>(`/api/v1/pensionados/${item.id}`, {
        method: "DELETE",
      });

      setItems((current) =>
        sortPensionados(
          current.map((currentItem) =>
            currentItem.id === deleted.id ? deleted : currentItem,
          ),
        ),
      );
      setSelectedId(deleted.id);
      setSuccess("Contacto desactivado correctamente.");
    } catch (deleteError) {
      setError(
        deleteError instanceof ApiError
          ? deleteError.message
          : "No se pudo desactivar el contacto",
      );
    }
  }

  async function handleCreateCredito(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPensionado) {
      return;
    }

    setSavingCredito(true);
    setCreditoError(null);
    setError(null);
    setSuccess(null);

    try {
      const asesorId = readSessionUserId();
      if (!asesorId) {
        throw new Error("No se pudo identificar el usuario actual");
      }

      const created = await apiFetch<Credito>("/api/v1/creditos/", {
        method: "POST",
        body: JSON.stringify({
          pensionado_id: selectedPensionado.id,
          asesor_id: asesorId,
          oficina_id: Number(creditoForm.oficina_id),
          cooperativa_id: Number(creditoForm.cooperativa_id),
          pagaduria_id: Number(creditoForm.pagaduria_id),
          monto_solicitado: Number(creditoForm.monto_solicitado),
          plazo: Number(creditoForm.plazo),
          nro_libranza: creditoForm.nro_libranza || null,
          tipo_credito: creditoForm.tipo_credito || null,
          nro_afiliacion: creditoForm.nro_afiliacion || null,
          observaciones: creditoForm.observaciones || null,
        }),
      });

      setCreditos((current) => [created, ...current].sort((left, right) => right.id - left.id));
      setSelectedCreditoId(created.id);
      setSuccess("Credito creado correctamente desde la ficha del contacto.");
      resetCreditoForm();
    } catch (submitError) {
      setCreditoError(
        submitError instanceof ApiError
          ? submitError.message
          : submitError instanceof Error
            ? submitError.message
            : "No se pudo crear el credito",
      );
    } finally {
      setSavingCredito(false);
    }
  }

  async function handleUpdateCredito(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCredito) {
      return;
    }

    setSavingCreditoEdit(true);
    setCreditoEditError(null);
    setError(null);
    setSuccess(null);

    try {
      const updated = await apiFetch<Credito>(`/api/v1/creditos/${selectedCredito.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          cooperativa_id: Number(creditoEditForm.cooperativa_id),
          pagaduria_id: Number(creditoEditForm.pagaduria_id),
          monto_solicitado: Number(creditoEditForm.monto_solicitado),
          plazo: Number(creditoEditForm.plazo),
          nro_libranza: creditoEditForm.nro_libranza || null,
          tipo_credito: creditoEditForm.tipo_credito || null,
          nro_afiliacion: creditoEditForm.nro_afiliacion || null,
          observaciones: creditoEditForm.observaciones || null,
          tiene_documentos_pendientes: creditoEditForm.tiene_documentos_pendientes,
          documentos_pendientes: creditoEditForm.tiene_documentos_pendientes
            ? creditoEditForm.documentos_pendientes || null
            : null,
        }),
      });

      setCreditos((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)).sort((a, b) => b.id - a.id),
      );
      setSelectedCreditoId(updated.id);
      setSuccess("Credito actualizado correctamente.");
      resetCreditoEditForm();
    } catch (submitError) {
      setCreditoEditError(
        submitError instanceof ApiError
          ? submitError.message
          : "No se pudo actualizar el credito",
      );
    } finally {
      setSavingCreditoEdit(false);
    }
  }

  async function handleChangeCreditoEstado(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCredito) {
      return;
    }

    setSavingCreditoEstado(true);
    setCreditoEstadoError(null);
    setError(null);
    setSuccess(null);

    try {
      const isAprobado = creditoEstadoForm.estado_nuevo === "Aprobado";
      const updated = await apiFetch<Credito>(
        `/api/v1/creditos/${selectedCredito.id}/estado`,
        {
          method: "PATCH",
          body: JSON.stringify({
            estado_nuevo: creditoEstadoForm.estado_nuevo,
            observaciones: creditoEstadoForm.observaciones || null,
            monto_aprobado: isAprobado && creditoEstadoForm.monto_aprobado
              ? Number(creditoEstadoForm.monto_aprobado)
              : null,
            tasa_mensual: isAprobado && creditoEstadoForm.tasa_mensual
              ? Number(creditoEstadoForm.tasa_mensual)
              : null,
            valor_cuota: isAprobado && creditoEstadoForm.valor_cuota
              ? Number(creditoEstadoForm.valor_cuota)
              : null,
            fecha_desembolso: isAprobado && creditoEstadoForm.fecha_desembolso
              ? creditoEstadoForm.fecha_desembolso
              : null,
            fecha_fin_estimada: isAprobado && creditoEstadoForm.fecha_fin_estimada
              ? creditoEstadoForm.fecha_fin_estimada
              : null,
          }),
        },
      );

      setCreditos((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)).sort((a, b) => b.id - a.id),
      );
      setSelectedCreditoId(updated.id);
      setSuccess("Estado del credito actualizado correctamente.");
      resetCreditoEstadoForm();
    } catch (submitError) {
      setCreditoEstadoError(
        submitError instanceof ApiError
          ? submitError.message
          : "No se pudo cambiar el estado del credito",
      );
    } finally {
      setSavingCreditoEstado(false);
    }
  }

  async function handleCopyDocumentoUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setSuccess("Ruta del documento copiada al portapapeles.");
    } catch {
      setError("No se pudo copiar la ruta del documento.");
    }
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <article className="glass-panel p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-stone-500">
            CRM operativo
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
            Contactos y su vida crediticia
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-600">
            Esta vista deja de tratar al pensionado como un registro aislado. Aqui
            ves la persona, sus creditos, sus documentos, sus refinanciaciones y
            la traza de gestion sin armar rompecabezas entre modulos.
          </p>
        </article>

        <article className="glass-panel p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
            Acciones
          </p>
          <div className="mt-4 grid gap-3">
            <button type="button" className="button-primary" onClick={startCreate}>
              Nuevo contacto
            </button>
            {selectedPensionado ? (
              <button
                type="button"
                className="button-muted"
                onClick={() => startEdit(selectedPensionado)}
              >
                Editar contacto seleccionado
              </button>
            ) : null}
          </div>
        </article>
      </div>

      {success ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <article className="glass-panel overflow-hidden">
          <div className="border-b border-stone-800/10 px-5 py-5">
            <div className="flex flex-col gap-3">
              <div>
                <h2 className="text-xl font-semibold text-stone-950">Contactos</h2>
                <p className="mt-1 text-sm text-stone-500">
                  Busca por nombre, documento o telefono.
                </p>
              </div>
              <input
                className="input-base"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar contacto..."
              />
            </div>
          </div>

          <div className="space-y-3 p-4">
            {loading ? (
              <EmptyState text="Cargando contactos..." />
            ) : paginatedItems.length === 0 ? (
              <EmptyState text="No hay contactos para mostrar." />
            ) : (
              paginatedItems.map((item) => {
                const active = item.id === selectedId;

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
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] opacity-70">
                          {item.documento}
                        </p>
                        <h3 className="mt-2 text-xl font-semibold">{item.nombre}</h3>
                        <p className="mt-1 text-sm opacity-80">{item.telefono}</p>
                      </div>
                      <span
                        className={[
                          "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
                          item.is_active
                            ? active
                              ? "bg-white/15 text-white"
                              : "bg-emerald-100 text-emerald-700"
                            : active
                              ? "bg-white/15 text-white"
                              : "bg-stone-900/5 text-stone-500",
                        ].join(" ")}
                      >
                        {item.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-stone-800/10 px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-stone-500">
                Mostrando {paginatedItems.length} de {filteredItems.length} contactos.
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="button-muted px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={page === 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Anterior
                </button>
                <div className="rounded-xl border border-stone-800/10 bg-white/70 px-3 py-2 text-sm text-stone-700">
                  Pagina {page} de {totalPages}
                </div>
                <button
                  type="button"
                  className="button-muted px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={page === totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        </article>

        <div className="space-y-4">
          {!selectedPensionado ? (
            <article className="glass-panel p-8">
              <EmptyState text="Selecciona un contacto para ver su ficha completa." />
            </article>
          ) : (
            <>
              <article className="glass-panel p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
                      Ficha del contacto
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold text-stone-950">
                      {selectedPensionado.nombre}
                    </h2>
                    <p className="mt-2 text-sm text-stone-600">
                      Documento {selectedPensionado.documento} · Pension desde{" "}
                      {formatDate(selectedPensionado.fecha_inicio_pension)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="button-muted"
                      onClick={() => startEdit(selectedPensionado)}
                    >
                      Editar ficha
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:border-stone-800/10 disabled:bg-stone-100 disabled:text-stone-400"
                      disabled={!selectedPensionado.is_active || !isAdmin}
                      onClick={() => void handleDelete(selectedPensionado)}
                      title={isAdmin ? undefined : "Solo administradores pueden desactivar contactos"}
                    >
                      {!isAdmin
                        ? "Solo administrador"
                        : selectedPensionado.is_active
                          ? "Desactivar"
                          : "Contacto inactivo"}
                    </button>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-4">
                  <MetricCard label="Creditos" value={String(pensionadoResumen.totalCreditos)} />
                  <MetricCard label="Activos" value={String(pensionadoResumen.activos)} />
                  <MetricCard
                    label="Documentos"
                    value={String(pensionadoResumen.documentosActivos)}
                  />
                  <MetricCard
                    label="Refinanciaciones"
                    value={String(pensionadoResumen.refinanciaciones)}
                  />
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  <DetailRow label="Telefono" value={selectedPensionado.telefono} />
                  <DetailRow
                    label="Celular"
                    value={selectedPensionado.celular ?? "No registrado"}
                  />
                  <DetailRow
                    label="Fecha de nacimiento"
                    value={formatDate(selectedPensionado.fecha_nacimiento)}
                  />
                  <DetailRow label="Direccion" value={selectedPensionado.direccion} />
                </div>
              </article>

              <div className="grid gap-4 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <article className="glass-panel overflow-hidden">
                  <div className="border-b border-stone-800/10 px-6 py-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-xl font-semibold text-stone-950">
                          Creditos del contacto
                        </h3>
                        <p className="mt-1 text-sm text-stone-500">
                          Todo el historial crediticio de esta persona en un solo lugar.
                        </p>
                      </div>
                      {selectedPensionado.is_active ? (
                        <button
                          type="button"
                          className="button-primary"
                          onClick={startCreateCredito}
                        >
                          Nuevo credito
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-3 p-4">
                    {relacionadosError ? (
                      <div className="rounded-2xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {relacionadosError}
                      </div>
                    ) : null}
                    {loadingRelacionados ? (
                      <EmptyState text="Cargando creditos..." />
                    ) : creditos.length === 0 ? (
                      <EmptyState text="Este contacto aun no tiene creditos registrados." />
                    ) : (
                      creditos.map((credito) => {
                        const active = credito.id === selectedCreditoId;

                        return (
                          <button
                            key={credito.id}
                            type="button"
                            onClick={() => setSelectedCreditoId(credito.id)}
                            className={[
                              "w-full rounded-3xl border px-5 py-4 text-left transition",
                              active
                                ? "border-amber-500/20 bg-[#fff4cc] text-stone-950 shadow-lg shadow-amber-500/10"
                                : "border-stone-800/10 bg-white/65 hover:bg-white/90",
                            ].join(" ")}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                                  Credito #{credito.id}
                                </p>
                                <h4 className="mt-2 text-xl font-semibold">
                                  {formatCurrency(credito.monto_solicitado)}
                                </h4>
                              </div>
                              <span className="rounded-full bg-stone-900/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-700">
                                {credito.estado}
                              </span>
                            </div>

                            <div className="mt-4 grid gap-2 text-sm text-stone-600 sm:grid-cols-2">
                              <p>Plazo: {credito.plazo} meses</p>
                              <p>Creado: {formatDateTime(credito.created_at)}</p>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </article>

                <article className="glass-panel p-6">
                  <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
                    Mundo del credito
                  </p>

                  {!selectedCredito ? (
                    <EmptyState text="Selecciona un credito para ver documentos, historial y refinanciaciones." />
                  ) : (
                    <div className="mt-5 space-y-5">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="button-muted"
                          onClick={startEditCredito}
                          disabled={!canEditSelectedCredito}
                        >
                          {canEditSelectedCredito
                            ? "Editar credito"
                            : "Credito no editable en este estado"}
                        </button>
                        <button
                          type="button"
                          className="button-primary"
                          onClick={startChangeCreditoEstado}
                        >
                          Cambiar estado
                        </button>
                      </div>

                      {creditoEstadoError ? (
                        <div className="rounded-2xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-700">
                          {creditoEstadoError}
                        </div>
                      ) : null}
                      {detalleError ? (
                        <div className="rounded-2xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-700">
                          {detalleError}
                        </div>
                      ) : null}

                      <div className="grid gap-3 md:grid-cols-2">
                        <DetailRow label="Estado" value={selectedCredito.estado} />
                        <DetailRow
                          label="Monto solicitado"
                          value={formatCurrency(selectedCredito.monto_solicitado)}
                        />
                        <DetailRow
                          label="Monto aprobado"
                          value={formatCurrency(selectedCredito.monto_aprobado)}
                        />
                        <DetailRow
                          label="Observaciones"
                          value={selectedCredito.observaciones ?? "Sin observaciones"}
                        />
                        <DetailRow
                          label="Documentos pendientes"
                          value={
                            selectedCredito.tiene_documentos_pendientes
                              ? selectedCredito.documentos_pendientes ?? "Pendientes sin detalle"
                              : "No"
                          }
                        />
                      </div>

                      <section className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="text-lg font-semibold text-stone-950">
                            Documentos del credito
                          </h4>
                          {loadingCreditoDetalle ? (
                            <span className="text-sm text-stone-500">Actualizando...</span>
                          ) : null}
                        </div>

                        {documentos.length === 0 ? (
                          <EmptyState text="Este credito no tiene documentos registrados aun." />
                        ) : (
                          <div className="space-y-3">
                            {documentos.map((documento) => (
                              <div
                                key={documento.id}
                                className="rounded-2xl border border-stone-800/10 bg-white/65 px-4 py-4"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-xs uppercase tracking-[0.22em] text-stone-500">
                                      {documento.tipo} · v{documento.version}
                                    </p>
                                    <p className="mt-2 text-sm font-semibold text-stone-900">
                                      {documento.nombre}
                                    </p>
                                  </div>
                                  <span
                                    className={[
                                      "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
                                      documento.is_active
                                        ? "bg-emerald-100 text-emerald-700"
                                        : "bg-stone-900/5 text-stone-500",
                                    ].join(" ")}
                                  >
                                    {documento.is_active ? "Activo" : "Historico"}
                                  </span>
                                </div>
                                <div className="mt-3 flex justify-end">
                                  <button
                                    type="button"
                                    className="button-muted px-3 py-2 text-xs"
                                    onClick={() => void handleCopyDocumentoUrl(documento.url)}
                                  >
                                    Copiar ruta
                                  </button>
                                </div>
                                <p className="mt-3 break-all text-xs text-stone-500">
                                  {documento.url}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>

                      <section className="grid gap-4 xl:grid-cols-2">
                        <div className="space-y-3">
                          <h4 className="text-lg font-semibold text-stone-950">
                            Historial del credito
                          </h4>
                          {historial.length === 0 ? (
                            <EmptyState text="Sin historial visible." />
                          ) : (
                            historial.map((item) => (
                              <div
                                key={item.id}
                                className="rounded-2xl border border-stone-800/10 bg-white/65 px-4 py-4"
                              >
                                <p className="text-xs uppercase tracking-[0.22em] text-stone-500">
                                  {item.estado_anterior ?? "Inicio"} {" -> "} {item.estado_nuevo}
                                </p>
                                <p className="mt-2 text-sm font-semibold text-stone-900">
                                  {item.usuario_nombre ?? "Usuario desconocido"}
                                </p>
                                <p className="mt-2 text-sm text-stone-600">
                                  {item.observacion ?? "Sin observacion registrada"}
                                </p>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="space-y-3">
                          <h4 className="text-lg font-semibold text-stone-950">
                            Refinanciaciones
                          </h4>
                          {refinanciaciones.length === 0 ? (
                            <EmptyState text="Sin refinanciaciones asociadas." />
                          ) : (
                            refinanciaciones.map((item) => (
                              <div
                                key={item.id}
                                className="rounded-2xl border border-stone-800/10 bg-white/65 px-4 py-4"
                              >
                                <p className="text-xs uppercase tracking-[0.22em] text-stone-500">
                                  Refinanciacion #{item.id}
                                </p>
                                <p className="mt-2 text-sm font-semibold text-stone-900">
                                  {item.entidad ?? "Entidad no registrada"}
                                </p>
                                <p className="mt-2 text-sm text-stone-600">
                                  {formatCurrency(item.valor_refinanciacion)}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      </section>
                    </div>
                  )}
                </article>
              </div>
            </>
          )}
        </div>
      </div>

      {showForm ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm">
          <div className="glass-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
                  {editingId ? "Edicion" : "Creacion"}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-950">
                  {editingId ? "Editar contacto" : "Nuevo contacto"}
                </h2>
                <p className="mt-2 text-sm text-stone-600">
                  {editingId
                    ? "Estas modificando la ficha principal del pensionado."
                    : "Registra un nuevo contacto para iniciar su mundo dentro del CRM."}
                </p>
              </div>
              <button type="button" className="button-muted" onClick={resetForm}>
                Cerrar
              </button>
            </div>

            <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
              <div className="grid gap-3 sm:grid-cols-2">
                <InputField
                  label="Nombre completo"
                  value={form.nombre}
                  onChange={(value) => setForm((current) => ({ ...current, nombre: value }))}
                  placeholder="Nombre del pensionado"
                />
                <InputField
                  label="Documento"
                  value={form.documento}
                  onChange={(value) =>
                    setForm((current) => ({ ...current, documento: value }))
                  }
                  placeholder="Numero de identificacion"
                  disabled={Boolean(editingId)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <InputField
                  label="Fecha de nacimiento"
                  type="date"
                  value={form.fecha_nacimiento}
                  onChange={(value) =>
                    setForm((current) => ({ ...current, fecha_nacimiento: value }))
                  }
                  disabled={Boolean(editingId)}
                />
                <InputField
                  label="Fecha inicio pension"
                  type="date"
                  value={form.fecha_inicio_pension}
                  onChange={(value) =>
                    setForm((current) => ({ ...current, fecha_inicio_pension: value }))
                  }
                  disabled={Boolean(editingId)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <InputField
                  label="Telefono"
                  value={form.telefono}
                  onChange={(value) =>
                    setForm((current) => ({ ...current, telefono: value }))
                  }
                  placeholder="Telefono principal"
                />
                <InputField
                  label="Celular"
                  value={form.celular}
                  onChange={(value) =>
                    setForm((current) => ({ ...current, celular: value }))
                  }
                  placeholder="Celular opcional"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-stone-700">
                  Direccion
                </label>
                <textarea
                  className="input-base min-h-[110px] resize-none"
                  value={form.direccion}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, direccion: event.target.value }))
                  }
                  placeholder="Direccion de residencia"
                />
              </div>

              <button type="submit" className="button-primary w-full" disabled={saving}>
                {saving
                  ? "Guardando..."
                  : editingId
                    ? "Actualizar contacto"
                    : "Crear contacto"}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {showCreditoForm && selectedPensionado ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm">
          <div className="glass-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
                  Nuevo credito
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-950">
                  Crear credito para {selectedPensionado.nombre}
                </h2>
                <p className="mt-2 text-sm text-stone-600">
                  El pensionado ya viene precargado. Aqui solo completas el contexto
                  comercial y financiero del nuevo credito.
                </p>
              </div>
              <button type="button" className="button-muted" onClick={resetCreditoForm}>
                Cerrar
              </button>
            </div>

            <form className="mt-6 space-y-3" onSubmit={handleCreateCredito}>
              <div className="rounded-2xl border border-stone-800/10 bg-white/70 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.22em] text-stone-500">
                  Pensionado seleccionado
                </p>
                <p className="mt-2 text-base font-semibold text-stone-950">
                  {selectedPensionado.nombre}
                </p>
                <p className="mt-1 text-sm text-stone-600">
                  Documento {selectedPensionado.documento}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <SelectField
                  label="Oficina"
                  value={creditoForm.oficina_id}
                  onChange={(value) =>
                    setCreditoForm((current) => ({ ...current, oficina_id: value }))
                  }
                  options={oficinas.map((item) => ({
                    value: String(item.id),
                    label: item.nombre,
                  }))}
                />
                <SelectField
                  label="Cooperativa"
                  value={creditoForm.cooperativa_id}
                  onChange={(value) =>
                    setCreditoForm((current) => ({ ...current, cooperativa_id: value }))
                  }
                  options={cooperativas.map((item) => ({
                    value: String(item.id),
                    label: item.nombre,
                  }))}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <SelectField
                  label="Pagaduria"
                  value={creditoForm.pagaduria_id}
                  onChange={(value) =>
                    setCreditoForm((current) => ({ ...current, pagaduria_id: value }))
                  }
                  options={pagadurias.map((item) => ({
                    value: String(item.id),
                    label: item.nombre,
                  }))}
                />
                <InputField
                  label="Plazo (meses)"
                  type="number"
                  value={creditoForm.plazo}
                  onChange={(value) =>
                    setCreditoForm((current) => ({ ...current, plazo: value }))
                  }
                  placeholder="24"
                />
              </div>

              <InputField
                label="Monto solicitado"
                type="number"
                value={creditoForm.monto_solicitado}
                onChange={(value) =>
                  setCreditoForm((current) => ({ ...current, monto_solicitado: value }))
                }
                placeholder="5000000"
              />

              <div className="grid gap-3 md:grid-cols-3">
                <InputField
                  label="Nro. libranza"
                  value={creditoForm.nro_libranza}
                  onChange={(value) =>
                    setCreditoForm((current) => ({ ...current, nro_libranza: value }))
                  }
                  placeholder="Opcional"
                />
                <InputField
                  label="Tipo credito"
                  value={creditoForm.tipo_credito}
                  onChange={(value) =>
                    setCreditoForm((current) => ({ ...current, tipo_credito: value }))
                  }
                  placeholder="Libre inversion"
                />
                <InputField
                  label="Nro. afiliacion"
                  value={creditoForm.nro_afiliacion}
                  onChange={(value) =>
                    setCreditoForm((current) => ({ ...current, nro_afiliacion: value }))
                  }
                  placeholder="Opcional"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-stone-700">
                  Observaciones
                </label>
                <textarea
                  className="input-base min-h-[110px] resize-none"
                  value={creditoForm.observaciones}
                  onChange={(event) =>
                    setCreditoForm((current) => ({
                      ...current,
                      observaciones: event.target.value,
                    }))
                  }
                  placeholder="Contexto comercial o detalle del caso"
                />
              </div>

              {creditoError ? (
                <div className="rounded-2xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {creditoError}
                </div>
              ) : null}

              <button type="submit" className="button-primary w-full" disabled={savingCredito}>
                {savingCredito ? "Creando..." : "Crear credito"}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {showCreditoEditForm && selectedCredito ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm">
          <div className="glass-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
                  Edicion de credito
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-950">
                  Editar credito #{selectedCredito.id}
                </h2>
              </div>
              <button type="button" className="button-muted" onClick={resetCreditoEditForm}>
                Cerrar
              </button>
            </div>

            <form className="mt-6 space-y-3" onSubmit={handleUpdateCredito}>
              <div className="grid gap-3 md:grid-cols-2">
                <SelectField
                  label="Cooperativa"
                  value={creditoEditForm.cooperativa_id}
                  onChange={(value) =>
                    setCreditoEditForm((current) => ({ ...current, cooperativa_id: value }))
                  }
                  options={cooperativas.map((item) => ({
                    value: String(item.id),
                    label: item.nombre,
                  }))}
                />
                <SelectField
                  label="Pagaduria"
                  value={creditoEditForm.pagaduria_id}
                  onChange={(value) =>
                    setCreditoEditForm((current) => ({ ...current, pagaduria_id: value }))
                  }
                  options={pagadurias.map((item) => ({
                    value: String(item.id),
                    label: item.nombre,
                  }))}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <InputField
                  label="Monto solicitado"
                  type="number"
                  value={creditoEditForm.monto_solicitado}
                  onChange={(value) =>
                    setCreditoEditForm((current) => ({ ...current, monto_solicitado: value }))
                  }
                />
                <InputField
                  label="Plazo (meses)"
                  type="number"
                  value={creditoEditForm.plazo}
                  onChange={(value) =>
                    setCreditoEditForm((current) => ({ ...current, plazo: value }))
                  }
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <InputField
                  label="Nro. libranza"
                  value={creditoEditForm.nro_libranza}
                  onChange={(value) =>
                    setCreditoEditForm((current) => ({ ...current, nro_libranza: value }))
                  }
                />
                <InputField
                  label="Tipo credito"
                  value={creditoEditForm.tipo_credito}
                  onChange={(value) =>
                    setCreditoEditForm((current) => ({ ...current, tipo_credito: value }))
                  }
                />
                <InputField
                  label="Nro. afiliacion"
                  value={creditoEditForm.nro_afiliacion}
                  onChange={(value) =>
                    setCreditoEditForm((current) => ({ ...current, nro_afiliacion: value }))
                  }
                />
              </div>

              <label className="flex items-center gap-3 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={creditoEditForm.tiene_documentos_pendientes}
                  onChange={(event) =>
                    setCreditoEditForm((current) => ({
                      ...current,
                      tiene_documentos_pendientes: event.target.checked,
                      documentos_pendientes: event.target.checked ? current.documentos_pendientes : "",
                    }))
                  }
                />
                Tiene documentos pendientes
              </label>

              {creditoEditForm.tiene_documentos_pendientes ? (
                <div>
                  <label className="mb-2 block text-sm font-medium text-stone-700">
                    Cuales documentos faltan
                  </label>
                  <textarea
                    className="input-base min-h-[110px] resize-none"
                    value={creditoEditForm.documentos_pendientes}
                    onChange={(event) =>
                      setCreditoEditForm((current) => ({
                        ...current,
                        documentos_pendientes: event.target.value,
                      }))
                    }
                    placeholder="Ej: Cedula ampliada, desprendible de pago, certificado bancario"
                  />
                </div>
              ) : null}

              <div>
                <label className="mb-2 block text-sm font-medium text-stone-700">
                  Observaciones
                </label>
                <textarea
                  className="input-base min-h-[110px] resize-none"
                  value={creditoEditForm.observaciones}
                  onChange={(event) =>
                    setCreditoEditForm((current) => ({
                      ...current,
                      observaciones: event.target.value,
                    }))
                  }
                />
              </div>

              {creditoEditError ? (
                <div className="rounded-2xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {creditoEditError}
                </div>
              ) : null}

              <button type="submit" className="button-primary w-full" disabled={savingCreditoEdit}>
                {savingCreditoEdit ? "Actualizando..." : "Actualizar credito"}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {showCreditoEstadoForm && selectedCredito ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm">
          <div className="glass-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
                  Cambio de estado
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-950">
                  Credito #{selectedCredito.id}
                </h2>
                <p className="mt-2 text-sm text-stone-600">
                  Estado actual: {selectedCredito.estado}
                </p>
              </div>
              <button type="button" className="button-muted" onClick={resetCreditoEstadoForm}>
                Cerrar
              </button>
            </div>

            <form className="mt-6 space-y-3" onSubmit={handleChangeCreditoEstado}>
              <SelectField
                label="Nuevo estado"
                value={creditoEstadoForm.estado_nuevo}
                onChange={(value) =>
                  setCreditoEstadoForm((current) => ({ ...current, estado_nuevo: value }))
                }
                options={(estadoTransitions[selectedCredito.estado] ?? []).map((option) => ({
                  value: option,
                  label: option,
                }))}
              />

              <div>
                <label className="mb-2 block text-sm font-medium text-stone-700">
                  Observacion del cambio
                </label>
                <textarea
                  className="input-base min-h-[110px] resize-none"
                  value={creditoEstadoForm.observaciones}
                  onChange={(event) =>
                    setCreditoEstadoForm((current) => ({
                      ...current,
                      observaciones: event.target.value,
                    }))
                  }
                />
              </div>

              {creditoEstadoForm.estado_nuevo === "Aprobado" ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <InputField
                      label="Monto aprobado"
                      type="number"
                      value={creditoEstadoForm.monto_aprobado}
                      onChange={(value) =>
                        setCreditoEstadoForm((current) => ({ ...current, monto_aprobado: value }))
                      }
                    />
                    <InputField
                      label="Tasa mensual"
                      type="number"
                      value={creditoEstadoForm.tasa_mensual}
                      onChange={(value) =>
                        setCreditoEstadoForm((current) => ({ ...current, tasa_mensual: value }))
                      }
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <InputField
                      label="Valor cuota"
                      type="number"
                      value={creditoEstadoForm.valor_cuota}
                      onChange={(value) =>
                        setCreditoEstadoForm((current) => ({ ...current, valor_cuota: value }))
                      }
                    />
                    <InputField
                      label="Fecha desembolso"
                      type="date"
                      value={creditoEstadoForm.fecha_desembolso}
                      onChange={(value) =>
                        setCreditoEstadoForm((current) => ({
                          ...current,
                          fecha_desembolso: value,
                        }))
                      }
                    />
                  </div>
                  <InputField
                    label="Fecha fin estimada"
                    type="date"
                    value={creditoEstadoForm.fecha_fin_estimada}
                    onChange={(value) =>
                      setCreditoEstadoForm((current) => ({
                        ...current,
                        fecha_fin_estimada: value,
                      }))
                    }
                  />
                </>
              ) : null}

              {creditoEstadoError ? (
                <div className="rounded-2xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {creditoEstadoError}
                </div>
              ) : null}

              <button type="submit" className="button-primary w-full" disabled={savingCreditoEstado}>
                {savingCreditoEstado ? "Actualizando..." : "Cambiar estado"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
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
  placeholder,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-stone-700">{label}</label>
      <input
        className="input-base disabled:cursor-not-allowed disabled:bg-stone-100"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
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
