"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, apiFetch, apiFetchWithMeta } from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  formatMoneyInput,
  parseMoneyInput,
  sanitizeMoneyInput,
} from "@/lib/format";
import { readSession, readSessionUserId } from "@/lib/session";

type Credito = {
  id: number;
  pensionado_id: number;
  pensionado_nombre: string | null;
  pensionado_documento: string | null;
  asesor_id: number;
  oficina_id: number;
  cooperativa_id: number;
  cooperativa_nombre: string | null;
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
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type Pensionado = {
  id: number;
  nombre_completo: string;
  documento: string;
};

type PendienteCredito = {
  id: number;
  credito_id: number;
  descripcion: string;
  estado: string;
  origen: string;
};

type Cooperativa = {
  id: number;
  nombre: string;
  monto_minimo: number;
  monto_maximo: number;
  plazo_minimo: number;
  plazo_maximo: number;
  simulador_url: string | null;
  is_active: boolean;
};

type Pagaduria = {
  id: number;
  nombre: string;
  is_active: boolean;
};

type Usuario = {
  id: number;
  nombre: string;
  rol: string;
  oficina_id: number;
  is_active: boolean;
};

type Oficina = {
  id: number;
  nombre: string;
  color: string;
  is_active: boolean;
};

type Opportunity = {
  credito_id: number;
  estado_refinanciacion: string;
  estado_comercial: string;
};

type FormValues = {
  pensionado_id: string;
  cooperativa_id: string;
  credito_refinanciado_id: string;
  pagaduria_id: string;
  asesor_id: string;
  oficina_id: string;
  monto_solicitado: string;
  plazo: string;
  nro_libranza: string;
  tipo_credito: string;
  entidad_financiera_origen: string;
  observaciones: string;
  tiene_documentos_pendientes: boolean;
  documentos_pendientes: string;
};

const emptyForm: FormValues = {
  pensionado_id: "",
  cooperativa_id: "",
  credito_refinanciado_id: "",
  pagaduria_id: "",
  asesor_id: "",
  oficina_id: "",
  monto_solicitado: "",
  plazo: "",
  nro_libranza: "",
  tipo_credito: "NUEVO",
  entidad_financiera_origen: "",
  observaciones: "",
  tiene_documentos_pendientes: false,
  documentos_pendientes: "",
};

type FormMode = "create" | "edit";

type FilterValues = {
  estado: string;
  tipoCredito: string;
  plazoMin: string;
  plazoMax: string;
  pendientes: string;
  refinanciacion: string;
};

const emptyFilters: FilterValues = {
  estado: "",
  tipoCredito: "",
  plazoMin: "",
  plazoMax: "",
  pendientes: "",
  refinanciacion: "",
};

const estadosCredito = [
  "Prospecto",
  "Enviado a cooperativa",
  "Devuelto por correccion",
  "Reenviado",
  "Aprobado",
  "Rechazado",
  "Finalizado",
];

const PAGE_SIZE = 15;
const CATALOG_LIMIT = 200;

export default function CreditosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refinanceOpened = useRef(false);
  const newCreditOpened = useRef(false);
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [pensionados, setPensionados] = useState<Pensionado[]>([]);
  const [searchingPensionados, setSearchingPensionados] = useState(false);
  const [pendientes, setPendientes] = useState<PendienteCredito[]>([]);
  const [cooperativas, setCooperativas] = useState<Cooperativa[]>([]);
  const [pagadurias, setPagadurias] = useState<Pagaduria[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [oficinas, setOficinas] = useState<Oficina[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [registroOrder, setRegistroOrder] = useState<"asc" | "desc">("desc");
  const [totalCreditos, setTotalCreditos] = useState(0);
  const [filters, setFilters] = useState<FilterValues>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<FormMode | null>(null);
  const [selected, setSelected] = useState<Credito | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const session = readSession();
  const canDelete = session?.rol === "administrador";

  const loadData = useCallback(async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const session = readSession();
      const userId = readSessionUserId();
      const creditosParams = new URLSearchParams({
        limit: String(PAGE_SIZE),
        skip: String((page - 1) * PAGE_SIZE),
        orden_registro: registroOrder,
      });
      if (filters.estado) {
        creditosParams.set("estado", filters.estado);
      }
      if (filters.tipoCredito) {
        creditosParams.set("tipo_credito", filters.tipoCredito);
      }
      if (filters.refinanciacion) {
        creditosParams.set("refinanciacion", filters.refinanciacion);
      }
      if (query.trim()) {
        creditosParams.set("texto", query.trim());
      }

      const usuariosRequest =
        session?.rol === "administrador"
          ? apiFetch<Usuario[]>(`/api/v1/usuarios/?limit=${CATALOG_LIMIT}`)
          : Promise.resolve(
              userId && session
                ? [
                    {
                      id: userId,
                      nombre: session.nombre,
                      rol: session.rol,
                      oficina_id: session.oficinaId ?? 0,
                      is_active: true,
                    },
                  ]
                : [],
            );

      const [
        creditosResponse,
        pensionadosData,
        pendientesData,
        cooperativasData,
        pagaduriasData,
        oficinasData,
        usuariosData,
      ] =
        await Promise.all([
        apiFetchWithMeta<Credito[]>(`/api/v1/creditos/?${creditosParams.toString()}`),
        apiFetch<Pensionado[]>(`/api/v1/pensionados/?solo_activos=true&limit=${CATALOG_LIMIT}`),
        apiFetch<PendienteCredito[]>("/api/v1/pendientes-credito/?estado=pendiente&limit=15"),
        apiFetch<Cooperativa[]>("/api/v1/cooperativas/"),
        apiFetch<Pagaduria[]>("/api/v1/pagadurias/"),
        apiFetch<Oficina[]>("/api/v1/oficinas/"),
        usuariosRequest,
      ]);
      const total = Number(creditosResponse.headers.get("X-Total-Count") ?? creditosResponse.data.length);

      setCreditos(creditosResponse.data);
      setTotalCreditos(Number.isFinite(total) ? total : creditosResponse.data.length);
      setPensionados(pensionadosData);
      setPendientes(pendientesData);
      setCooperativas(cooperativasData);
      setPagadurias(pagaduriasData);
      setOficinas(oficinasData);
      setUsuarios(usuariosData);

      const opportunityRequests = creditosResponse.data.map((credito) =>
        apiFetch<Opportunity[]>(`/api/v1/refinanciaciones/elegibles/?credito_id=${credito.id}&limit=1`)
          .then((items) => items[0])
          .catch(() => null),
      );
      void Promise.all(opportunityRequests).then((items) => {
        setOpportunities(items.filter((item): item is Opportunity => Boolean(item)));
      });
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : "No se pudo cargar la lista de creditos",
      );
    } finally {
      setLoading(false);
    }
  }, [filters.estado, filters.refinanciacion, filters.tipoCredito, page, query, registroOrder]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  const pensionadoById = useMemo(() => {
    return new Map(pensionados.map((pensionado) => [pensionado.id, pensionado]));
  }, [pensionados]);

  const cooperativaById = useMemo(() => {
    return new Map(cooperativas.map((cooperativa) => [cooperativa.id, cooperativa]));
  }, [cooperativas]);

  const pendientesByCreditoId = useMemo(() => {
    const grouped = new Map<number, PendienteCredito[]>();
    pendientes.forEach((pendiente) => {
      const current = grouped.get(pendiente.credito_id) ?? [];
      grouped.set(pendiente.credito_id, [...current, pendiente]);
    });
    return grouped;
  }, [pendientes]);

  const oficinaById = useMemo(() => {
    return new Map(oficinas.map((oficina) => [oficina.id, oficina]));
  }, [oficinas]);

  const opportunityByCreditoId = useMemo(() => {
    return new Map(opportunities.map((opportunity) => [opportunity.credito_id, opportunity]));
  }, [opportunities]);

  const asesores = useMemo(() => {
    return usuarios.filter(
      (usuario) =>
        usuario.is_active && (usuario.rol === "asesora" || usuario.rol === "administrador"),
    );
  }, [usuarios]);

  const filtered = useMemo(() => {
    const plazoMin = filters.plazoMin ? Number(filters.plazoMin) : null;
    const plazoMax = filters.plazoMax ? Number(filters.plazoMax) : null;

    return creditos.filter((credito) => {
      const pendientesAbiertos = pendientesByCreditoId.get(credito.id) ?? [];

      if (filters.estado && credito.estado !== filters.estado) {
        return false;
      }
      if (
        filters.tipoCredito &&
        credito.tipo_credito?.toLowerCase() !== filters.tipoCredito.toLowerCase()
      ) {
        return false;
      }
      if (plazoMin !== null && Number.isFinite(plazoMin) && credito.plazo < plazoMin) {
        return false;
      }
      if (plazoMax !== null && Number.isFinite(plazoMax) && credito.plazo > plazoMax) {
        return false;
      }
      if (filters.pendientes === "con" && pendientesAbiertos.length === 0) {
        return false;
      }
      if (filters.pendientes === "sin" && pendientesAbiertos.length > 0) {
        return false;
      }
      return true;
    });
  }, [creditos, filters, pendientesByCreditoId]);

  const estadosDisponibles = useMemo(() => {
    return estadosCredito;
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalCreditos / PAGE_SIZE));
  const canGoNext = page < totalPages;

  function updateFilters(nextFilters: FilterValues) {
    setPage(1);
    setFilters(nextFilters);
  }

  function toggleRegistroOrder() {
    setPage(1);
    setRegistroOrder((current) => (current === "desc" ? "asc" : "desc"));
  }

  function goToPage(value: string) {
    const nextPage = Number(value);
    if (!Number.isFinite(nextPage) || nextPage < 1) {
      setPageInput(String(page));
      return;
    }

    const normalizedPage = Math.min(totalPages, Math.floor(nextPage));
    setPage(normalizedPage);
    setPageInput(String(normalizedPage));
  }

  const paginationControls = (
    <div className="flex flex-col gap-3 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between">
      <p>
        Página {page} de {totalPages}. Mostrando {filtered.length} de {totalCreditos} créditos.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="button-muted px-3 py-2 text-xs"
          disabled={page === 1 || loading}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          Anterior
        </button>
        <label className="flex items-center gap-2">
          Ir a
          <input
            className="input-base h-9 w-20 px-2 py-1 text-sm"
            max={totalPages}
            min="1"
            type="number"
            value={pageInput}
            onBlur={() => goToPage(pageInput)}
            onChange={(event) => {
              const value = event.target.value;
              if (/^\d*$/.test(value)) {
                setPageInput(value);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
        </label>
        <button
          type="button"
          className="button-muted px-3 py-2 text-xs"
          disabled={!canGoNext || loading}
          onClick={() => setPage((current) => current + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );

  function openCreateModal() {
    const session = readSession();
    const userId = readSessionUserId();
    const defaultAsesor =
      session?.rol === "administrador" ? asesores[0] : asesores.find((asesor) => asesor.id === userId);
    const defaultOficinaId =
      defaultAsesor?.oficina_id || session?.oficinaId || oficinas[0]?.id || "";

    setSelected(null);
    setForm({
      ...emptyForm,
      asesor_id: defaultAsesor?.id ? String(defaultAsesor.id) : userId ? String(userId) : "",
      oficina_id: defaultOficinaId ? String(defaultOficinaId) : "",
    });
    setFormError(null);
    setModalMode("create");
  }

  useEffect(() => {
    const sourceId = Number(searchParams.get("refinanciar"));
    if (loading || !sourceId || refinanceOpened.current) return;

    let ignore = false;

    async function openRefinanceShortcut() {
      try {
        const source =
          creditos.find((item) => item.id === sourceId) ??
          (await apiFetch<Credito>(`/api/v1/creditos/${sourceId}`));

        if (ignore || !isCreditoRefinanciable(source)) {
          return;
        }

        refinanceOpened.current = true;
        setCreditos((current) =>
          current.some((item) => item.id === source.id) ? current : [source, ...current],
        );
        setPensionados((current) => {
          if (current.some((item) => item.id === source.pensionado_id)) {
            return current;
          }

          return [
            {
              id: source.pensionado_id,
              nombre_completo: source.pensionado_nombre ?? `Pensionado #${source.pensionado_id}`,
              documento: source.pensionado_documento ?? "Sin documento",
            },
            ...current,
          ];
        });
        setSelected(null);
        setForm({
          ...emptyForm,
          pensionado_id: String(source.pensionado_id),
          asesor_id: String(source.asesor_id),
          oficina_id: String(source.oficina_id),
          cooperativa_id: String(source.cooperativa_id),
          pagaduria_id: String(source.pagaduria_id),
          tipo_credito: "REFINANCIACION",
          credito_refinanciado_id: String(source.id),
          observaciones: `Refinanciación del crédito #${source.id}`,
        });
        setFormError(null);
        setModalMode("create");
      } catch (shortcutError) {
        if (!ignore) {
          setError(
            shortcutError instanceof ApiError
              ? shortcutError.message
              : "No se pudo preparar la refinanciacion",
          );
        }
      }
    }

    void openRefinanceShortcut();

    return () => {
      ignore = true;
    };
  }, [creditos, loading, searchParams]);

  useEffect(() => {
    const pensionadoId = Number(searchParams.get("pensionado"));
    if (loading || !pensionadoId || newCreditOpened.current) return;

    let ignore = false;

    async function openNewCreditShortcut() {
      try {
        const pensionado =
          pensionados.find((item) => item.id === pensionadoId) ??
          (await apiFetch<Pensionado>(`/api/v1/pensionados/${pensionadoId}`));

        if (ignore) {
          return;
        }

        const session = readSession();
        const userId = readSessionUserId();
        const defaultAsesor =
          session?.rol === "administrador"
            ? asesores[0]
            : asesores.find((asesor) => asesor.id === userId);
        const defaultOficinaId =
          defaultAsesor?.oficina_id || session?.oficinaId || oficinas[0]?.id || "";

        newCreditOpened.current = true;
        setPensionados((current) =>
          current.some((item) => item.id === pensionado.id) ? current : [pensionado, ...current],
        );
        setSelected(null);
        setForm({
          ...emptyForm,
          pensionado_id: String(pensionado.id),
          asesor_id: defaultAsesor?.id ? String(defaultAsesor.id) : userId ? String(userId) : "",
          oficina_id: defaultOficinaId ? String(defaultOficinaId) : "",
          tipo_credito: "NUEVO",
        });
        setFormError(null);
        setModalMode("create");
      } catch (shortcutError) {
        if (!ignore) {
          setError(
            shortcutError instanceof ApiError
              ? shortcutError.message
              : "No se pudo preparar el credito nuevo",
          );
        }
      }
    }

    void openNewCreditShortcut();

    return () => {
      ignore = true;
    };
  }, [asesores, loading, oficinas, pensionados, searchParams]);

  function openEditModal(credito: Credito) {
    setSelected(credito);
    setForm({
      pensionado_id: String(credito.pensionado_id),
      cooperativa_id: String(credito.cooperativa_id),
      credito_refinanciado_id: credito.credito_refinanciado_id ? String(credito.credito_refinanciado_id) : "",
      pagaduria_id: String(credito.pagaduria_id),
      asesor_id: String(credito.asesor_id),
      oficina_id: String(credito.oficina_id),
      monto_solicitado: String(credito.monto_solicitado),
      plazo: String(credito.plazo),
      nro_libranza: credito.nro_libranza ?? "",
      tipo_credito: credito.tipo_credito ?? "NUEVO",
      entidad_financiera_origen: credito.entidad_financiera_origen ?? "",
      observaciones: credito.observaciones ?? "",
      tiene_documentos_pendientes: credito.tiene_documentos_pendientes,
      documentos_pendientes: credito.documentos_pendientes ?? "",
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

  const searchPensionados = useCallback(async function searchPensionados(term: string) {
    const cleanTerm = term.trim();
    if (cleanTerm.length < 2) {
      return;
    }

    setSearchingPensionados(true);
    try {
      const params = new URLSearchParams({
        solo_activos: "true",
        limit: String(CATALOG_LIMIT),
        texto: cleanTerm,
      });
      const results = await apiFetch<Pensionado[]>(`/api/v1/pensionados/?${params.toString()}`);
      setPensionados((current) => {
        const byId = new Map(current.map((pensionado) => [pensionado.id, pensionado]));
        results.forEach((pensionado) => byId.set(pensionado.id, pensionado));
        return Array.from(byId.values());
      });
    } catch {
      // The form keeps the current options and lets the submit path surface hard failures.
    } finally {
      setSearchingPensionados(false);
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!modalMode) {
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      if (modalMode === "create") {
        if (
          !form.pensionado_id ||
          !form.cooperativa_id ||
          !form.pagaduria_id ||
          !form.asesor_id ||
          !form.oficina_id
        ) {
          setFormError("Selecciona pensionado, cooperativa, pagaduria, asesor y oficina.");
          setSaving(false);
          return;
        }

        const created = await apiFetch<Credito>("/api/v1/creditos/", {
          method: "POST",
          body: JSON.stringify({
            pensionado_id: Number(form.pensionado_id),
            asesor_id: Number(form.asesor_id),
            oficina_id: Number(form.oficina_id),
            cooperativa_id: Number(form.cooperativa_id),
            credito_refinanciado_id: form.tipo_credito === "REFINANCIACION" ? Number(form.credito_refinanciado_id) : null,
            pagaduria_id: Number(form.pagaduria_id),
            monto_solicitado: parseMoneyInput(form.monto_solicitado),
            plazo: Number(form.plazo),
            nro_libranza: nullableText(form.nro_libranza),
            tipo_credito: form.tipo_credito,
            entidad_financiera_origen:
              form.tipo_credito === "COMPRA CARTERA"
                ? nullableText(form.entidad_financiera_origen)
                : null,
            observaciones: nullableText(form.observaciones),
            tiene_documentos_pendientes: form.tiene_documentos_pendientes,
            documentos_pendientes: form.tiene_documentos_pendientes
              ? nullableText(form.documentos_pendientes)
              : null,
          }),
        });

        setCreditos((current) => [created, ...current]);
      } else if (selected) {
        const updated = await apiFetch<Credito>(`/api/v1/creditos/${selected.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            cooperativa_id: Number(form.cooperativa_id),
            credito_refinanciado_id: form.tipo_credito === "REFINANCIACION" ? Number(form.credito_refinanciado_id) : null,
            pagaduria_id: Number(form.pagaduria_id),
          monto_solicitado: parseMoneyInput(form.monto_solicitado),
          plazo: Number(form.plazo),
          nro_libranza: nullableText(form.nro_libranza),
          tipo_credito: form.tipo_credito,
          entidad_financiera_origen:
            form.tipo_credito === "COMPRA CARTERA"
              ? nullableText(form.entidad_financiera_origen)
              : null,
          observaciones: nullableText(form.observaciones),
          tiene_documentos_pendientes: form.tiene_documentos_pendientes,
          documentos_pendientes: form.tiene_documentos_pendientes
            ? nullableText(form.documentos_pendientes)
            : null,
          }),
        });

        setCreditos((current) =>
          current.map((credito) => (credito.id === updated.id ? updated : credito)),
        );
      }
      closeModal();
    } catch (saveError) {
      setFormError(
        saveError instanceof ApiError ? saveError.message : "No se pudo guardar el credito",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(credito: Credito) {
    const confirmed = window.confirm(
      `Vas a eliminar el credito #${credito.id}. Esta accion lo marcara como inactivo.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(credito.id);
    setError(null);

    try {
      await apiFetch<Credito>(`/api/v1/creditos/${credito.id}`, {
        method: "DELETE",
      });

      setCreditos((current) => current.filter((item) => item.id !== credito.id));
    } catch (deleteError) {
      setError(
        deleteError instanceof ApiError ? deleteError.message : "No se pudo eliminar el credito",
      );
    } finally {
      setDeletingId(null);
    }
  }

  function openDetail(creditoId: number) {
    router.push(`/creditos/${creditoId}`);
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>, creditoId: number) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail(creditoId);
    }
  }

  return (
    <section className="space-y-3">
      <article className="rounded-lg border border-stone-800/10 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-stone-500">
              Créditos
            </p>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-stone-950">
              Solicitudes y estados
            </h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-stone-600">
              Gestiona creditos, consulta su ficha y revisa documentos pendientes.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:items-center">
            <input
              className="input-base min-w-0 sm:w-96"
              value={query}
              onChange={(event) => {
                setPage(1);
                setQuery(event.target.value);
              }}
              placeholder="Buscar por credito, pensionado, documento, libranza, cooperativa o tipo"
            />
            <button type="button" className="button-primary whitespace-nowrap" onClick={openCreateModal}>
              Crear crédito
            </button>
          </div>
        </div>
      </article>

      <article className="rounded-lg border border-stone-800/10 bg-white p-3 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_0.8fr_0.8fr_1fr_1fr_auto] md:items-end">
          <SelectField
            label="Estado"
            value={filters.estado}
            onChange={(value) => updateFilters({ ...filters, estado: value })}
            options={estadosDisponibles.map((estado) => ({ value: estado, label: estado }))}
          />
          <SelectField
            label="Tipo de credito"
            value={filters.tipoCredito}
            onChange={(value) => updateFilters({ ...filters, tipoCredito: value })}
            options={[
              { value: "NUEVO", label: "NUEVO" },
              { value: "REFINANCIACION", label: "REFINANCIACION" },
              { value: "COMPRA CARTERA", label: "COMPRA CARTERA" },
            ]}
          />
          <Field
            label="Plazo min."
            type="number"
            value={filters.plazoMin}
            onChange={(value) => updateFilters({ ...filters, plazoMin: value })}
          />
          <Field
            label="Plazo max."
            type="number"
            value={filters.plazoMax}
            onChange={(value) => updateFilters({ ...filters, plazoMax: value })}
          />
          <SelectField
            label="Pendientes"
            value={filters.pendientes}
            onChange={(value) => updateFilters({ ...filters, pendientes: value })}
            options={[
              { value: "con", label: "Con pendientes" },
              { value: "sin", label: "Sin pendientes" },
            ]}
          />
          <SelectField
            label="Refinanciacion"
            value={filters.refinanciacion}
            onChange={(value) => updateFilters({ ...filters, refinanciacion: value })}
            options={[
              { value: "listos", label: "Listos para refinanciar" },
              { value: "programados", label: "Programados" },
              { value: "sin", label: "Sin oportunidad" },
            ]}
          />
          <button
            type="button"
            className="button-muted whitespace-nowrap px-3 py-2 text-sm"
            onClick={() => updateFilters(emptyFilters)}
          >
            Limpiar filtros
          </button>
        </div>
        <div className="mt-3">{paginationControls}</div>
      </article>

      {loading ? <StateMessage text="Cargando créditos..." /> : null}
      {error ? <StateMessage tone="error" text={error} /> : null}

      {!loading && !error ? (
        <div className="overflow-hidden rounded-lg border border-stone-800/10 bg-white shadow-sm">
          <div className="hidden grid-cols-[0.5fr_1.35fr_0.9fr_1fr_0.9fr_0.85fr_0.9fr_0.85fr_112px] gap-3 border-b border-stone-800/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 md:grid">
            <span>Credito</span>
            <span>Pensionado</span>
            <span>Libranza</span>
            <span>Cooperativa</span>
            <span>Tipo</span>
            <span>Estado</span>
            <span>Solicitado</span>
            <button
              type="button"
              className="w-fit text-left uppercase tracking-[0.16em] text-stone-500 transition hover:text-teal-700"
              onClick={toggleRegistroOrder}
              title={registroOrder === "desc" ? "Ver registros más antiguos primero" : "Ver registros más recientes primero"}
            >
              Registro {registroOrder === "desc" ? "recientes" : "antiguos"}
            </button>
            <span className="text-right">Acciones</span>
          </div>

          <div className="divide-y divide-stone-800/10">
            {filtered.map((credito) => {
              const pensionado = pensionadoById.get(credito.pensionado_id);
              const pendientesAbiertos = pendientesByCreditoId.get(credito.id) ?? [];
              const oficina = oficinaById.get(credito.oficina_id);
              const pensionadoNombre =
                credito.pensionado_nombre ?? pensionado?.nombre_completo ?? `Pensionado #${credito.pensionado_id}`;
              const pensionadoDocumento =
                credito.pensionado_documento ?? pensionado?.documento ?? "Documento sin cargar";
              const cooperativaNombre =
                credito.cooperativa_nombre ??
                cooperativaById.get(credito.cooperativa_id)?.nombre ??
                "Sin cooperativa";

              return (
                <div
                  key={credito.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => openDetail(credito.id)}
                  onKeyDown={(event) => handleRowKeyDown(event, credito.id)}
                  className="grid cursor-pointer gap-3 px-3 py-2.5 text-sm transition hover:bg-teal-50/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-700/35 md:grid-cols-[0.5fr_1.35fr_0.9fr_1fr_0.9fr_0.85fr_0.9fr_0.85fr_112px] md:items-center md:py-2"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-stone-950">#{credito.id}</p>
                    <p className="mt-1 text-xs text-stone-500 md:hidden">
                      {formatDate(credito.fecha_registro)}
                    </p>
                  </div>
                  <div className="min-w-0 text-stone-700">
                    <p className="truncate font-medium text-stone-900">
                      {pensionadoNombre}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {pensionadoDocumento}
                    </p>
                    <span className="mt-2 inline-flex md:hidden">
                      <OfficeBadge oficina={oficina} />
                    </span>
                    <span className="mt-2 hidden md:inline-flex">
                      <OfficeBadge oficina={oficina} />
                    </span>
                  </div>
                  <div className="min-w-0 text-stone-700">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500 md:hidden">
                      Libranza
                    </p>
                    <p className="truncate">{credito.nro_libranza ?? "Sin libranza"}</p>
                  </div>
                  <div className="min-w-0 text-stone-700">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500 md:hidden">
                      Cooperativa
                    </p>
                    <p className="truncate">{cooperativaNombre}</p>
                  </div>
                  <span className="text-stone-700">{credito.tipo_credito ?? "Sin tipo"}</span>
                  <span>
                    <CreditoStatusBadge estado={credito.estado} />
                  </span>
                  <span className="font-medium text-stone-800">
                    {formatCurrency(credito.monto_solicitado)}
                    <span className="mt-1 block text-xs font-normal text-stone-500">
                      {credito.plazo} meses
                    </span>
                  </span>
                  <span className="text-stone-700">
                    {formatDate(credito.fecha_registro)}
                    <PendingSummary
                      pendientes={pendientesAbiertos}
                    />
                    <RefinanceSummary opportunity={opportunityByCreditoId.get(credito.id)} />
                  </span>
                  <div className="flex items-center gap-2 md:justify-end">
                    <ActionLink href={`/creditos/${credito.id}`} label="Ver">
                      <EyeIcon />
                    </ActionLink>
                    <ActionButton
                      label="Editar"
                      disabled={!credito.is_active || !isCreditoEditable(credito)}
                      onClick={() => openEditModal(credito)}
                    >
                      <EditIcon />
                    </ActionButton>
                    <ActionButton
                      label="Eliminar"
                      tone="danger"
                      disabled={deletingId === credito.id || !canDelete}
                      onClick={() => void handleDelete(credito)}
                    >
                      <TrashIcon />
                    </ActionButton>
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-stone-500">
                No hay créditos para la búsqueda actual.
              </div>
            ) : null}
          </div>
          <div className="border-t border-stone-800/10 px-4 py-3">
            {paginationControls}
          </div>
        </div>
      ) : null}

      {modalMode ? (
        <CreditoModal
          mode={modalMode}
          credito={selected}
          form={form}
          error={formError}
          saving={saving}
          pensionados={pensionados}
          cooperativas={cooperativas}
          creditos={creditos}
          pagadurias={pagadurias}
          asesores={asesores}
          oficinaById={oficinaById}
          cooperativaById={cooperativaById}
          searchingPensionados={searchingPensionados}
          onChange={setForm}
          onClose={closeModal}
          onSearchPensionados={searchPensionados}
          onSubmit={handleSubmit}
        />
      ) : null}
    </section>
  );
}

function CreditoModal({
  mode,
  credito,
  form,
  error,
  saving,
  pensionados,
  cooperativas,
  creditos,
  pagadurias,
  asesores,
  oficinaById,
  cooperativaById,
  searchingPensionados,
  onChange,
  onClose,
  onSearchPensionados,
  onSubmit,
}: {
  mode: FormMode;
  credito: Credito | null;
  form: FormValues;
  error: string | null;
  saving: boolean;
  pensionados: Pensionado[];
  cooperativas: Cooperativa[];
  creditos: Credito[];
  pagadurias: Pagaduria[];
  asesores: Usuario[];
  oficinaById: Map<number, Oficina>;
  cooperativaById: Map<number, Cooperativa>;
  searchingPensionados: boolean;
  onChange: (form: FormValues) => void;
  onClose: () => void;
  onSearchPensionados: (term: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isCreate = mode === "create";
  const selectedAsesor = asesores.find((asesor) => String(asesor.id) === form.asesor_id);
  const selectedCooperativa = cooperativaById.get(Number(form.cooperativa_id));
  const creditosRefinanciables = creditos.filter(
    (item) =>
      isCreditoRefinanciable(item) &&
      String(item.pensionado_id) === form.pensionado_id &&
      item.id !== credito?.id,
  );

  function updateField(field: keyof FormValues, value: string | boolean) {
    if (field === "tipo_credito") {
      onChange({
        ...form,
        tipo_credito: String(value),
        credito_refinanciado_id: "",
        entidad_financiera_origen: "",
      });
      return;
    }

    if (field === "asesor_id") {
      const asesor = asesores.find((item) => String(item.id) === value);
      onChange({ ...form, asesor_id: String(value), oficina_id: asesor?.oficina_id ? String(asesor.oficina_id) : "" });
      return;
    }

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
              {isCreate ? "Nuevo crédito" : "Editar crédito"}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-950">
              {isCreate ? "Crear solicitud" : `Credito #${credito?.id}`}
            </h2>
          </div>
          <button type="button" className="button-muted px-3 py-2 text-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {error ? <div className="mt-4"><StateMessage tone="error" text={error} /></div> : null}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {isCreate ? (
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
                onSearch={onSearchPensionados}
                loading={searchingPensionados}
                required
              />
            </div>
          ) : null}
          <div>
            <SearchSelectField
              label="Cooperativa"
              value={form.cooperativa_id}
              options={cooperativas.map((cooperativa) => ({
                value: String(cooperativa.id),
                label: cooperativa.nombre,
                description: `${formatCurrency(cooperativa.monto_minimo)} a ${formatCurrency(
                  cooperativa.monto_maximo,
                )} - ${cooperativa.plazo_minimo} a ${cooperativa.plazo_maximo} meses`,
              }))}
              onChange={(value) => updateField("cooperativa_id", value)}
              placeholder="Buscar cooperativa"
              required
            />
            {selectedCooperativa?.simulador_url ? (
              <a href={selectedCooperativa.simulador_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:underline">
                Abrir simuladora de {selectedCooperativa.nombre} ↗
              </a>
            ) : selectedCooperativa ? (
              <p className="mt-2 text-xs text-stone-400">Esta cooperativa no tiene simuladora configurada.</p>
            ) : null}
          </div>
          <SearchSelectField
            label="Pagaduria"
            value={form.pagaduria_id}
            options={pagadurias.map((pagaduria) => ({
              value: String(pagaduria.id),
              label: pagaduria.nombre,
              description: "Entidad pagadora asignada",
            }))}
            onChange={(value) => updateField("pagaduria_id", value)}
            placeholder="Buscar pagaduria"
            required
          />
          {isCreate && asesores.length > 1 ? (
            <SelectField
              label="Asesor"
              value={form.asesor_id}
              onChange={(value) => updateField("asesor_id", value)}
              options={asesores.map((asesor) => ({
                value: String(asesor.id),
                label: `${asesor.nombre} - ${oficinaById.get(asesor.oficina_id)?.nombre ?? "Sin oficina"}`,
              }))}
              required
            />
          ) : null}
          {isCreate ? (
            <div className="rounded-md border border-stone-800/10 bg-white/65 px-3 py-2 text-sm text-stone-700">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Oficina</p>
              <p className="mt-2 font-semibold text-stone-900">
                {oficinaById.get(Number(form.oficina_id))?.nombre ?? "Pendiente por asignar"}
              </p>
              {selectedAsesor ? (
                <p className="mt-1 text-xs text-stone-500">Tomada del asesor seleccionado.</p>
              ) : null}
            </div>
          ) : null}
          <MoneyField
            label="Monto solicitado"
            value={form.monto_solicitado}
            onChange={(value) => updateField("monto_solicitado", value)}
            required
          />
          <Field
            label="Plazo"
            type="number"
            value={form.plazo}
            onChange={(value) => updateField("plazo", value)}
            required
          />
          <Field
            label="Nro libranza"
            value={form.nro_libranza}
            onChange={(value) => updateField("nro_libranza", value)}
          />
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
          {form.tipo_credito === "REFINANCIACION" ? (
            <SelectField
              label="Credito que refinancia"
              value={form.credito_refinanciado_id}
              onChange={(value) => updateField("credito_refinanciado_id", value)}
              options={creditosRefinanciables.map((credito) => ({
                value: String(credito.id),
                label: `#${credito.id} - ${formatCurrency(credito.monto_aprobado ?? credito.monto_solicitado)}`,
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
          <label className="flex items-center gap-3 rounded-lg border border-stone-800/10 bg-white/70 px-3 py-2 text-sm font-medium text-stone-700">
            <input
              type="checkbox"
              checked={form.tiene_documentos_pendientes}
              onChange={(event) =>
                updateField("tiene_documentos_pendientes", event.target.checked)
              }
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
            <TextareaField
              label="Observaciones"
              value={form.observaciones}
              onChange={(value) => updateField("observaciones", value)}
            />
          </div>
        </div>

        {selectedCooperativa ? (
          <div className="mt-4 text-xs text-stone-500">
            Regla de cooperativa: monto entre {formatCurrency(selectedCooperativa.monto_minimo)} y{" "}
            {formatCurrency(selectedCooperativa.monto_maximo)}, plazo entre{" "}
            {selectedCooperativa.plazo_minimo} y {selectedCooperativa.plazo_maximo} meses. El
            backend tambien valida edad, monto y plazo.
          </div>
        ) : null}

        {!isCreate ? (
          <p className="mt-4 text-xs text-stone-500">
            Puedes editar creditos mientras no esten aprobados, finalizados o rechazados. Los
            cambios de estado se gestionan desde la ficha del credito.
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="button-muted" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="button-primary" disabled={saving}>
            {saving ? "Guardando..." : isCreate ? "Crear crédito" : "Guardar cambios"}
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

function RefinanceSummary({ opportunity }: { opportunity?: Opportunity }) {
  if (!opportunity) {
    return null;
  }
  const ready =
    opportunity.estado_refinanciacion === "Listo" &&
    !["rechazado", "convertido"].includes(opportunity.estado_comercial);
  return (
    <span className={["mt-1 block text-xs font-medium", ready ? "text-teal-700" : "text-stone-500"].join(" ")}>
      {ready ? "Listo para refinanciar" : "Refinanciacion programada"}
    </span>
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
  onSearch,
  loading = false,
  required = false,
}: {
  label: string;
  value: string;
  options: SearchOption[];
  onChange: (value: string) => void;
  placeholder: string;
  onSearch?: (term: string) => void;
  loading?: boolean;
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

  useEffect(() => {
    if (!onSearch || selected) {
      return;
    }

    const term = search.trim();
    if (term.length < 2) {
      return;
    }

    const timer = window.setTimeout(() => onSearch(term), 300);
    return () => window.clearTimeout(timer);
  }, [onSearch, search, selected]);

  const filteredOptions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return options.slice(0, 20);
    }

    return options
      .filter((option) =>
        [option.label, option.description]
          .some((item) => item.toLowerCase().includes(term)),
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
        <div className="mt-2 max-h-48 overflow-auto rounded-md border border-stone-800/10 bg-white shadow-sm shadow-stone-900/5">
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
            <p className="px-3 py-2 text-sm text-stone-500">{loading ? "Buscando..." : "No hay resultados."}</p>
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
        onWheel={(event) => {
          if (type === "number") {
            event.currentTarget.blur();
          }
        }}
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
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-800/10 bg-white text-stone-700 transition hover:border-teal-700/30 hover:bg-teal-50 hover:text-teal-800"
    >
      {children}
    </Link>
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
        "inline-flex h-9 w-9 items-center justify-center rounded-md border bg-white transition disabled:cursor-not-allowed disabled:opacity-50",
        tone === "danger"
          ? "border-red-500/15 text-red-700 hover:bg-red-50"
          : "border-stone-800/10 text-stone-700 hover:border-teal-700/30 hover:bg-teal-50 hover:text-teal-800",
      ].join(" ")}
    >
      {children}
    </button>
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

function getCreditoStatusTone(estado: string) {
  const normalized = normalizeText(estado);

  if (normalized.includes("finaliz")) {
    return "warning";
  }

  if (normalized.includes("aprob") || normalized.includes("desembols")) {
    return "success";
  }

  if (
    normalized.includes("devuelto") ||
    normalized.includes("correccion") ||
    normalized.includes("correcci") ||
    normalized.includes("pendiente")
  ) {
    return "warning";
  }

  if (normalized.includes("rechaz") || normalized.includes("cancel")) {
    return "danger";
  }

  return "neutral";
}

function isCreditoEditable(credito: Credito) {
  return !["aprobado", "finalizado", "rechazado"].includes(normalizeText(credito.estado));
}

function isCreditoRefinanciable(credito: Credito) {
  return normalizeText(credito.estado) === "aprobado";
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
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
      <path d="M12 20h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
