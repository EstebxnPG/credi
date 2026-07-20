"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError, apiFetch, apiFetchWithMeta } from "@/lib/api";
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
  estado: string;
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
  estado: string;
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

const seguimientoEstados = [
  { value: "abierto", label: "Abierto" },
  { value: "pendiente", label: "Pendiente" },
  { value: "esperando", label: "Esperando" },
  { value: "cerrado", label: "Cerrado" },
];

const fechaRapidaOptions = [
  { value: "", label: "Todas las fechas" },
  { value: "vencidos", label: "Vencidos" },
  { value: "hoy", label: "Hoy" },
  { value: "manana", label: "Manana" },
  { value: "sin_programar", label: "Sin programar" },
];

const emptyForm: FormValues = {
  pensionado_id: "",
  oficina_id: "",
  tipo: "llamada",
  estado: "abierto",
  comentario: "",
  resultado: "",
  fecha_proximo_contacto: "",
};

const PAGE_SIZE = 15;
const CATALOG_LIMIT = 50;
const SEARCH_LIMIT = 20;

export default function SeguimientosPage() {
  const router = useRouter();
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [pensionados, setPensionados] = useState<Pensionado[]>([]);
  const [oficinas, setOficinas] = useState<Oficina[]>([]);
  const [query, setQuery] = useState("");
  const [tipoFilter, setTipoFilter] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [fechaRapida, setFechaRapida] = useState("");
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [totalSeguimientos, setTotalSeguimientos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<FormValues>(emptyForm);

  const searchPensionados = useCallback(async (term: string) => {
    const params = new URLSearchParams({
      solo_activos: "true",
      limit: String(SEARCH_LIMIT),
      texto: term,
    });
    const results = await apiFetch<Pensionado[]>(`/api/v1/pensionados/?${params.toString()}`);
    setPensionados((current) => {
      const merged = new Map(current.map((pensionado) => [pensionado.id, pensionado]));
      results.forEach((pensionado) => merged.set(pensionado.id, pensionado));
      return Array.from(merged.values());
    });
    return results.map((pensionado) => ({
      value: String(pensionado.id),
      label: pensionado.nombre_completo,
      description: `Documento ${pensionado.documento}`,
    }));
  }, []);

  const loadData = useCallback(async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        skip: String((page - 1) * PAGE_SIZE),
      });
      if (query.trim()) params.set("texto", query.trim());
      if (tipoFilter) params.set("tipo", tipoFilter);
      if (estadoFilter) params.set("estado", estadoFilter);
      if (fechaRapida) {
        params.set("fecha_rapida", fechaRapida);
      } else {
        if (fechaDesde) params.set("fecha_desde", fechaDesde);
        if (fechaHasta) params.set("fecha_hasta", fechaHasta);
      }

      const [seguimientosData, pensionadosData, oficinasData] = await Promise.all([
        apiFetchWithMeta<Seguimiento[]>(`/api/v1/seguimientos/?${params.toString()}`),
        apiFetch<Pensionado[]>(`/api/v1/pensionados/?solo_activos=true&limit=${CATALOG_LIMIT}`),
        apiFetch<Oficina[]>("/api/v1/oficinas/"),
      ]);

      setSeguimientos(seguimientosData.data);
      setTotalSeguimientos(Number(seguimientosData.headers.get("X-Total-Count") ?? seguimientosData.data.length));
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
  }, [estadoFilter, fechaDesde, fechaHasta, fechaRapida, page, query, tipoFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(totalSeguimientos / PAGE_SIZE));
  const canGoNext = page < totalPages;

  function resetPage() {
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
        Pagina {page} de {totalPages}. Mostrando {seguimientos.length} de {totalSeguimientos} seguimientos.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="button-muted px-3 py-2 text-xs" disabled={page === 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>
          Anterior
        </button>
        <label className="flex items-center gap-2">
          Ir a
          <input className="input-base h-9 w-20 px-2 py-1 text-sm" max={totalPages} min="1" type="number" value={pageInput} onBlur={() => goToPage(pageInput)} onChange={(event) => { const value = event.target.value; if (/^\d*$/.test(value)) setPageInput(value); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
        </label>
        <button type="button" className="button-muted px-3 py-2 text-xs" disabled={!canGoNext || loading} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
          Siguiente
        </button>
      </div>
    </div>
  );

  function clearFilters() {
    setQuery("");
    setTipoFilter("");
    setEstadoFilter("");
    setFechaDesde("");
    setFechaHasta("");
    setFechaRapida("");
    setPage(1);
  }

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
    if (form.estado === "pendiente" && !form.fecha_proximo_contacto) {
      setFormError("Un seguimiento pendiente exige fecha y hora.");
      return;
    }
    if (form.fecha_proximo_contacto && !isBusinessTime(form.fecha_proximo_contacto)) {
      setFormError("Agenda seguimientos solo entre 8:00 a.m. y 5:30 p.m.");
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
          estado: form.estado,
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
    <section className="space-y-3">
      <article className="rounded-lg border border-stone-800/10 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-stone-500">
              Seguimientos
            </p>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-stone-950">
              Contactos y próximas gestiones
            </h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-stone-600">
              Consulta la historia comercial, registra contactos y agenda nuevas gestiones.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:items-center">
            <input
              className="input-base min-w-0 sm:w-96"
              value={query}
              onChange={(event) => {
                resetPage();
                setQuery(event.target.value);
              }}
              placeholder="Buscar por pensionado, documento, tipo o comentario"
            />
            <button type="button" className="button-primary whitespace-nowrap" onClick={openCreateModal}>
              Crear seguimiento
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 border-t border-stone-800/10 pt-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
          <SelectField
            label="Tipo"
            value={tipoFilter}
            onChange={(value) => {
              resetPage();
              setTipoFilter(value);
            }}
            options={seguimientoTipos}
          />
          <SelectField
            label="Estado"
            value={estadoFilter}
            onChange={(value) => {
              resetPage();
              setEstadoFilter(value);
            }}
            options={seguimientoEstados}
          />
          <SelectField
            label="Proximo contacto"
            value={fechaRapida}
            onChange={(value) => {
              resetPage();
              setFechaRapida(value);
              if (value) {
                setFechaDesde("");
                setFechaHasta("");
              }
            }}
            options={fechaRapidaOptions}
          />
          <Field
            label="Desde"
            type="date"
            value={fechaDesde}
            onChange={(value) => {
              resetPage();
              setFechaDesde(value);
              if (value) {
                setFechaRapida("");
              }
            }}
          />
          <Field
            label="Hasta"
            type="date"
            value={fechaHasta}
            onChange={(value) => {
              resetPage();
              setFechaHasta(value);
              if (value) {
                setFechaRapida("");
              }
            }}
          />
          <div className="flex items-end">
            <button type="button" className="button-muted w-full whitespace-nowrap" onClick={clearFilters}>
              Limpiar
            </button>
          </div>
        </div>
        <div className="mt-3">{paginationControls}</div>
      </article>

      {loading ? <StateMessage text="Cargando seguimientos..." /> : null}
      {error ? <StateMessage tone="error" text={error} /> : null}

      {!loading && !error ? (
        <div className="overflow-hidden rounded-lg border border-stone-800/10 bg-white shadow-sm">
          <div className="hidden grid-cols-[0.55fr_1.15fr_0.8fr_0.8fr_1fr_1fr_120px] gap-3 border-b border-stone-800/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 md:grid">
            <span>ID</span>
            <span>Pensionado</span>
            <span>Tipo</span>
            <span>Estado</span>
            <span>Oficina</span>
            <span>Proximo contacto</span>
            <span className="text-right">Acciones</span>
          </div>

          <div className="divide-y divide-stone-800/10">
            {seguimientos.map((seguimiento) => (
              <div
                key={seguimiento.id}
                role="link"
                tabIndex={0}
                onClick={() => openDetail(seguimiento.id)}
                onKeyDown={(event) => handleRowKeyDown(event, seguimiento.id)}
                className="grid cursor-pointer gap-3 px-3 py-2.5 text-sm transition hover:bg-teal-50/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-700/35 md:grid-cols-[0.55fr_1.15fr_0.8fr_0.8fr_1fr_1fr_120px] md:items-center md:py-2"
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
                <span>
                  <EstadoBadge estado={seguimiento.estado} />
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

            {seguimientos.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-stone-500">
                No hay seguimientos para la búsqueda actual.
              </div>
            ) : null}
          </div>
          <div className="border-t border-stone-800/10 px-3 py-3">
            {paginationControls}
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
          onSearchPensionados={searchPensionados}
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
  onSearchPensionados,
  onChange,
  onClose,
  onSubmit,
}: {
  form: FormValues;
  error: string | null;
  saving: boolean;
  pensionados: Pensionado[];
  oficinas: Oficina[];
  onSearchPensionados: (term: string) => Promise<SearchOption[]>;
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
              onSearch={onSearchPensionados}
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
            label="Estado"
            value={form.estado}
            onChange={(value) => updateField("estado", value)}
            options={seguimientoEstados}
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
            step={1800}
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
  onSearch,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  options: SearchOption[];
  onChange: (value: string) => void;
  onSearch?: (term: string) => Promise<SearchOption[]>;
  placeholder: string;
  required?: boolean;
}) {
  const selected = options.find((option) => option.value === value);
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [remoteOptions, setRemoteOptions] = useState<SearchOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (selected) {
      setSearch(`${selected.label} - ${selected.description}`);
    }
  }, [selected]);

  useEffect(() => {
    if (!onSearch) {
      return;
    }

    const term = search.trim();
    if (selected && search === `${selected.label} - ${selected.description}`) {
      setRemoteOptions([]);
      setSearchError(null);
      return;
    }
    if (term.length < 2) {
      setRemoteOptions([]);
      setSearchError(null);
      setSearching(false);
      return;
    }

    let ignore = false;
    setSearching(true);
    setSearchError(null);
    const timeoutId = window.setTimeout(() => {
      onSearch(term)
        .then((items) => {
          if (!ignore) {
            setRemoteOptions(items);
          }
        })
        .catch(() => {
          if (!ignore) {
            setRemoteOptions([]);
            setSearchError("No se pudo buscar pensionados.");
          }
        })
        .finally(() => {
          if (!ignore) {
            setSearching(false);
          }
        });
    }, 250);

    return () => {
      ignore = true;
      window.clearTimeout(timeoutId);
    };
  }, [onSearch, search, selected]);

  const filteredOptions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (remoteOptions.length > 0) {
      return remoteOptions;
    }
    if (!term) {
      return options.slice(0, 20);
    }

    return options
      .filter((option) =>
        [option.label, option.description].some((item) => item.toLowerCase().includes(term)),
      )
      .slice(0, 20);
  }, [options, remoteOptions, search]);

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
            <p className="px-3 py-2 text-sm text-stone-500">
              {searching ? "Buscando..." : searchError ?? "No hay resultados."}
            </p>
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
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  step?: number;
}) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      <span>{label}</span>
      <input
        className="input-base mt-2"
        type={type}
        step={step}
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

function EstadoBadge({ estado }: { estado: string }) {
  const styles: Record<string, string> = {
    abierto: "border-sky-700/20 bg-sky-50 text-sky-800",
    pendiente: "border-amber-700/20 bg-amber-50 text-amber-800",
    esperando: "border-violet-700/20 bg-violet-50 text-violet-800",
    cerrado: "border-emerald-700/20 bg-emerald-50 text-emerald-800",
  };
  const label = seguimientoEstados.find((item) => item.value === estado)?.label ?? estado;
  return (
    <span className={`inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[estado] ?? "border-stone-800/10 bg-stone-50 text-stone-700"}`}>
      {label}
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
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-800/10 bg-white text-stone-700 transition hover:border-teal-700/30 hover:bg-teal-50 hover:text-teal-800"
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

function isBusinessTime(value: string) {
  const date = new Date(value);
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes >= 8 * 60 && minutes <= 17 * 60 + 30;
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
