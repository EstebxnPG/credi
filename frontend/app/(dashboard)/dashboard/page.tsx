"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { ApiError, apiFetch } from "@/lib/api";
import { readSession } from "@/lib/session";

type Oficina = {
  id: number;
  nombre: string;
  is_active: boolean;
};

type Credito = {
  id: number;
  pensionado_id: number;
  oficina_id: number;
  asesor_id: number;
  estado: string;
  monto_solicitado: number;
  monto_aprobado: number | null;
  tiene_documentos_pendientes?: boolean;
  documentos_pendientes?: string | null;
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

type Documento = {
  id: number;
  credito_id: number;
  is_active: boolean;
};

const estadosActivos = [
  "Prospecto",
  "Enviado a cooperativa",
  "Devuelto por correccion",
  "Devuelto por correcciÃ³n",
  "Reenviado",
  "Aprobado",
];

function formatCurrency(value: number | null) {
  if (value === null) {
    return "$0";
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
    timeStyle: "short",
  }).format(new Date(value));
}

function isDevuelto(estado: string) {
  return estado.toLowerCase().includes("devuelto");
}

export default function DashboardPage() {
  const session = readSession();
  const isAdmin = session?.rol === "administrador";
  const [oficinas, setOficinas] = useState<Oficina[]>([]);
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadDashboard() {
      setLoading(true);
      setError(null);

      try {
        const [creditosData, seguimientosData, documentosData, oficinasData] =
          await Promise.all([
            apiFetch<Credito[]>("/api/v1/creditos/"),
            apiFetch<Seguimiento[]>("/api/v1/seguimientos/"),
            apiFetch<Documento[]>("/api/v1/documentos/?solo_activos=true"),
            isAdmin
              ? apiFetch<Oficina[]>("/api/v1/oficinas/")
              : Promise.resolve([] as Oficina[]),
          ]);

        if (!ignore) {
          setCreditos(creditosData);
          setSeguimientos(seguimientosData);
          setDocumentos(documentosData);
          setOficinas(oficinasData.filter((oficina) => oficina.is_active !== false));
        }
      } catch (loadError) {
        if (!ignore) {
          setError(
            loadError instanceof ApiError
              ? loadError.message
              : "No se pudo cargar la bandeja operativa",
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    if (session) {
      void loadDashboard();
    }

    return () => {
      ignore = true;
    };
  }, [isAdmin, session?.accessToken]);

  const adminResumen = useMemo(() => {
    const sourceOficinas =
      oficinas.length > 0
        ? oficinas
        : Array.from(new Set(creditos.map((credito) => credito.oficina_id))).map((id) => ({
            id,
            nombre: `Oficina ${id}`,
            is_active: true,
          }));

    return sourceOficinas.map((oficina) => {
      const creditosOficina = creditos.filter((credito) => credito.oficina_id === oficina.id);
      const seguimientosOficina = seguimientos.filter(
        (seguimiento) => seguimiento.oficina_id === oficina.id,
      );
      const creditosConDocumentos = new Set(
        documentos
          .filter((documento) =>
            creditosOficina.some((credito) => credito.id === documento.credito_id),
          )
          .map((documento) => documento.credito_id),
      );

      return {
        oficina,
        total: creditosOficina.length,
        activos: creditosOficina.filter((credito) => estadosActivos.includes(credito.estado)).length,
        prospectos: creditosOficina.filter((credito) => credito.estado === "Prospecto").length,
        enviados: creditosOficina.filter((credito) =>
          ["Enviado a cooperativa", "Reenviado"].includes(credito.estado),
        ).length,
        devueltos: creditosOficina.filter((credito) => isDevuelto(credito.estado)).length,
        aprobados: creditosOficina.filter((credito) => credito.estado === "Aprobado").length,
        documentosPendientes: creditosOficina.filter(
          (credito) => credito.tiene_documentos_pendientes,
        ).length,
        conDocumentos: creditosConDocumentos.size,
        seguimientos: seguimientosOficina.length,
        montoSolicitado: creditosOficina.reduce(
          (total, credito) => total + Number(credito.monto_solicitado),
          0,
        ),
        montoAprobado: creditosOficina.reduce(
          (total, credito) => total + Number(credito.monto_aprobado ?? 0),
          0,
        ),
      };
    });
  }, [creditos, documentos, oficinas, seguimientos]);

  const colaOperativa = useMemo(() => {
    const prospectos = creditos.filter((credito) => credito.estado === "Prospecto");
    const devueltos = creditos.filter((credito) => isDevuelto(credito.estado));
    const documentosPendientes = creditos.filter(
      (credito) => credito.tiene_documentos_pendientes,
    );
    const seguimientosPendientes = seguimientos.filter(
      (seguimiento) => seguimiento.fecha_proximo_contacto,
    );

    return {
      prospectos,
      devueltos,
      documentosPendientes,
      seguimientosPendientes,
      enviados: creditos.filter((credito) =>
        ["Enviado a cooperativa", "Reenviado"].includes(credito.estado),
      ),
    };
  }, [creditos, seguimientos]);

  if (loading) {
    return <EmptyState text="Cargando bandeja operativa..." />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-50 px-5 py-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-stone-500">
              {isAdmin ? "Control por oficina" : "Bandeja de trabajo"}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">
              {isAdmin
                ? "Operacion separada por sede"
                : "Pendientes que necesitan movimiento"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              {isAdmin
                ? "Cada oficina se lee por separado para evitar mezclar resultados. Si se crea una nueva oficina activa, debe aparecer en este resumen."
                : "Esta vista evita reportería pesada: prioriza prospectos, devueltos, documentos pendientes y seguimientos programados."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/pensionados" className="button-primary rounded-lg px-3 py-2 text-sm">
              Buscar contacto
            </Link>
            <Link href="/creditos" className="button-muted rounded-lg px-3 py-2 text-sm">
              Gestionar creditos
            </Link>
          </div>
        </div>
      </div>

      {isAdmin ? (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            {adminResumen.length === 0 ? (
              <EmptyState text="Aun no hay oficinas o creditos para resumir." />
            ) : (
              adminResumen.map((item) => (
                <article
                  key={item.oficina.id}
                  className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-stone-500">
                        Oficina #{item.oficina.id}
                      </p>
                      <h2 className="mt-2 text-xl font-semibold text-stone-950">
                        {item.oficina.nombre}
                      </h2>
                    </div>
                    <span className="rounded-lg bg-teal-950 px-3 py-1 text-xs font-semibold text-white">
                      {item.activos} activos
                    </span>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <Metric label="Prospectos" value={String(item.prospectos)} />
                    <Metric label="En gestion" value={String(item.enviados)} />
                    <Metric label="Devueltos" value={String(item.devueltos)} tone="text-red-700" />
                    <Metric label="Aprobados" value={String(item.aprobados)} />
                    <Metric label="Docs pendientes" value={String(item.documentosPendientes)} />
                    <Metric label="Seguimientos" value={String(item.seguimientos)} />
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <DetailRow label="Solicitado" value={formatCurrency(item.montoSolicitado)} />
                    <DetailRow label="Aprobado" value={formatCurrency(item.montoAprobado)} />
                  </div>
                </article>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Metric label="Prospectos" value={String(colaOperativa.prospectos.length)} />
              <Metric label="Devueltos" value={String(colaOperativa.devueltos.length)} tone="text-red-700" />
              <Metric
                label="Docs pendientes"
                value={String(colaOperativa.documentosPendientes.length)}
                tone="text-amber-700"
              />
              <Metric
                label="Seguimientos"
                value={String(colaOperativa.seguimientosPendientes.length)}
              />
            </div>

            <WorkList
              title="Creditos devueltos por correccion"
              empty="No tienes creditos devueltos por corregir."
              items={colaOperativa.devueltos.map((credito) => ({
                title: `Credito #${credito.id}`,
                meta: `Pensionado #${credito.pensionado_id} · ${formatCurrency(credito.monto_solicitado)}`,
                href: "/creditos",
              }))}
            />

            <WorkList
              title="Documentos pendientes"
              empty="No hay creditos marcados con documentos pendientes."
              items={colaOperativa.documentosPendientes.map((credito) => ({
                title: `Credito #${credito.id}`,
                meta: credito.documentos_pendientes ?? "Pendiente sin detalle",
                href: "/documentos",
              }))}
            />
          </section>

          <aside className="space-y-4">
            <WorkList
              title="Proximos seguimientos"
              empty="No hay seguimientos programados."
              items={colaOperativa.seguimientosPendientes.slice(0, 8).map((seguimiento) => ({
                title: seguimiento.pensionado_nombre ?? `Pensionado #${seguimiento.pensionado_id}`,
                meta: `${seguimiento.tipo} · ${formatDate(seguimiento.fecha_proximo_contacto)}`,
                href: "/pensionados",
              }))}
            />

            <WorkList
              title="Prospectos por enviar"
              empty="No hay prospectos pendientes."
              items={colaOperativa.prospectos.slice(0, 8).map((credito) => ({
                title: `Credito #${credito.id}`,
                meta: `Pensionado #${credito.pensionado_id} · ${formatCurrency(credito.monto_solicitado)}`,
                href: "/creditos",
              }))}
            />
          </aside>
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  tone = "text-stone-950",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-stone-800/10 bg-white/75 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-800/10 bg-white/65 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-stone-900">{value}</p>
    </div>
  );
}

function WorkList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{ title: string; meta: string; href: string }>;
}) {
  return (
    <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
      <h2 className="text-lg font-semibold text-stone-950">{title}</h2>
      <div className="mt-4 space-y-2">
        {items.length === 0 ? (
          <EmptyState text={empty} />
        ) : (
          items.map((item) => (
            <Link
              key={`${item.title}-${item.meta}`}
              href={item.href}
              className="block rounded-xl border border-stone-800/10 bg-white/70 px-4 py-3 transition hover:bg-white"
            >
              <p className="text-sm font-semibold text-stone-950">{item.title}</p>
              <p className="mt-1 text-xs leading-5 text-stone-600">{item.meta}</p>
            </Link>
          ))
        )}
      </div>
    </article>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-800/15 bg-white/45 px-5 py-6 text-center text-sm text-stone-500">
      {text}
    </div>
  );
}
