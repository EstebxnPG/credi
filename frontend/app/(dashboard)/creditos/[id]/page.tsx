"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

type Credito = {
  id: number;
  pensionado_id: number;
  asesor_id: number;
  oficina_id: number;
  cooperativa_id: number;
  pagaduria_id: number;
  nro_libranza: string | null;
  tipo_credito: string | null;
  monto_solicitado: number;
  monto_aprobado: number | null;
  plazo: number;
  estado: string;
  tasa_mensual: number | null;
  valor_cuota: number | null;
  fecha_desembolso: string | null;
  fecha_fin_estimada: string | null;
  nro_afiliacion: string | null;
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

export default function CreditoDetailPage() {
  const params = useParams<{ id: string }>();
  const creditoId = Number(params.id);
  const [credito, setCredito] = useState<Credito | null>(null);
  const [historial, setHistorial] = useState<HistorialCredito[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const [creditoData, historialData, documentosData] = await Promise.all([
          apiFetch<Credito>(`/api/v1/creditos/${creditoId}`),
          apiFetch<HistorialCredito[]>(`/api/v1/creditos/${creditoId}/historial`),
          apiFetch<Documento[]>(`/api/v1/documentos/?credito_id=${creditoId}`),
        ]);

        if (!ignore) {
          setCredito(creditoData);
          setHistorial(historialData);
          setDocumentos(documentosData);
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

  if (loading) {
    return <StateMessage text="Cargando credito..." />;
  }

  if (error || !credito) {
    return <StateMessage tone="error" text={error ?? "Credito no encontrado"} />;
  }

  return (
    <section className="space-y-4">
      <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
        <Link
          href={`/pensionados/${credito.pensionado_id}?vista=creditos`}
          className="text-xs font-semibold text-teal-700"
        >
          Volver al pensionado
        </Link>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-stone-950">
              Credito #{credito.id}
            </h1>
            <p className="mt-2 text-sm text-stone-600">
              Estado actual: <span className="font-semibold">{credito.estado}</span>
            </p>
          </div>
          <div className="rounded-xl border border-stone-800/10 bg-white/70 px-4 py-3 text-sm text-stone-700">
            Registrado {formatDate(credito.fecha_registro)}
          </div>
        </div>
      </article>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
          <h2 className="text-lg font-semibold text-stone-950">Datos del credito</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Detail label="Solicitado" value={formatCurrency(credito.monto_solicitado)} />
            <Detail label="Aprobado" value={formatCurrency(credito.monto_aprobado)} />
            <Detail label="Plazo" value={`${credito.plazo} meses`} />
            <Detail label="Cuota" value={formatCurrency(credito.valor_cuota)} />
            <Detail label="Tipo" value={credito.tipo_credito ?? "Sin tipo"} />
            <Detail label="Libranza" value={credito.nro_libranza ?? "Sin libranza"} />
          </div>
          {credito.observaciones ? (
            <p className="mt-4 rounded-xl border border-stone-800/10 bg-white/65 px-4 py-3 text-sm text-stone-700">
              {credito.observaciones}
            </p>
          ) : null}
        </article>

        <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
          <h2 className="text-lg font-semibold text-stone-950">Documentos</h2>
          <div className="mt-4 divide-y divide-stone-800/10">
            {documentos.map((documento) => (
              <div key={documento.id} className="py-3 text-sm">
                <p className="font-semibold text-stone-950">{documento.nombre}</p>
                <p className="mt-1 text-stone-500">
                  {documento.tipo} - version {documento.version} -{" "}
                  {formatDateTime(documento.created_at)}
                </p>
              </div>
            ))}
            {documentos.length === 0 ? (
              <p className="py-6 text-sm text-stone-500">No hay documentos cargados.</p>
            ) : null}
          </div>
        </article>
      </div>

      <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
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
              <p className="mt-2 text-stone-600">
                {item.observacion ?? "Sin observacion"}{" "}
                {item.usuario_nombre ? `por ${item.usuario_nombre}` : ""}
              </p>
            </div>
          ))}
        </div>
      </article>
    </section>
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
