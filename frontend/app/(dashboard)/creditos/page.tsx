"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { readSession, readSessionUserId } from "@/lib/session";

type Credito = {
  id: number;
  pensionado_id: number;
  asesor_id: number;
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
  is_active: boolean;
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
  tipo_credito: "Nuevo",
  entidad_financiera_origen: "",
  observaciones: "",
  tiene_documentos_pendientes: false,
  documentos_pendientes: "",
};

type FormMode = "create" | "edit";

export default function CreditosPage() {
  const router = useRouter();
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [pensionados, setPensionados] = useState<Pensionado[]>([]);
  const [pendientes, setPendientes] = useState<PendienteCredito[]>([]);
  const [cooperativas, setCooperativas] = useState<Cooperativa[]>([]);
  const [pagadurias, setPagadurias] = useState<Pagaduria[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [oficinas, setOficinas] = useState<Oficina[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<FormMode | null>(null);
  const [selected, setSelected] = useState<Credito | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const session = readSession();
      const userId = readSessionUserId();
      const [
        creditosData,
        pensionadosData,
        pendientesData,
        cooperativasData,
        pagaduriasData,
        oficinasData,
      ] =
        await Promise.all([
        apiFetch<Credito[]>("/api/v1/creditos/"),
        apiFetch<Pensionado[]>("/api/v1/pensionados/?limit=500"),
        apiFetch<PendienteCredito[]>("/api/v1/pendientes-credito/?estado=pendiente"),
        apiFetch<Cooperativa[]>("/api/v1/cooperativas/"),
        apiFetch<Pagaduria[]>("/api/v1/pagadurias/"),
        apiFetch<Oficina[]>("/api/v1/oficinas/"),
      ]);

      let usuariosData: Usuario[] = [];
      if (session?.rol === "administrador") {
        usuariosData = await apiFetch<Usuario[]>("/api/v1/usuarios/?limit=500");
      } else if (userId && session) {
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

      setCreditos(creditosData);
      setPensionados(pensionadosData);
      setPendientes(pendientesData);
      setCooperativas(cooperativasData);
      setPagadurias(pagaduriasData);
      setOficinas(oficinasData);
      setUsuarios(usuariosData);
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : "No se pudo cargar la lista de creditos",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

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

  const asesores = useMemo(() => {
    return usuarios.filter(
      (usuario) =>
        usuario.is_active && (usuario.rol === "asesora" || usuario.rol === "administrador"),
    );
  }, [usuarios]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return creditos;
    }

    return creditos.filter((credito) => {
      const pensionado = pensionadoById.get(credito.pensionado_id);

      return [
        credito.id,
        credito.estado,
        credito.monto_solicitado,
        credito.plazo,
        credito.nro_libranza,
        credito.tipo_credito,
        credito.documentos_pendientes,
        pensionado?.nombre_completo,
        pensionado?.documento,
      ]
        .filter((value) => value !== null && value !== undefined)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [creditos, pensionadoById, query]);

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
      tipo_credito: credito.tipo_credito ?? "Nuevo",
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
            credito_refinanciado_id: form.tipo_credito === "Refinanciacion" ? Number(form.credito_refinanciado_id) : null,
            pagaduria_id: Number(form.pagaduria_id),
            monto_solicitado: Number(form.monto_solicitado),
            plazo: Number(form.plazo),
            nro_libranza: nullableText(form.nro_libranza),
            tipo_credito: form.tipo_credito,
            entidad_financiera_origen:
              form.tipo_credito === "Compra de cartera"
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
            credito_refinanciado_id: form.tipo_credito === "Refinanciacion" ? Number(form.credito_refinanciado_id) : null,
            pagaduria_id: Number(form.pagaduria_id),
          monto_solicitado: Number(form.monto_solicitado),
          plazo: Number(form.plazo),
          nro_libranza: nullableText(form.nro_libranza),
          tipo_credito: form.tipo_credito,
          entidad_financiera_origen:
            form.tipo_credito === "Compra de cartera"
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
    <section className="space-y-4">
      <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-stone-500">
              Creditos
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-stone-950">
              Solicitudes y estados
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              Gestiona creditos, consulta su ficha y revisa documentos pendientes.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:items-center">
            <input
              className="input-base min-w-0 sm:w-96"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por credito, pensionado, documento o estado"
            />
            <button type="button" className="button-primary whitespace-nowrap" onClick={openCreateModal}>
              Crear credito
            </button>
          </div>
        </div>
      </article>

      {loading ? <StateMessage text="Cargando creditos..." /> : null}
      {error ? <StateMessage tone="error" text={error} /> : null}

      {!loading && !error ? (
        <div className="overflow-hidden rounded-2xl border border-stone-800/10 bg-white/85 shadow-lg shadow-stone-900/5">
          <div className="hidden grid-cols-[0.7fr_1.15fr_1fr_1fr_0.75fr_0.95fr_120px] gap-3 border-b border-stone-800/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 md:grid">
            <span>Credito</span>
            <span>Pensionado</span>
            <span>Estado</span>
            <span>Solicitado</span>
            <span>Plazo</span>
            <span>Registro</span>
            <span className="text-right">Acciones</span>
          </div>

          <div className="divide-y divide-stone-800/10">
            {filtered.map((credito) => {
              const pensionado = pensionadoById.get(credito.pensionado_id);
              const pendientesAbiertos = pendientesByCreditoId.get(credito.id) ?? [];

              return (
                <div
                  key={credito.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => openDetail(credito.id)}
                  onKeyDown={(event) => handleRowKeyDown(event, credito.id)}
                  className="grid cursor-pointer gap-3 px-4 py-4 text-sm transition hover:bg-teal-50/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-700/35 md:grid-cols-[0.7fr_1.15fr_1fr_1fr_0.75fr_0.95fr_120px] md:items-center md:py-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-stone-950">#{credito.id}</p>
                    <p className="mt-1 text-xs text-stone-500 md:hidden">
                      {formatDate(credito.fecha_registro)}
                    </p>
                  </div>
                  <div className="min-w-0 text-stone-700">
                    <p className="truncate font-medium text-stone-900">
                      {pensionado?.nombre_completo ?? `Pensionado #${credito.pensionado_id}`}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {pensionado?.documento ?? "Documento sin cargar"}
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
                  <div className="flex items-center gap-2 md:justify-end">
                    <ActionLink href={`/creditos/${credito.id}`} label="Ver">
                      <EyeIcon />
                    </ActionLink>
                    <ActionButton
                      label="Editar"
                      disabled={!isEditable(credito)}
                      onClick={() => openEditModal(credito)}
                    >
                      <EditIcon />
                    </ActionButton>
                    <ActionButton
                      label="Eliminar"
                      tone="danger"
                      disabled={deletingId === credito.id}
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
                No hay creditos para la busqueda actual.
              </div>
            ) : null}
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
          onChange={setForm}
          onClose={closeModal}
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
  onChange,
  onClose,
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
  onChange: (form: FormValues) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isCreate = mode === "create";
  const selectedAsesor = asesores.find((asesor) => String(asesor.id) === form.asesor_id);
  const selectedCooperativa = cooperativaById.get(Number(form.cooperativa_id));
  const creditosRefinanciables = creditos.filter(
    (item) =>
      item.estado === "Aprobado" &&
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
        className="max-h-[calc(100vh-48px)] w-full max-w-3xl overflow-auto rounded-2xl border border-stone-800/10 bg-white p-5 shadow-2xl shadow-stone-950/20"
      >
        <div className="flex flex-col gap-3 border-b border-stone-800/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">
              {isCreate ? "Nuevo credito" : "Editar credito"}
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

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
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
                required
              />
            </div>
          ) : null}
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
            <div className="rounded-xl border border-stone-800/10 bg-white/65 px-4 py-3 text-sm text-stone-700">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Oficina</p>
              <p className="mt-2 font-semibold text-stone-900">
                {oficinaById.get(Number(form.oficina_id))?.nombre ?? "Pendiente por asignar"}
              </p>
              {selectedAsesor ? (
                <p className="mt-1 text-xs text-stone-500">Tomada del asesor seleccionado.</p>
              ) : null}
            </div>
          ) : null}
          <Field
            label="Monto solicitado"
            type="number"
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
              { value: "Nuevo", label: "Nuevo" },
              { value: "Refinanciacion", label: "Refinanciacion" },
              { value: "Compra de cartera", label: "Compra de cartera" },
            ]}
            required
          />
          {form.tipo_credito === "Refinanciacion" ? (
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
          {form.tipo_credito === "Compra de cartera" ? (
            <Field
              label="Entidad financiera de origen"
              value={form.entidad_financiera_origen}
              onChange={(value) => updateField("entidad_financiera_origen", value)}
              required
            />
          ) : null}
          <label className="flex items-center gap-3 rounded-2xl border border-stone-800/10 bg-white/70 px-4 py-3 text-sm font-medium text-stone-700">
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
          <p className="mt-4 text-xs text-stone-500">
            Regla de cooperativa: monto entre {formatCurrency(selectedCooperativa.monto_minimo)} y{" "}
            {formatCurrency(selectedCooperativa.monto_maximo)}, plazo entre{" "}
            {selectedCooperativa.plazo_minimo} y {selectedCooperativa.plazo_maximo} meses. El
            backend tambien valida edad, monto y plazo.
          </p>
        ) : null}

        {!isCreate ? (
          <p className="mt-4 text-xs text-stone-500">
            Solo se pueden editar creditos en Prospecto o Devuelto por correccion. Los cambios de
            estado se gestionan desde la ficha del credito.
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="button-muted" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="button-primary" disabled={saving}>
            {saving ? "Guardando..." : isCreate ? "Crear credito" : "Guardar cambios"}
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
        "inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-white transition disabled:cursor-not-allowed disabled:opacity-50",
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

function getCreditoStatusTone(estado: string) {
  const normalized = estado.toLowerCase();

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

function isEditable(credito: Credito) {
  return ["Prospecto", "Devuelto por correccion", "Devuelto por corrección"].includes(
    credito.estado,
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
