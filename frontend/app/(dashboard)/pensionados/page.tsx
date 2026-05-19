"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
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
  oficina_id: number;
  cooperativa_id: number;
  pagaduria_id: number;
  monto_solicitado: number;
  monto_aprobado: number | null;
  plazo: number;
  estado: string;
  observaciones: string | null;
  tiene_documentos_pendientes: boolean;
  documentos_pendientes: string | null;
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

type Seguimiento = {
  id: number;
  pensionado_id: number;
  pensionado_nombre: string | null;
  pensionado_documento: string | null;
  oficina_id: number;
  oficina_nombre: string | null;
  usuario_nombre: string | null;
  tipo: string;
  comentario: string;
  resultado: string | null;
  fecha_proximo_contacto: string | null;
  created_at: string;
};

type CatalogItem = {
  id: number;
  nombre: string;
  is_active?: boolean;
};

type PensionadoForm = {
  nombre: string;
  documento: string;
  fecha_nacimiento: string;
  telefono: string;
  celular: string;
  direccion: string;
  fecha_inicio_pension: string;
};

type CreditoForm = {
  oficina_id: string;
  cooperativa_id: string;
  pagaduria_id: string;
  monto_solicitado: string;
  plazo: string;
  observaciones: string;
  tiene_documentos_pendientes: boolean;
  documentos_pendientes: string;
};

type SeguimientoForm = {
  oficina_id: string;
  tipo: string;
  comentario: string;
  resultado: string;
  fecha_proximo_contacto: string;
};

type EstadoForm = {
  estado_nuevo: string;
  observaciones: string;
  monto_aprobado: string;
};

const initialPensionadoForm: PensionadoForm = {
  nombre: "",
  documento: "",
  fecha_nacimiento: "",
  telefono: "",
  celular: "",
  direccion: "",
  fecha_inicio_pension: "",
};

const initialCreditoForm: CreditoForm = {
  oficina_id: "",
  cooperativa_id: "",
  pagaduria_id: "",
  monto_solicitado: "",
  plazo: "",
  observaciones: "",
  tiene_documentos_pendientes: false,
  documentos_pendientes: "",
};

const initialEstadoForm: EstadoForm = {
  estado_nuevo: "",
  observaciones: "",
  monto_aprobado: "",
};

const tiposSeguimiento = [
  "cotizacion",
  "llamada",
  "whatsapp",
  "visita",
  "documentos",
  "objecion",
  "seguimiento",
  "cierre_perdido",
];

const transiciones: Record<string, string[]> = {
  Prospecto: ["Enviado a cooperativa"],
  "Enviado a cooperativa": ["Devuelto por corrección", "Aprobado", "Rechazado"],
  "Devuelto por corrección": ["Reenviado"],
  Reenviado: ["Devuelto por corrección", "Aprobado", "Rechazado"],
};

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

function formatDate(value: string | null) {
  if (!value) {
    return "Sin fecha";
  }
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Sin fecha";
  }
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function normalizeText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export default function PensionadosPage() {
  const router = useRouter();
  const session = readSession();
  const isAdmin = session?.rol === "administrador";
  const userId = readSessionUserId();
  const [pensionados, setPensionados] = useState<Pensionado[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedCreditoId, setSelectedCreditoId] = useState<number | null>(null);
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [oficinas, setOficinas] = useState<CatalogItem[]>([]);
  const [cooperativas, setCooperativas] = useState<CatalogItem[]>([]);
  const [pagadurias, setPagadurias] = useState<CatalogItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingFicha, setLoadingFicha] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNewContact, setShowNewContact] = useState(false);
  const [showNewCredito, setShowNewCredito] = useState(false);
  const [showNewSeguimiento, setShowNewSeguimiento] = useState(false);
  const [showEstadoForm, setShowEstadoForm] = useState(false);
  const [pensionadoForm, setPensionadoForm] =
    useState<PensionadoForm>(initialPensionadoForm);
  const [creditoForm, setCreditoForm] = useState<CreditoForm>(initialCreditoForm);
  const [seguimientoForm, setSeguimientoForm] = useState<SeguimientoForm>({
    oficina_id: "",
    tipo: "seguimiento",
    comentario: "",
    resultado: "",
    fecha_proximo_contacto: "",
  });
  const [estadoForm, setEstadoForm] = useState<EstadoForm>(initialEstadoForm);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  useEffect(() => {
    if (!session) {
      router.replace("/login?message=Inicia sesion para trabajar contactos");
    }
  }, [router, session]);

  async function loadCatalogs() {
    const [oficinasData, cooperativasData, pagaduriasData] = await Promise.all([
      apiFetch<CatalogItem[]>("/api/v1/oficinas/"),
      apiFetch<CatalogItem[]>("/api/v1/cooperativas/"),
      apiFetch<CatalogItem[]>("/api/v1/pagadurias/"),
    ]);

    setOficinas(oficinasData);
    setCooperativas(cooperativasData);
    setPagadurias(pagaduriasData);

    const defaultOffice = isAdmin
      ? String(oficinasData[0]?.id ?? "")
      : String(session?.oficinaId ?? oficinasData[0]?.id ?? "");

    setCreditoForm((current) => ({
      ...current,
      oficina_id: current.oficina_id || defaultOffice,
      cooperativa_id: current.cooperativa_id || String(cooperativasData[0]?.id ?? ""),
      pagaduria_id: current.pagaduria_id || String(pagaduriasData[0]?.id ?? ""),
    }));
    setSeguimientoForm((current) => ({
      ...current,
      oficina_id: current.oficina_id || defaultOffice,
    }));
  }

  async function loadPensionados() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Pensionado[]>("/api/v1/pensionados/");
      const ordered = [...data].sort((left, right) => Number(right.is_active) - Number(left.is_active) || right.id - left.id);
      setPensionados(ordered);
      setSelectedId((current) =>
        current && ordered.some((item) => item.id === current)
          ? current
          : ordered[0]?.id ?? null,
      );
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : "No se pudieron cargar los contactos",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session) {
      return;
    }

    void Promise.all([loadCatalogs(), loadPensionados()]);
  }, [session?.accessToken]);

  const selectedPensionado = useMemo(
    () => pensionados.find((item) => item.id === selectedId) ?? null,
    [pensionados, selectedId],
  );

  const selectedCredito = useMemo(
    () => creditos.find((item) => item.id === selectedCreditoId) ?? null,
    [creditos, selectedCreditoId],
  );

  const filteredPensionados = useMemo(() => {
    const normalized = normalizeText(query.trim());
    if (!normalized) {
      return pensionados;
    }

    return pensionados.filter((item) =>
      normalizeText(
        [item.nombre, item.documento, item.telefono, item.celular ?? ""].join(" "),
      ).includes(normalized),
    );
  }, [pensionados, query]);

  async function loadFicha(pensionadoId: number) {
    setLoadingFicha(true);
    setError(null);

    try {
      const [creditosData, seguimientosData] = await Promise.all([
        apiFetch<Credito[]>(`/api/v1/creditos/?pensionado_id=${pensionadoId}`),
        apiFetch<Seguimiento[]>(`/api/v1/seguimientos/?pensionado_id=${pensionadoId}`),
      ]);
      const orderedCreditos = [...creditosData].sort((left, right) => right.id - left.id);

      setCreditos(orderedCreditos);
      setSeguimientos(
        [...seguimientosData].sort(
          (left, right) =>
            new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
        ),
      );
      setSelectedCreditoId((current) =>
        current && orderedCreditos.some((credito) => credito.id === current)
          ? current
          : orderedCreditos[0]?.id ?? null,
      );
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : "No se pudo cargar la ficha del contacto",
      );
      setCreditos([]);
      setSeguimientos([]);
      setSelectedCreditoId(null);
    } finally {
      setLoadingFicha(false);
    }
  }

  useEffect(() => {
    if (selectedId) {
      void loadFicha(selectedId);
    } else {
      setCreditos([]);
      setSeguimientos([]);
      setDocumentos([]);
      setSelectedCreditoId(null);
    }
  }, [selectedId]);

  async function loadDocumentos(creditoId: number) {
    try {
      const data = await apiFetch<Documento[]>(
        `/api/v1/documentos/?credito_id=${creditoId}&solo_activos=false`,
      );
      setDocumentos([...data].sort((left, right) => right.id - left.id));
    } catch {
      setDocumentos([]);
    }
  }

  useEffect(() => {
    if (selectedCreditoId) {
      void loadDocumentos(selectedCreditoId);
    } else {
      setDocumentos([]);
    }
  }, [selectedCreditoId]);

  function resetCreditoForm() {
    setCreditoForm((current) => ({
      ...initialCreditoForm,
      oficina_id: isAdmin
        ? current.oficina_id || String(oficinas[0]?.id ?? "")
        : String(session?.oficinaId ?? current.oficina_id),
      cooperativa_id: current.cooperativa_id || String(cooperativas[0]?.id ?? ""),
      pagaduria_id: current.pagaduria_id || String(pagadurias[0]?.id ?? ""),
    }));
    setShowNewCredito(false);
  }

  async function handleCreatePensionado(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const created = await apiFetch<Pensionado>("/api/v1/pensionados/", {
        method: "POST",
        body: JSON.stringify({
          ...pensionadoForm,
          celular: pensionadoForm.celular || null,
        }),
      });
      setPensionados((current) => [created, ...current]);
      setSelectedId(created.id);
      setPensionadoForm(initialPensionadoForm);
      setShowNewContact(false);
      setMessage("Contacto creado correctamente.");
    } catch (submitError) {
      setError(
        submitError instanceof ApiError ? submitError.message : "No se pudo crear el contacto",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateSeguimiento(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPensionado) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const created = await apiFetch<Seguimiento>("/api/v1/seguimientos/", {
        method: "POST",
        body: JSON.stringify({
          pensionado_id: selectedPensionado.id,
          oficina_id: Number(seguimientoForm.oficina_id),
          tipo: seguimientoForm.tipo,
          comentario: seguimientoForm.comentario,
          resultado: seguimientoForm.resultado || null,
          fecha_proximo_contacto: seguimientoForm.fecha_proximo_contacto || null,
        }),
      });
      setSeguimientos((current) => [created, ...current]);
      setSeguimientoForm((current) => ({
        oficina_id: current.oficina_id,
        tipo: "seguimiento",
        comentario: "",
        resultado: "",
        fecha_proximo_contacto: "",
      }));
      setShowNewSeguimiento(false);
      setMessage("Seguimiento agregado.");
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : "No se pudo crear el seguimiento",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateCredito(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPensionado || !userId) {
      setError("No se pudo identificar el contacto o el usuario actual.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const created = await apiFetch<Credito>("/api/v1/creditos/", {
        method: "POST",
        body: JSON.stringify({
          pensionado_id: selectedPensionado.id,
          asesor_id: userId,
          oficina_id: Number(creditoForm.oficina_id),
          cooperativa_id: Number(creditoForm.cooperativa_id),
          pagaduria_id: Number(creditoForm.pagaduria_id),
          monto_solicitado: Number(creditoForm.monto_solicitado),
          plazo: Number(creditoForm.plazo),
          observaciones: creditoForm.observaciones || null,
          tiene_documentos_pendientes: creditoForm.tiene_documentos_pendientes,
          documentos_pendientes: creditoForm.tiene_documentos_pendientes
            ? creditoForm.documentos_pendientes || null
            : null,
        }),
      });
      setCreditos((current) => [created, ...current]);
      setSelectedCreditoId(created.id);
      resetCreditoForm();
      setMessage("Credito creado para el contacto.");
    } catch (submitError) {
      setError(
        submitError instanceof ApiError ? submitError.message : "No se pudo crear el credito",
      );
    } finally {
      setSaving(false);
    }
  }

  function openEstadoForm() {
    if (!selectedCredito) {
      return;
    }
    const next = transiciones[selectedCredito.estado] ?? [];
    setEstadoForm({
      estado_nuevo: next[0] ?? "",
      observaciones: "",
      monto_aprobado: selectedCredito.monto_solicitado
        ? String(selectedCredito.monto_solicitado)
        : "",
    });
    setShowEstadoForm(true);
  }

  async function handleChangeEstado(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCredito || !estadoForm.estado_nuevo) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const updated = await apiFetch<Credito>(`/api/v1/creditos/${selectedCredito.id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({
          estado_nuevo: estadoForm.estado_nuevo,
          observaciones: estadoForm.observaciones || null,
          monto_aprobado:
            estadoForm.estado_nuevo === "Aprobado"
              ? Number(estadoForm.monto_aprobado)
              : null,
        }),
      });
      setCreditos((current) =>
        current.map((credito) => (credito.id === updated.id ? updated : credito)),
      );
      setShowEstadoForm(false);
      setMessage(`Credito actualizado a ${updated.estado}.`);
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : "No se pudo cambiar el estado",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadDocumento() {
    if (!selectedCredito || !uploadFile) {
      setError("Selecciona un credito y un archivo.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("credito_id", String(selectedCredito.id));
      formData.append("archivo", uploadFile);

      const documento = await apiFetch<Documento>("/api/v1/documentos/", {
        method: "POST",
        body: formData,
      });
      setDocumentos((current) => [documento, ...current]);
      setUploadFile(null);
      setMessage("Documento subido al credito.");
    } catch (submitError) {
      setError(
        submitError instanceof ApiError ? submitError.message : "No se pudo subir el documento",
      );
    } finally {
      setSaving(false);
    }
  }

  const nextEstados = selectedCredito ? transiciones[selectedCredito.estado] ?? [] : [];

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
              CRM operativo
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">
              Contactos
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              El flujo vive aqui: pensionado, seguimientos, creditos y documentos del
              credito seleccionado.
            </p>
          </div>
          <button
            type="button"
            className="button-primary rounded-lg px-3 py-2 text-sm"
            onClick={() => setShowNewContact(true)}
          >
            Nuevo contacto
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)_420px]">
        <aside className="rounded-2xl border border-stone-800/10 bg-white/85 shadow-lg shadow-stone-900/5">
          <div className="border-b border-stone-800/10 p-4">
            <input
              className="input-base rounded-lg"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre, documento o telefono"
            />
          </div>
          <div className="max-h-[calc(100vh-250px)] space-y-2 overflow-y-auto p-3">
            {loading ? (
              <EmptyState text="Cargando contactos..." />
            ) : filteredPensionados.length === 0 ? (
              <EmptyState text="Sin contactos para mostrar." />
            ) : (
              filteredPensionados.map((item) => {
                const active = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={[
                      "w-full rounded-xl border px-4 py-3 text-left transition",
                      active
                        ? "border-teal-700/20 bg-teal-950 text-white"
                        : "border-stone-800/10 bg-white/70 text-stone-800 hover:bg-white",
                    ].join(" ")}
                  >
                    <p className="text-sm font-semibold">{item.nombre}</p>
                    <p className="mt-1 text-xs opacity-75">
                      {item.documento} · {item.telefono}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <main className="space-y-4">
          {!selectedPensionado ? (
            <EmptyState text="Selecciona o crea un contacto para empezar." />
          ) : (
            <>
              <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-stone-500">
                      Pensionado
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-stone-950">
                      {selectedPensionado.nombre}
                    </h2>
                    <p className="mt-2 text-sm text-stone-600">
                      Documento {selectedPensionado.documento} · Tel {selectedPensionado.telefono}
                    </p>
                    <p className="mt-1 text-sm text-stone-600">
                      Pension desde {formatDate(selectedPensionado.fecha_inicio_pension)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="button-muted rounded-lg px-3 py-2 text-sm"
                      onClick={() => setShowNewSeguimiento(true)}
                    >
                      Agregar seguimiento
                    </button>
                    <button
                      type="button"
                      className="button-primary rounded-lg px-3 py-2 text-sm"
                      onClick={() => setShowNewCredito(true)}
                    >
                      Crear credito
                    </button>
                  </div>
                </div>
              </article>

              <section className="grid gap-4 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-stone-950">Seguimientos</h3>
                    {loadingFicha ? (
                      <span className="text-xs text-stone-500">Actualizando...</span>
                    ) : null}
                  </div>
                  <div className="mt-4 space-y-3">
                    {seguimientos.length === 0 ? (
                      <EmptyState text="Aun no hay seguimientos para este contacto." />
                    ) : (
                      seguimientos.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-stone-800/10 bg-white/70 px-4 py-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-stone-950">
                                {item.tipo} · {item.oficina_nombre ?? `Oficina ${item.oficina_id}`}
                              </p>
                              <p className="mt-1 text-xs text-stone-500">
                                {item.usuario_nombre ?? "Usuario"} · {formatDateTime(item.created_at)}
                              </p>
                            </div>
                            {item.fecha_proximo_contacto ? (
                              <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                                {formatDate(item.fecha_proximo_contacto)}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-3 text-sm leading-6 text-stone-700">{item.comentario}</p>
                          {item.resultado ? (
                            <p className="mt-2 text-xs font-semibold text-teal-700">
                              Resultado: {item.resultado}
                            </p>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </article>

                <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
                  <h3 className="text-lg font-semibold text-stone-950">Creditos</h3>
                  <div className="mt-4 space-y-3">
                    {creditos.length === 0 ? (
                      <EmptyState text="Este contacto aun no tiene creditos." />
                    ) : (
                      creditos.map((credito) => {
                        const active = credito.id === selectedCreditoId;
                        return (
                          <button
                            key={credito.id}
                            type="button"
                            onClick={() => setSelectedCreditoId(credito.id)}
                            className={[
                              "w-full rounded-xl border px-4 py-3 text-left transition",
                              active
                                ? "border-teal-700/20 bg-teal-950 text-white"
                                : "border-stone-800/10 bg-white/70 hover:bg-white",
                            ].join(" ")}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold">Credito #{credito.id}</p>
                                <p className="mt-1 text-xs opacity-75">
                                  {formatCurrency(credito.monto_solicitado)} · {credito.plazo} meses
                                </p>
                              </div>
                              <span className="rounded-lg bg-white/15 px-2 py-1 text-xs font-semibold">
                                {credito.estado}
                              </span>
                            </div>
                            {credito.tiene_documentos_pendientes ? (
                              <p className={["mt-2 text-xs", active ? "text-amber-100" : "text-amber-700"].join(" ")}>
                                Docs pendientes: {credito.documentos_pendientes ?? "sin detalle"}
                              </p>
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                </article>
              </section>
            </>
          )}
        </main>

        <aside className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
          <h3 className="text-lg font-semibold text-stone-950">Credito seleccionado</h3>
          {!selectedCredito ? (
            <EmptyState text="Selecciona un credito para trabajar documentos y estado." />
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <Detail label="Estado" value={selectedCredito.estado} />
                <Detail label="Solicitado" value={formatCurrency(selectedCredito.monto_solicitado)} />
                <Detail label="Aprobado" value={formatCurrency(selectedCredito.monto_aprobado)} />
                <Detail label="Oficina" value={`#${selectedCredito.oficina_id}`} />
              </div>

              {nextEstados.length > 0 ? (
                <button
                  type="button"
                  className="button-primary w-full rounded-lg px-3 py-2 text-sm"
                  onClick={openEstadoForm}
                >
                  Cambiar estado
                </button>
              ) : (
                <div className="rounded-xl border border-stone-800/10 bg-stone-50 px-4 py-3 text-sm text-stone-600">
                  Este credito esta en estado final.
                </div>
              )}

              <div className="border-t border-stone-800/10 pt-4">
                <p className="text-sm font-semibold text-stone-950">Subir documento</p>
                <input
                  className="input-base mt-3 rounded-lg file:mr-3 file:rounded-lg file:border-0 file:bg-stone-900 file:px-3 file:py-2 file:text-sm file:text-white"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setUploadFile(event.target.files?.[0] ?? null)
                  }
                />
                <button
                  type="button"
                  className="button-muted mt-3 w-full rounded-lg px-3 py-2 text-sm"
                  onClick={() => void handleUploadDocumento()}
                  disabled={saving || !uploadFile}
                >
                  Subir al credito
                </button>
              </div>

              <div className="border-t border-stone-800/10 pt-4">
                <p className="text-sm font-semibold text-stone-950">Documentos</p>
                <div className="mt-3 space-y-2">
                  {documentos.length === 0 ? (
                    <EmptyState text="Sin documentos." />
                  ) : (
                    documentos.map((documento) => (
                      <div
                        key={documento.id}
                        className="rounded-xl border border-stone-800/10 bg-white/70 px-3 py-3"
                      >
                        <p className="text-sm font-semibold text-stone-950">
                          {documento.nombre}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          {documento.tipo} · v{documento.version} · {formatDate(documento.created_at)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      {showNewContact ? (
        <Modal title="Nuevo contacto" onClose={() => setShowNewContact(false)}>
          <form className="space-y-3" onSubmit={handleCreatePensionado}>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Nombre" value={pensionadoForm.nombre} onChange={(value) => setPensionadoForm((current) => ({ ...current, nombre: value }))} />
              <Input label="Documento" value={pensionadoForm.documento} onChange={(value) => setPensionadoForm((current) => ({ ...current, documento: value }))} />
              <Input label="Fecha nacimiento" type="date" value={pensionadoForm.fecha_nacimiento} onChange={(value) => setPensionadoForm((current) => ({ ...current, fecha_nacimiento: value }))} />
              <Input label="Inicio pension" type="date" value={pensionadoForm.fecha_inicio_pension} onChange={(value) => setPensionadoForm((current) => ({ ...current, fecha_inicio_pension: value }))} />
              <Input label="Telefono" value={pensionadoForm.telefono} onChange={(value) => setPensionadoForm((current) => ({ ...current, telefono: value }))} />
              <Input label="Celular" value={pensionadoForm.celular} onChange={(value) => setPensionadoForm((current) => ({ ...current, celular: value }))} />
            </div>
            <Input label="Direccion" value={pensionadoForm.direccion} onChange={(value) => setPensionadoForm((current) => ({ ...current, direccion: value }))} />
            <button type="submit" className="button-primary w-full rounded-lg" disabled={saving}>
              {saving ? "Guardando..." : "Crear contacto"}
            </button>
          </form>
        </Modal>
      ) : null}

      {showNewSeguimiento && selectedPensionado ? (
        <Modal title={`Seguimiento para ${selectedPensionado.nombre}`} onClose={() => setShowNewSeguimiento(false)}>
          <form className="space-y-3" onSubmit={handleCreateSeguimiento}>
            <div className="grid gap-3 md:grid-cols-2">
              <Select
                label="Oficina"
                value={seguimientoForm.oficina_id}
                disabled={!isAdmin}
                onChange={(value) => setSeguimientoForm((current) => ({ ...current, oficina_id: value }))}
                options={oficinas.map((item) => ({ value: String(item.id), label: item.nombre }))}
              />
              <Select
                label="Tipo"
                value={seguimientoForm.tipo}
                onChange={(value) => setSeguimientoForm((current) => ({ ...current, tipo: value }))}
                options={tiposSeguimiento.map((tipo) => ({ value: tipo, label: tipo }))}
              />
            </div>
            <Textarea label="Comentario" value={seguimientoForm.comentario} onChange={(value) => setSeguimientoForm((current) => ({ ...current, comentario: value }))} />
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Resultado" value={seguimientoForm.resultado} onChange={(value) => setSeguimientoForm((current) => ({ ...current, resultado: value }))} />
              <Input label="Proximo contacto" type="datetime-local" value={seguimientoForm.fecha_proximo_contacto} onChange={(value) => setSeguimientoForm((current) => ({ ...current, fecha_proximo_contacto: value }))} />
            </div>
            <button type="submit" className="button-primary w-full rounded-lg" disabled={saving}>
              {saving ? "Guardando..." : "Agregar seguimiento"}
            </button>
          </form>
        </Modal>
      ) : null}

      {showNewCredito && selectedPensionado ? (
        <Modal title={`Credito para ${selectedPensionado.nombre}`} onClose={resetCreditoForm}>
          <form className="space-y-3" onSubmit={handleCreateCredito}>
            <div className="grid gap-3 md:grid-cols-2">
              <Select label="Oficina" value={creditoForm.oficina_id} disabled={!isAdmin} onChange={(value) => setCreditoForm((current) => ({ ...current, oficina_id: value }))} options={oficinas.map((item) => ({ value: String(item.id), label: item.nombre }))} />
              <Select label="Cooperativa" value={creditoForm.cooperativa_id} onChange={(value) => setCreditoForm((current) => ({ ...current, cooperativa_id: value }))} options={cooperativas.map((item) => ({ value: String(item.id), label: item.nombre }))} />
              <Select label="Pagaduria" value={creditoForm.pagaduria_id} onChange={(value) => setCreditoForm((current) => ({ ...current, pagaduria_id: value }))} options={pagadurias.map((item) => ({ value: String(item.id), label: item.nombre }))} />
              <Input label="Plazo meses" type="number" value={creditoForm.plazo} onChange={(value) => setCreditoForm((current) => ({ ...current, plazo: value }))} />
            </div>
            <Input label="Monto solicitado" type="number" value={creditoForm.monto_solicitado} onChange={(value) => setCreditoForm((current) => ({ ...current, monto_solicitado: value }))} />
            <Textarea label="Observaciones" value={creditoForm.observaciones} onChange={(value) => setCreditoForm((current) => ({ ...current, observaciones: value }))} />
            <label className="flex items-center gap-3 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={creditoForm.tiene_documentos_pendientes}
                onChange={(event) => setCreditoForm((current) => ({ ...current, tiene_documentos_pendientes: event.target.checked }))}
              />
              Tiene documentos pendientes
            </label>
            {creditoForm.tiene_documentos_pendientes ? (
              <Textarea label="Documentos pendientes" value={creditoForm.documentos_pendientes} onChange={(value) => setCreditoForm((current) => ({ ...current, documentos_pendientes: value }))} />
            ) : null}
            <button type="submit" className="button-primary w-full rounded-lg" disabled={saving}>
              {saving ? "Creando..." : "Crear credito"}
            </button>
          </form>
        </Modal>
      ) : null}

      {showEstadoForm && selectedCredito ? (
        <Modal title={`Cambiar estado credito #${selectedCredito.id}`} onClose={() => setShowEstadoForm(false)}>
          <form className="space-y-3" onSubmit={handleChangeEstado}>
            <Select
              label="Nuevo estado"
              value={estadoForm.estado_nuevo}
              onChange={(value) => setEstadoForm((current) => ({ ...current, estado_nuevo: value }))}
              options={nextEstados.map((estado) => ({ value: estado, label: estado }))}
            />
            {estadoForm.estado_nuevo === "Aprobado" ? (
              <Input label="Monto aprobado" type="number" value={estadoForm.monto_aprobado} onChange={(value) => setEstadoForm((current) => ({ ...current, monto_aprobado: value }))} />
            ) : null}
            <Textarea label="Observacion" value={estadoForm.observaciones} onChange={(value) => setEstadoForm((current) => ({ ...current, observaciones: value }))} />
            <button type="submit" className="button-primary w-full rounded-lg" disabled={saving}>
              {saving ? "Actualizando..." : "Cambiar estado"}
            </button>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-stone-800/10 bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-stone-950">{title}</h2>
          <button type="button" className="button-muted rounded-lg px-3 py-2 text-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({
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
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-stone-700">{label}</span>
      <input
        className="input-base rounded-lg"
        value={value}
        type={type}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-stone-700">{label}</span>
      <textarea
        className="input-base min-h-[110px] resize-none rounded-lg"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-stone-700">{label}</span>
      <select
        className="input-base rounded-lg disabled:cursor-not-allowed disabled:bg-stone-100"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Selecciona</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-800/10 bg-white/70 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-stone-900">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-800/15 bg-white/45 px-5 py-6 text-center text-sm text-stone-500">
      {text}
    </div>
  );
}
