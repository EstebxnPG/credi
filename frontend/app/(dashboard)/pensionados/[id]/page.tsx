"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { readSession } from "@/lib/session";

type Pensionado = {
  id: number;
  nombre: string;
  segundo_nombre: string | null;
  apellidos: string;
  genero: string;
  nombre_completo: string;
  documento: string;
  fecha_nacimiento: string;
  telefono: string | null;
  celular: string | null;
  direccion: string;
  fecha_inicio_pension: string;
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

type LogItem = {
  id: number;
  usuario_id: number;
  tabla_afectada: string;
  registro_afectado: number;
  tipo_accion: string;
  valores_antes: Record<string, unknown> | null;
  valores_despues: Record<string, unknown> | null;
  created_at: string;
};

const views = [
  { key: "creditos", label: "Creditos" },
  { key: "seguimientos", label: "Seguimientos" },
  { key: "actualizaciones", label: "Actualizaciones" },
] as const;

type ViewKey = (typeof views)[number]["key"];

export default function PensionadoDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const pensionadoId = Number(params.id);
  const selectedView = normalizeView(searchParams.get("vista"));
  const session = readSession();

  const [pensionado, setPensionado] = useState<Pensionado | null>(null);
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const [pensionadoData, creditosData, seguimientosData] = await Promise.all([
          apiFetch<Pensionado>(`/api/v1/pensionados/${pensionadoId}`),
          apiFetch<Credito[]>(`/api/v1/creditos/?pensionado_id=${pensionadoId}`),
          apiFetch<Seguimiento[]>(`/api/v1/seguimientos/?pensionado_id=${pensionadoId}`),
        ]);

        if (!ignore) {
          setPensionado(pensionadoData);
          setCreditos(creditosData);
          setSeguimientos(seguimientosData);
        }

        if (session?.rol === "administrador") {
          try {
            const logsData = await apiFetch<LogItem[]>(
              "/api/v1/logs/?tabla_afectada=pensionados",
            );
            if (!ignore) {
              setLogs(logsData.filter((item) => item.registro_afectado === pensionadoId));
            }
          } catch (loadLogsError) {
            if (!ignore) {
              setLogsError(
                loadLogsError instanceof ApiError
                  ? loadLogsError.message
                  : "No se pudieron cargar las actualizaciones",
              );
            }
          }
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
  }, [pensionadoId, session?.rol]);

  const resumen = useMemo(() => {
    const activos = creditos.filter((credito) =>
      ["Prospecto", "Enviado a cooperativa", "Devuelto por correccion", "Reenviado"].includes(
        credito.estado,
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

  if (loading) {
    return <StateMessage text="Cargando ficha del pensionado..." />;
  }

  if (error || !pensionado) {
    return <StateMessage tone="error" text={error ?? "Pensionado no encontrado"} />;
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-4">
        <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Link href="/pensionados" className="text-xs font-semibold text-teal-700">
                Volver a pensionados
              </Link>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-stone-950">
                {pensionado.nombre_completo}
              </h1>
              <p className="mt-2 text-sm text-stone-600">
                Documento {pensionado.documento} - {pensionado.direccion}
              </p>
            </div>

            <div className="rounded-xl border border-stone-800/10 bg-white/70 px-4 py-3 text-sm text-stone-700">
              Numero de Contacto:{" "}
              <span className="font-semibold text-stone-950">
                {pensionado.celular ?? pensionado.telefono ?? "Sin telefono"}
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Creditos" value={String(resumen.creditos)} />
            <Metric label="Activos" value={String(resumen.activos)} />
            <Metric label="Seguimientos" value={String(resumen.seguimientos)} />
            <Metric label="Solicitado" value={formatCurrency(resumen.montoSolicitado)} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Detail label="Nombre" value={pensionado.nombre} />
            <Detail label="Segundo nombre" value={pensionado.segundo_nombre ?? "Sin registrar"} />
            <Detail label="Apellidos" value={pensionado.apellidos} />
            <Detail label="Genero" value={pensionado.genero} />
            <Detail label="Nacimiento" value={formatDate(pensionado.fecha_nacimiento)} />
            <Detail
              label="Inicio pension"
              value={formatDate(pensionado.fecha_inicio_pension)}
            />
          </div>
        </article>

        {selectedView === "creditos" ? <CreditosList creditos={creditos} /> : null}
        {selectedView === "seguimientos" ? (
          <SeguimientosList seguimientos={seguimientos} />
        ) : null}
        {selectedView === "actualizaciones" ? (
          <ActualizacionesList
            logs={logs}
            logsError={logsError}
            isAdmin={session?.rol === "administrador"}
          />
        ) : null}
      </div>

      <aside className="rounded-2xl border border-stone-800/10 bg-white/85 p-4 shadow-lg shadow-stone-900/5 xl:sticky xl:top-28 xl:self-start">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">
          Ficha
        </p>
        <nav className="mt-4 space-y-2">
          {views.map((view) => (
            <Link
              key={view.key}
              href={`/pensionados/${pensionado.id}?vista=${view.key}`}
              className={[
                "block rounded-xl border px-4 py-3 text-sm font-medium transition",
                selectedView === view.key
                  ? "border-teal-700/20 bg-teal-950 text-white"
                  : "border-stone-800/10 bg-white/65 text-stone-700 hover:bg-white",
              ].join(" ")}
            >
              {view.label}
            </Link>
          ))}
        </nav>
      </aside>
    </section>
  );
}

function normalizeView(value: string | null): ViewKey {
  return views.some((view) => view.key === value) ? (value as ViewKey) : "creditos";
}

function CreditosList({ creditos }: { creditos: Credito[] }) {
  return (
    <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
      <h2 className="text-lg font-semibold text-stone-950">Creditos del pensionado</h2>
      <div className="mt-4 divide-y divide-stone-800/10">
        {creditos.map((credito) => (
          <Link
            key={credito.id}
            href={`/creditos/${credito.id}`}
            className="grid gap-2 py-4 text-sm transition hover:bg-teal-50/60 sm:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <span className="font-semibold text-stone-950">Credito #{credito.id}</span>
            <span className="text-stone-700">{credito.estado}</span>
            <span className="text-stone-700">{formatCurrency(credito.monto_solicitado)}</span>
            <span className="text-stone-500">{formatDate(credito.fecha_registro)}</span>
          </Link>
        ))}

        {creditos.length === 0 ? (
          <p className="py-6 text-sm text-stone-500">Este pensionado no tiene creditos.</p>
        ) : null}
      </div>
    </article>
  );
}

function SeguimientosList({ seguimientos }: { seguimientos: Seguimiento[] }) {
  return (
    <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
      <h2 className="text-lg font-semibold text-stone-950">Seguimientos</h2>
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
    <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
      <h2 className="text-lg font-semibold text-stone-950">Actualizaciones</h2>
      <div className="mt-4 divide-y divide-stone-800/10">
        {logs.map((log) => (
          <div key={log.id} className="py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-stone-950">{log.tipo_accion}</p>
              <p className="text-xs text-stone-500">{formatDateTime(log.created_at)}</p>
            </div>
            <pre className="mt-3 overflow-auto rounded-xl bg-stone-950 p-3 text-xs text-stone-100">
              {JSON.stringify(log.valores_despues ?? log.valores_antes ?? {}, null, 2)}
            </pre>
          </div>
        ))}

        {logs.length === 0 ? (
          <p className="py-6 text-sm text-stone-500">No hay actualizaciones registradas.</p>
        ) : null}
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-800/10 bg-white/65 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-stone-950">{value}</p>
    </div>
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
