"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch, apiFetchWithMeta } from "@/lib/api";
import {
  formatCurrency,
  formatMoneyInput,
  parseMoneyInput,
  sanitizeMoneyInput,
} from "@/lib/format";
import { readSession, readSessionUserId } from "@/lib/session";

type Pensionado = {
  id: number;
  nombre: string;
  segundo_nombre: string | null;
  apellidos: string;
  genero: string;
  nombre_completo: string;
  documento: string;
  fecha_nacimiento: string;
  correo: string | null;
  telefono: string | null;
  celular: string | null;
  direccion: string;
  is_active: boolean;
};

type PensionadoCreatePayload = {
  nombre: string;
  segundo_nombre: string | null;
  apellidos: string;
  genero: string;
  documento: string;
  fecha_nacimiento: string;
  correo: string | null;
  telefono: string;
  celular: string | null;
  direccion: string;
};

type PensionadoUpdatePayload = {
  nombre: string;
  segundo_nombre: string | null;
  apellidos: string;
  genero: string;
  fecha_nacimiento: string;
  correo: string | null;
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
  correo: string;
  telefono: string;
  celular: string;
  direccion: string;
};

type Cooperativa = {
  id: number;
  nombre: string;
  monto_minimo: number;
  monto_maximo: number;
  plazo_minimo: number;
  plazo_maximo: number;
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

type PensionadoLookup = {
  exists: boolean;
  linked_to_current_office: boolean;
  pensionado: Pensionado | null;
};

type CreditoFormValues = {
  enabled: boolean;
  cooperativa_id: string;
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

type FormMode = "create" | "edit";
type EstadoFilter = "" | "activos" | "inactivos";

const PAGE_SIZE = 15;
const USER_CATALOG_LIMIT = 1000;

const emptyForm: FormValues = {
  nombre: "",
  segundo_nombre: "",
  apellidos: "",
  genero: "No especificado",
  documento: "",
  fecha_nacimiento: "",
  correo: "",
  telefono: "",
  celular: "",
  direccion: "",
};

const emptyCreditoForm: CreditoFormValues = {
  enabled: false,
  cooperativa_id: "",
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

export default function PensionadosPage() {
  const router = useRouter();
  const [pensionados, setPensionados] = useState<Pensionado[]>([]);
  const [query, setQuery] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>("");
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [totalPensionados, setTotalPensionados] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<FormMode | null>(null);
  const [selected, setSelected] = useState<Pensionado | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [creditoForm, setCreditoForm] = useState<CreditoFormValues>(emptyCreditoForm);
  const [cooperativas, setCooperativas] = useState<Cooperativa[]>([]);
  const [pagadurias, setPagadurias] = useState<Pagaduria[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [oficinas, setOficinas] = useState<Oficina[]>([]);
  const [lookup, setLookup] = useState<PensionadoLookup | null>(null);

  const loadPensionados = useCallback(async function loadPensionados() {
    setLoading(true);
    setError(null);

    try {
      const session = readSession();
      const userId = readSessionUserId();
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        skip: String((page - 1) * PAGE_SIZE),
      });
      if (query.trim()) {
        params.set("texto", query.trim());
      }
      if (estadoFilter === "activos") {
        params.set("activo", "true");
      }
      if (estadoFilter === "inactivos") {
        params.set("activo", "false");
      }

      const [pensionadosResponse, cooperativasData, pagaduriasData, oficinasData] =
        await Promise.all([
          apiFetchWithMeta<Pensionado[]>(`/api/v1/pensionados/?${params.toString()}`),
          apiFetch<Cooperativa[]>("/api/v1/cooperativas/"),
          apiFetch<Pagaduria[]>("/api/v1/pagadurias/"),
          apiFetch<Oficina[]>("/api/v1/oficinas/"),
        ]);
      const total = Number(
        pensionadosResponse.headers.get("X-Total-Count") ?? pensionadosResponse.data.length,
      );

      let usuariosData: Usuario[] = [];
      if (session?.rol === "administrador") {
        usuariosData = await apiFetch<Usuario[]>(`/api/v1/usuarios/?limit=${USER_CATALOG_LIMIT}`);
      } else if (session && userId) {
        usuariosData = [
          {
            id: userId,
            nombre: session.nombre,
            rol: session.rol,
            oficina_id: session.oficinaId ?? 0,
            is_active: true,
          },
        ];
      }

      setPensionados(pensionadosResponse.data);
      setTotalPensionados(Number.isFinite(total) ? total : pensionadosResponse.data.length);
      setCooperativas(cooperativasData);
      setPagadurias(pagaduriasData);
      setOficinas(oficinasData);
      setUsuarios(usuariosData);
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : "No se pudo cargar la lista de pensionados",
      );
    } finally {
      setLoading(false);
    }
  }, [estadoFilter, page, query]);

  useEffect(() => {
    void loadPensionados();
  }, [loadPensionados]);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  const filtered = useMemo(() => {
    return pensionados;
  }, [pensionados]);

  const oficinaById = useMemo(() => {
    return new Map(oficinas.map((oficina) => [oficina.id, oficina]));
  }, [oficinas]);

  const cooperativaById = useMemo(() => {
    return new Map(cooperativas.map((cooperativa) => [cooperativa.id, cooperativa]));
  }, [cooperativas]);

  const asesores = useMemo(() => {
    return usuarios.filter(
      (usuario) =>
        usuario.is_active && (usuario.rol === "asesora" || usuario.rol === "administrador"),
    );
  }, [usuarios]);

  const totalPages = Math.max(1, Math.ceil(totalPensionados / PAGE_SIZE));
  const canGoNext = page < totalPages;

  function resetToFirstPage() {
    setPage(1);
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
        Pagina {page} de {totalPages}. Mostrando {filtered.length} de {totalPensionados} pensionados.
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
      session?.rol === "administrador"
        ? asesores[0]
        : asesores.find((asesor) => asesor.id === userId);
    const defaultOficinaId = defaultAsesor?.oficina_id || session?.oficinaId || oficinas[0]?.id || "";

    setSelected(null);
    setForm(emptyForm);
    setLookup(null);
    setCreditoForm({
      ...emptyCreditoForm,
      asesor_id: defaultAsesor?.id ? String(defaultAsesor.id) : userId ? String(userId) : "",
      oficina_id: defaultOficinaId ? String(defaultOficinaId) : "",
    });
    setFormError(null);
    setLookup(null);
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
      correo: pensionado.correo ?? "",
      telefono: pensionado.telefono ?? "",
      celular: pensionado.celular ?? "",
      direccion: pensionado.direccion,
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
    setLookup(null);
    setCreditoForm(emptyCreditoForm);
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
        if (
          creditoForm.enabled &&
          (!creditoForm.cooperativa_id ||
            !creditoForm.pagaduria_id ||
            !creditoForm.asesor_id ||
            !creditoForm.oficina_id ||
            !creditoForm.monto_solicitado ||
            !creditoForm.plazo)
        ) {
          setFormError("Completa los datos del credito o desactiva la creacion de credito.");
          setSaving(false);
          return;
        }

        if (lookup?.exists && lookup.pensionado && !lookup.linked_to_current_office) {
          const linked = await apiFetch<Pensionado>(
            `/api/v1/pensionados/${lookup.pensionado.id}/vincular-mi-oficina`,
            { method: "POST" },
          );
          setPensionados((current) => [linked, ...current]);

          if (creditoForm.enabled) {
            await createCredito(linked.id, creditoForm);
          }

          closeModal();
          return;
        }

        if (lookup?.exists && lookup.pensionado && lookup.linked_to_current_office) {
          setFormError("Este pensionado ya esta vinculado a tu oficina. Abre su ficha para trabajar con el.");
          setSaving(false);
          return;
        }

        const payload: PensionadoCreatePayload = {
          nombre: form.nombre.trim(),
          segundo_nombre: nullableText(form.segundo_nombre),
          apellidos: form.apellidos.trim(),
          genero: form.genero,
          documento: form.documento.trim(),
          fecha_nacimiento: form.fecha_nacimiento,
          correo: nullableText(form.correo),
          telefono: form.telefono.trim(),
          celular: nullableText(form.celular),
          direccion: form.direccion.trim(),
        };

        const created = await apiFetch<Pensionado>("/api/v1/pensionados/", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        setPensionados((current) => [created, ...current]);

        if (creditoForm.enabled) {
          await createCredito(created.id, creditoForm);
        }
      } else if (selected) {
        const payload: Partial<PensionadoUpdatePayload> = {
          nombre: form.nombre.trim(),
          segundo_nombre: nullableText(form.segundo_nombre),
          apellidos: form.apellidos.trim(),
          genero: form.genero,
          correo: nullableText(form.correo),
          telefono: nullableText(form.telefono),
          celular: nullableText(form.celular),
          direccion: form.direccion.trim(),
        };

        if (form.fecha_nacimiento !== selected.fecha_nacimiento) {
          payload.fecha_nacimiento = form.fecha_nacimiento;
        }

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
    <section className="space-y-3">
      <article className="rounded-lg border border-stone-800/10 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-stone-500">
              Pensionados
            </p>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-stone-950">
              Contactos y base comercial
            </h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-stone-600">
              Gestiona pensionados, consulta su ficha y manten actualizada la informacion de
              contacto.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:items-center">
            <button type="button" className="button-primary whitespace-nowrap" onClick={openCreateModal}>
              Crear pensionado
            </button>
          </div>
        </div>
      </article>

      <article className="rounded-lg border border-stone-800/10 bg-white p-3 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1.4fr_0.7fr_auto] md:items-end">
          <label className="block text-sm font-medium text-stone-700">
            <span>Buscar</span>
            <input
              className="input-base mt-2"
              value={query}
              onChange={(event) => {
                resetToFirstPage();
                setQuery(event.target.value);
              }}
              placeholder="Nombre, documento, correo, telefono o direccion"
            />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            <span>Estado</span>
            <select
              className="input-base mt-2"
              value={estadoFilter}
              onChange={(event) => {
                resetToFirstPage();
                setEstadoFilter(event.target.value as EstadoFilter);
              }}
            >
              <option value="">Todos</option>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
            </select>
          </label>
          <button
            type="button"
            className="button-muted whitespace-nowrap px-3 py-2 text-sm"
            onClick={() => {
              resetToFirstPage();
              setQuery("");
              setEstadoFilter("");
            }}
          >
            Limpiar filtros
          </button>
        </div>
        <div className="mt-3">{paginationControls}</div>
      </article>

      {loading ? <StateMessage text="Cargando pensionados..." /> : null}
      {error ? <StateMessage tone="error" text={error} /> : null}

      {!loading && !error ? (
        <div className="overflow-hidden rounded-lg border border-stone-800/10 bg-white shadow-sm">
          <div className="hidden grid-cols-[1.2fr_0.75fr_0.95fr_0.7fr_120px] gap-3 border-b border-stone-800/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 md:grid">
            <span>Nombre</span>
            <span>Documento</span>
            <span>Contacto</span>
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
                className="grid cursor-pointer gap-3 px-3 py-2.5 text-sm transition hover:bg-teal-50/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-700/35 md:grid-cols-[1.2fr_0.75fr_0.95fr_0.7fr_120px] md:items-center md:py-2"
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
                No hay pensionados para la búsqueda actual.
              </div>
            ) : null}
          </div>
          <div className="border-t border-stone-800/10 px-4 py-3">
            {paginationControls}
          </div>
        </div>
      ) : null}

      {modalMode ? (
        <PensionadoModal
          mode={modalMode}
          form={form}
          error={formError}
          saving={saving}
          creditoForm={creditoForm}
          cooperativas={cooperativas}
          pagadurias={pagadurias}
          asesores={asesores}
          oficinaById={oficinaById}
          cooperativaById={cooperativaById}
          onChange={setForm}
          onCreditoChange={setCreditoForm}
          onClose={closeModal}
          onSubmit={handleSubmit}
          lookup={lookup}
          onLookup={setLookup}
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
  creditoForm,
  cooperativas,
  pagadurias,
  asesores,
  oficinaById,
  cooperativaById,
  onChange,
  onCreditoChange,
  onClose,
  onSubmit,
  lookup,
  onLookup,
}: {
  mode: FormMode;
  form: FormValues;
  error: string | null;
  saving: boolean;
  creditoForm: CreditoFormValues;
  cooperativas: Cooperativa[];
  pagadurias: Pagaduria[];
  asesores: Usuario[];
  oficinaById: Map<number, Oficina>;
  cooperativaById: Map<number, Cooperativa>;
  onChange: (form: FormValues) => void;
  onCreditoChange: (form: CreditoFormValues) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  lookup: PensionadoLookup | null;
  onLookup: (lookup: PensionadoLookup | null) => void;
}) {
  const isEdit = mode === "edit";
  const selectedAsesor = asesores.find((asesor) => String(asesor.id) === creditoForm.asesor_id);
  const selectedCooperativa = cooperativaById.get(Number(creditoForm.cooperativa_id));

  function updateField(field: keyof FormValues, value: string) {
    onChange({ ...form, [field]: value });
    if (field === "documento") {
      onLookup(null);
    }
  }

  async function checkDocumento() {
    const documento = form.documento.trim();
    if (isEdit || documento.length < 6) return;
    try {
      onLookup(await apiFetch<PensionadoLookup>(`/api/v1/pensionados/buscar/documento/${documento}`));
    } catch {
      onLookup(null);
    }
  }

  function updateCreditoField(field: keyof CreditoFormValues, value: string | boolean) {
    if (field === "tipo_credito") {
      onCreditoChange({
        ...creditoForm,
        tipo_credito: String(value),
        entidad_financiera_origen: "",
      });
      return;
    }

    if (field === "asesor_id") {
      const asesor = asesores.find((item) => String(item.id) === value);
      onCreditoChange({
        ...creditoForm,
        asesor_id: String(value),
        oficina_id: asesor?.oficina_id ? String(asesor.oficina_id) : "",
      });
      return;
    }

    onCreditoChange({ ...creditoForm, [field]: value });
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

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
            onBlur={checkDocumento}
          />
          <Field
            label="Fecha de nacimiento"
            type="date"
            value={form.fecha_nacimiento}
            onChange={(value) => updateField("fecha_nacimiento", value)}
            required
          />
          <Field
            label="Correo"
            type="email"
            value={form.correo}
            onChange={(value) => updateField("correo", value)}
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

        {!isEdit && lookup?.exists && lookup.pensionado ? (
          <div className="mt-4 rounded-md border border-blue-700/20 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            <p className="font-semibold">Este pensionado ya existe en el sistema.</p>
            <p className="mt-1">
              {lookup.pensionado.nombre_completo} - CC {lookup.pensionado.documento}
            </p>
            <p className="mt-2 text-xs text-blue-800">
              {lookup.linked_to_current_office
                ? "Ya esta vinculado a tu oficina. No se debe crear duplicado."
                : "Al guardar, se vinculara directamente a tu oficina y podras trabajar con sus creditos aqui."}
            </p>
          </div>
        ) : null}

        {isEdit ? (
          <p className="mt-4 text-xs text-stone-500">
            Documento sigue bloqueado por identidad unica. Las fechas se pueden corregir si hubo
            error de digitacion; afecta las reglas de edad para creditos.
          </p>
        ) : null}

        {!isEdit ? (
          <div className="mt-6 border-t border-stone-800/10 pt-5">
            <label className="flex items-start gap-3 text-sm font-medium text-stone-800">
              <input
                type="checkbox"
                className="mt-1"
                checked={creditoForm.enabled}
                onChange={(event) => updateCreditoField("enabled", event.target.checked)}
              />
              <span>
                <span className="block font-semibold text-stone-950">
                  Crear crédito para este pensionado
                </span>
                <span className="mt-1 block text-xs font-normal text-stone-500">
                  Guarda el pensionado y crea la solicitud de credito en el mismo flujo.
                </span>
              </span>
            </label>

            {creditoForm.enabled ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <OptionSelectField
                  label="Cooperativa"
                  value={creditoForm.cooperativa_id}
                  onChange={(value) => updateCreditoField("cooperativa_id", value)}
                  options={cooperativas.map((cooperativa) => ({
                    value: String(cooperativa.id),
                    label: cooperativa.nombre,
                  }))}
                  required
                />
                <OptionSelectField
                  label="Pagaduria"
                  value={creditoForm.pagaduria_id}
                  onChange={(value) => updateCreditoField("pagaduria_id", value)}
                  options={pagadurias.map((pagaduria) => ({
                    value: String(pagaduria.id),
                    label: pagaduria.nombre,
                  }))}
                  required
                />
                {asesores.length > 1 ? (
                  <OptionSelectField
                    label="Asesor"
                    value={creditoForm.asesor_id}
                    onChange={(value) => updateCreditoField("asesor_id", value)}
                    options={asesores.map((asesor) => ({
                      value: String(asesor.id),
                      label: `${asesor.nombre} - ${
                        oficinaById.get(asesor.oficina_id)?.nombre ?? "Sin oficina"
                      }`,
                    }))}
                    required
                  />
                ) : null}
                <div className="rounded-md border border-stone-800/10 bg-white/65 px-3 py-2 text-sm text-stone-700">
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Oficina</p>
                  <p className="mt-2 font-semibold text-stone-900">
                    {oficinaById.get(Number(creditoForm.oficina_id))?.nombre ??
                      "Pendiente por asignar"}
                  </p>
                  {selectedAsesor ? (
                    <p className="mt-1 text-xs text-stone-500">
                      Tomada del asesor seleccionado.
                    </p>
                  ) : null}
                </div>
                <MoneyField
                  label="Monto solicitado"
                  value={creditoForm.monto_solicitado}
                  onChange={(value) => updateCreditoField("monto_solicitado", value)}
                  required
                />
                <Field
                  label="Plazo"
                  type="number"
                  value={creditoForm.plazo}
                  onChange={(value) => updateCreditoField("plazo", value)}
                  required
                />
                <Field
                  label="Nro libranza"
                  value={creditoForm.nro_libranza}
                  onChange={(value) => updateCreditoField("nro_libranza", value)}
                />
                <OptionSelectField
                  label="Tipo de credito"
                  value={creditoForm.tipo_credito}
                  onChange={(value) => updateCreditoField("tipo_credito", value)}
                  options={[
                    { value: "NUEVO", label: "NUEVO" },
                    { value: "COMPRA CARTERA", label: "COMPRA CARTERA" },
                  ]}
                  required
                />
                {creditoForm.tipo_credito === "COMPRA CARTERA" ? (
                  <Field
                    label="Entidad financiera de origen"
                    value={creditoForm.entidad_financiera_origen}
                    onChange={(value) =>
                      updateCreditoField("entidad_financiera_origen", value)
                    }
                    required
                  />
                ) : null}
                <label className="flex items-center gap-3 rounded-md border border-stone-800/10 bg-white/70 px-3 py-2 text-sm font-medium text-stone-700">
                  <input
                    type="checkbox"
                    checked={creditoForm.tiene_documentos_pendientes}
                    onChange={(event) =>
                      updateCreditoField("tiene_documentos_pendientes", event.target.checked)
                    }
                  />
                  Documentos pendientes
                </label>
                <div className="sm:col-span-2">
                  <TextareaField
                    label="Documentos pendientes"
                    value={creditoForm.documentos_pendientes}
                    onChange={(value) => updateCreditoField("documentos_pendientes", value)}
                    disabled={!creditoForm.tiene_documentos_pendientes}
                  />
                </div>
                <div className="sm:col-span-2">
                  <TextareaField
                    label="Observaciones del credito"
                    value={creditoForm.observaciones}
                    onChange={(value) => updateCreditoField("observaciones", value)}
                  />
                </div>
                {selectedCooperativa ? (
                  <p className="sm:col-span-2 text-xs text-stone-500">
                    Regla de cooperativa: monto entre{" "}
                    {formatCurrency(selectedCooperativa.monto_minimo)} y{" "}
                    {formatCurrency(selectedCooperativa.monto_maximo)}, plazo entre{" "}
                    {selectedCooperativa.plazo_minimo} y {selectedCooperativa.plazo_maximo} meses.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="button-muted" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="button-primary" disabled={saving}>
            {saving
              ? "Guardando..."
              : isEdit
                ? "Guardar cambios"
                : lookup?.exists && !lookup.linked_to_current_office
                  ? creditoForm.enabled
                    ? "Vincular y crear credito"
                    : "Vincular a mi oficina"
                : creditoForm.enabled
                  ? "Crear pensionado y credito"
                  : "Crear pensionado"}
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
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  inputMode?: "numeric" | "tel";
  onBlur?: () => void;
}) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      <span>{label}</span>
      <input
        className="input-base mt-2 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        required={required}
        disabled={disabled}
        inputMode={inputMode}
      />
    </label>
  );
}

async function createCredito(pensionadoId: number, creditoForm: CreditoFormValues) {
  await apiFetch("/api/v1/creditos/", {
    method: "POST",
    body: JSON.stringify({
      pensionado_id: pensionadoId,
      asesor_id: Number(creditoForm.asesor_id),
      oficina_id: Number(creditoForm.oficina_id),
      cooperativa_id: Number(creditoForm.cooperativa_id),
      pagaduria_id: Number(creditoForm.pagaduria_id),
      monto_solicitado: parseMoneyInput(creditoForm.monto_solicitado),
      plazo: Number(creditoForm.plazo),
      nro_libranza: nullableText(creditoForm.nro_libranza),
      tipo_credito: creditoForm.tipo_credito,
      entidad_financiera_origen:
        creditoForm.tipo_credito === "COMPRA CARTERA"
          ? nullableText(creditoForm.entidad_financiera_origen)
          : null,
      observaciones: nullableText(creditoForm.observaciones),
      tiene_documentos_pendientes: creditoForm.tiene_documentos_pendientes,
      documentos_pendientes: creditoForm.tiene_documentos_pendientes
        ? nullableText(creditoForm.documentos_pendientes)
        : null,
    }),
  });
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

function OptionSelectField({
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
