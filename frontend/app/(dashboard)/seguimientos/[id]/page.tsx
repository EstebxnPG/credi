"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

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
  comentario: string;
  resultado: string | null;
  fecha_proximo_contacto: string | null;
  created_at: string;
  is_active: boolean;
};

export default function SeguimientoDetailPage() {
  const params = useParams<{ id: string }>();
  const seguimientoId = Number(params.id);
  const [seguimiento, setSeguimiento] = useState<Seguimiento | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(seguimientoId)) {
      setError("Seguimiento invalido");
      setLoading(false);
      return;
    }

    let ignore = false;

    async function loadSeguimiento() {
      setLoading(true);
      setError(null);

      try {
        const data = await apiFetch<Seguimiento>(`/api/v1/seguimientos/${seguimientoId}`);
        if (!ignore) {
          setSeguimiento(data);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(
            loadError instanceof ApiError
              ? loadError.message
              : "No se pudo cargar el seguimiento",
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadSeguimiento();

    return () => {
      ignore = true;
    };
  }, [seguimientoId]);

  if (loading) {
    return <StateMessage text="Cargando seguimiento..." />;
  }

  if (error || !seguimiento) {
    return <StateMessage tone="error" text={error ?? "Seguimiento no encontrado"} />;
  }

  return (
    <section className="space-y-4">
      <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
        <Link
          href={`/pensionados/${seguimiento.pensionado_id}?vista=seguimientos`}
          className="text-xs font-semibold text-teal-700"
        >
          Volver al pensionado
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-stone-950">
          Seguimiento #{seguimiento.id}
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          {seguimiento.pensionado_nombre ?? "Pensionado"} -{" "}
          {seguimiento.pensionado_documento ?? "sin documento"}
        </p>
      </article>

      <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Detail label="Tipo" value={seguimiento.tipo} />
          <Detail label="Usuario" value={seguimiento.usuario_nombre ?? "Sin usuario"} />
          <Detail label="Oficina" value={seguimiento.oficina_nombre ?? "Sin oficina"} />
          <Detail label="Creado" value={formatDateTime(seguimiento.created_at)} />
        </div>

        <div className="mt-4 rounded-xl border border-stone-800/10 bg-white/65 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Comentario</p>
          <p className="mt-2 text-sm text-stone-800">{seguimiento.comentario}</p>
        </div>

        {seguimiento.resultado ? (
          <div className="mt-3 rounded-xl border border-stone-800/10 bg-white/65 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Resultado</p>
            <p className="mt-2 text-sm text-stone-800">{seguimiento.resultado}</p>
          </div>
        ) : null}

        {seguimiento.fecha_proximo_contacto ? (
          <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-50 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-amber-700">
              Proximo contacto
            </p>
            <p className="mt-2 text-sm font-semibold text-amber-900">
              {formatDateTime(seguimiento.fecha_proximo_contacto)}
            </p>
          </div>
        ) : null}
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
