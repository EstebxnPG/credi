"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";

type Usuario = {
  id: number;
  nombre: string;
  documento: string;
  correo: string;
  rol: string;
  oficina_id: number;
  is_active: boolean;
};

type Oficina = {
  id: number;
  nombre: string;
};

type Credito = {
  id: number;
  asesor_id: number;
  estado: string;
  monto_solicitado: number;
  monto_aprobado: number | null;
  fecha_registro: string;
};

type Seguimiento = {
  id: number;
  usuario_id: number;
  pensionado_nombre: string | null;
  tipo: string;
  comentario: string;
  resultado: string | null;
  created_at: string;
};

type Pendiente = {
  id: number;
  credito_id: number;
  descripcion: string;
  estado: string;
  created_by: number;
  resolved_by: number | null;
  created_at: string;
  resolved_at: string | null;
};

type LogItem = {
  id: number;
  usuario_id: number;
  tabla_afectada: string;
  registro_afectado: number;
  tipo_accion: string;
  valores_despues: Record<string, unknown> | null;
  created_at: string;
};

type LogPage = {
  items: LogItem[];
  total: number;
  page: number;
  page_size: number;
};

export default function AsesoraReportPage() {
  const params = useParams<{ id: string }>();
  const asesoraId = Number(params.id);
  const [asesora, setAsesora] = useState<Usuario | null>(null);
  const [oficinas, setOficinas] = useState<Oficina[]>([]);
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(asesoraId)) {
      setError("Ejecutiva invalida");
      setLoading(false);
      return;
    }

    let ignore = false;
    async function loadDetail() {
      setLoading(true);
      setError(null);
      try {
        const [usuarioData, oficinasData, creditosData, seguimientosData, pendientesData, logsData] =
          await Promise.all([
            apiFetch<Usuario>(`/api/v1/usuarios/${asesoraId}`),
            apiFetch<Oficina[]>("/api/v1/oficinas/?solo_activas=false"),
            apiFetch<Credito[]>("/api/v1/creditos/?limit=15"),
            apiFetch<Seguimiento[]>(`/api/v1/seguimientos/?usuario_id=${asesoraId}&limit=15`),
            apiFetch<Pendiente[]>("/api/v1/pendientes-credito/?limit=15"),
            apiFetch<LogPage>(`/api/v1/logs/?usuario_id=${asesoraId}&page_size=100`),
          ]);
        if (!ignore) {
          setAsesora(usuarioData);
          setOficinas(oficinasData);
          setCreditos(creditosData);
          setSeguimientos(seguimientosData);
          setPendientes(pendientesData);
          setLogs(logsData.items);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(
            loadError instanceof ApiError
              ? loadError.message
              : "No se pudo cargar el reporte de la ejecutiva",
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
  }, [asesoraId]);

  const filteredLogs = useMemo(
    () => logs.filter((item) => inDateRange(item.created_at, desde, hasta)),
    [desde, hasta, logs],
  );
  const filteredSeguimientos = useMemo(
    () => seguimientos.filter((item) => inDateRange(item.created_at, desde, hasta)),
    [desde, hasta, seguimientos],
  );
  const assignedCredits = useMemo(
    () =>
      creditos.filter(
        (item) =>
          item.asesor_id === asesoraId && inDateRange(item.fecha_registro, desde, hasta),
      ),
    [asesoraId, creditos, desde, hasta],
  );
  const resolvedPendientes = useMemo(
    () =>
      pendientes.filter(
        (item) =>
          item.resolved_by === asesoraId &&
          item.resolved_at &&
          inDateRange(item.resolved_at, desde, hasta),
      ),
    [asesoraId, desde, hasta, pendientes],
  );
  const createdPendientes = useMemo(
    () =>
      pendientes.filter(
        (item) => item.created_by === asesoraId && inDateRange(item.created_at, desde, hasta),
      ),
    [asesoraId, desde, hasta, pendientes],
  );

  const createdCreditIds = useMemo(
    () =>
      new Set(
        filteredLogs
          .filter((item) => item.tabla_afectada === "creditos" && item.tipo_accion === "crear")
          .map((item) => item.registro_afectado),
      ),
    [filteredLogs],
  );
  const approvedCreditIds = useMemo(
    () =>
      new Set(
        filteredLogs
          .filter(
            (item) =>
              item.tabla_afectada === "creditos" &&
              item.tipo_accion === "cambiar_estado" &&
              item.valores_despues?.estado === "Aprobado",
          )
          .map((item) => item.registro_afectado),
      ),
    [filteredLogs],
  );
  const documentsCreated = filteredLogs.filter(
    (item) => item.tabla_afectada === "documentos" && item.tipo_accion === "crear",
  ).length;
  const approvedAssigned = assignedCredits.filter((item) => item.estado === "Aprobado");
  const officeName =
    oficinas.find((item) => item.id === asesora?.oficina_id)?.nombre ?? "Sin oficina";

  if (loading) {
    return <StateMessage text="Cargando metricas de la ejecutiva..." />;
  }
  if (error || !asesora) {
    return <StateMessage tone="error" text={error ?? "Ejecutiva no encontrada"} />;
  }

  return (
    <section className="space-y-3">
      <header className="border-b border-stone-800/10 pb-3">
        <Link href="/reportes" className="text-sm font-semibold text-teal-800">
          Volver a reportes
        </Link>
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
              Ejecutiva operativa
            </p>
            <h1 className="mt-2 text-xl font-semibold text-stone-950">{asesora.nombre}</h1>
            <p className="mt-1 text-sm text-stone-600">
              {asesora.correo} · {officeName} · {asesora.rol}
            </p>
          </div>
          <span className="text-sm font-medium text-stone-600">
            {asesora.is_active ? "Activa" : "Inactiva"}
          </span>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-[180px_180px_auto_auto] sm:items-end">
        <DateField label="Desde" value={desde} onChange={setDesde} />
        <DateField label="Hasta" value={hasta} onChange={setHasta} />
        <button
          type="button"
          className="button-muted h-11 px-4"
          onClick={() => {
            const today = localDateValue(new Date());
            setDesde(today);
            setHasta(today);
          }}
        >
          Hoy
        </button>
        <button
          type="button"
          className="button-muted h-11 px-4"
          disabled={!desde && !hasta}
          onClick={() => {
            setDesde("");
            setHasta("");
          }}
        >
          Limpiar fechas
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Creditos asignados" value={String(assignedCredits.length)} />
        <Metric label="Creditos creados" value={String(createdCreditIds.size)} />
        <Metric label="Aprobaciones ejecutadas" value={String(approvedCreditIds.size)} />
        <Metric label="Pendientes resueltos" value={String(resolvedPendientes.length)} />
        <Metric label="Seguimientos" value={String(filteredSeguimientos.length)} />
        <Metric label="Pendientes creados" value={String(createdPendientes.length)} />
        <Metric label="Documentos adjuntados" value={String(documentsCreated)} />
        <Metric
          label="Monto aprobado asignado"
          value={formatCurrency(
            approvedAssigned.reduce(
              (total, item) => total + Number(item.monto_aprobado ?? 0),
              0,
            ),
          )}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <ReportTable title="Creditos asignados" headers={["Credito", "Estado", "Solicitado", "Aprobado", "Registro"]}>
          {assignedCredits.map((item) => (
            <tr key={item.id}>
              <Cell><Link className="font-semibold text-teal-800" href={`/creditos/${item.id}`}>#{item.id}</Link></Cell>
              <Cell>{item.estado}</Cell>
              <Cell>{formatCurrency(item.monto_solicitado)}</Cell>
              <Cell>{formatCurrency(item.monto_aprobado)}</Cell>
              <Cell>{formatDateTime(item.fecha_registro)}</Cell>
            </tr>
          ))}
        </ReportTable>

        <ReportTable title="Pendientes resueltos" headers={["Credito", "Descripcion", "Resolucion"]}>
          {resolvedPendientes.map((item) => (
            <tr key={item.id}>
              <Cell><Link className="font-semibold text-teal-800" href={`/creditos/${item.credito_id}`}>#{item.credito_id}</Link></Cell>
              <Cell>{item.descripcion}</Cell>
              <Cell>{item.resolved_at ? formatDateTime(item.resolved_at) : "Sin fecha"}</Cell>
            </tr>
          ))}
        </ReportTable>
      </div>

      <ReportTable title="Actividad ejecutada" headers={["Fecha", "Modulo", "Accion", "Registro", "Detalle"]}>
        {filteredLogs.map((item) => (
          <tr key={item.id}>
            <Cell>{formatDateTime(item.created_at)}</Cell>
            <Cell>{moduleLabel(item.tabla_afectada)}</Cell>
            <Cell>{actionLabel(item)}</Cell>
            <Cell>
              {item.tabla_afectada === "creditos" ? (
                <Link className="font-semibold text-teal-800" href={`/creditos/${item.registro_afectado}`}>
                  #{item.registro_afectado}
                </Link>
              ) : (
                `#${item.registro_afectado}`
              )}
            </Cell>
            <Cell>{activityDetail(item)}</Cell>
          </tr>
        ))}
      </ReportTable>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-stone-800/10 px-1 py-3">
      <p className="text-xs uppercase tracking-[0.14em] text-stone-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-stone-950">{value}</p>
    </div>
  );
}

function ReportTable({
  title,
  headers,
  children,
}: {
  title: string;
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-stone-950">{title}</h2>
      <div className="mt-3 overflow-x-auto border-y border-stone-800/10 bg-white/70">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-stone-800/10 bg-stone-50 text-xs uppercase tracking-[0.12em] text-stone-500">
            <tr>
              {headers.map((header) => (
                <th key={header} className="whitespace-nowrap px-4 py-3 font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-800/10 text-stone-700">{children}</tbody>
        </table>
      </div>
    </section>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="max-w-96 px-4 py-3 align-top">{children}</td>;
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-medium text-stone-600">
      <span className="mb-1 block">{label}</span>
      <input
        className="input-base"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function moduleLabel(value: string) {
  const labels: Record<string, string> = {
    creditos: "Creditos",
    documentos: "Documentos",
    pendientes_credito: "Pendientes",
    seguimientos: "Seguimientos",
    refinanciaciones: "Refinanciaciones",
  };
  return labels[value] ?? value;
}

function actionLabel(item: LogItem) {
  if (item.tabla_afectada === "creditos" && item.tipo_accion === "cambiar_estado") {
    return `Cambio a ${String(item.valores_despues?.estado ?? "otro estado")}`;
  }
  const labels: Record<string, string> = {
    crear: "Creo registro",
    actualizar: "Actualizo registro",
    resolver: "Resolvio pendiente",
    desactivar: "Elimino registro",
    reemplazar: "Reemplazo documento",
  };
  return labels[item.tipo_accion] ?? item.tipo_accion;
}

function activityDetail(item: LogItem) {
  if (item.tabla_afectada === "creditos" && item.tipo_accion === "cambiar_estado") {
    const monto = item.valores_despues?.monto_aprobado;
    return monto ? `Monto aprobado ${formatCurrency(Number(monto))}` : "Cambio de estado";
  }
  if (item.tabla_afectada === "documentos") {
    return String(item.valores_despues?.nombre ?? "Documento");
  }
  if (item.tabla_afectada === "pendientes_credito") {
    return String(
      item.valores_despues?.observacion_resolucion ??
        item.valores_despues?.descripcion ??
        "Gestion de pendiente",
    );
  }
  return "Actividad registrada";
}

function inDateRange(value: string, desde: string, hasta: string) {
  const date = value.slice(0, 10);
  return (!desde || date >= desde) && (!hasta || date <= hasta);
}

function localDateValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
        "border px-5 py-4 text-sm",
        tone === "error"
          ? "border-red-500/20 bg-red-50 text-red-700"
          : "border-stone-800/10 bg-white text-stone-500",
      ].join(" ")}
    >
      {text}
    </div>
  );
}
