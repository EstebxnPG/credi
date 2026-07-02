"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

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
  estado: string;
  comentario: string;
  resultado: string | null;
  fecha_proximo_contacto: string | null;
  created_at: string;
  is_active: boolean;
  soluciones: SeguimientoSolucion[];
};

type SeguimientoSolucion = {
  id: number;
  seguimiento_id: number;
  usuario_id: number;
  usuario_nombre: string | null;
  comentario: string;
  resultado: string | null;
  estado_resultante: string | null;
  fecha_proximo_contacto: string | null;
  created_at: string;
};

const estados = [
  { value: "abierto", label: "Abierto" },
  { value: "pendiente", label: "Pendiente" },
  { value: "esperando", label: "Esperando" },
  { value: "cerrado", label: "Cerrado" },
];

const emptySolucion = {
  comentario: "",
  resultado: "",
  estado_resultante: "cerrado",
  fecha_proximo_contacto: "",
};

export default function SeguimientoDetailPage() {
  const params = useParams<{ id: string }>();
  const seguimientoId = Number(params.id);
  const [seguimiento, setSeguimiento] = useState<Seguimiento | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptySolucion);
  const [formError, setFormError] = useState<string | null>(null);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!seguimiento) {
      return;
    }
    if (form.comentario.trim().length < 5) {
      setFormError("La solucion debe tener al menos 5 caracteres.");
      return;
    }
    if (form.estado_resultante === "pendiente" && !form.fecha_proximo_contacto) {
      setFormError("Pendiente exige fecha y hora de proximo contacto.");
      return;
    }
    if (form.fecha_proximo_contacto && !isBusinessTime(form.fecha_proximo_contacto)) {
      setFormError("Agenda seguimientos solo entre 8:00 a.m. y 5:30 p.m.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const updated = await apiFetch<Seguimiento>(`/api/v1/seguimientos/${seguimiento.id}/soluciones`, {
        method: "POST",
        body: JSON.stringify({
          comentario: form.comentario.trim(),
          resultado: nullableText(form.resultado),
          estado_resultante: form.estado_resultante,
          fecha_proximo_contacto: form.fecha_proximo_contacto
            ? new Date(form.fecha_proximo_contacto).toISOString()
            : null,
        }),
      });
      setSeguimiento(updated);
      setForm(emptySolucion);
    } catch (saveError) {
      setFormError(saveError instanceof ApiError ? saveError.message : "No se pudo guardar la solucion");
    } finally {
      setSaving(false);
    }
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
          <Detail label="Estado" value={estadoLabel(seguimiento.estado)} />
          <Detail label="Usuario" value={seguimiento.usuario_nombre ?? "Sin usuario"} />
          <Detail label="Oficina" value={seguimiento.oficina_nombre ?? "Sin oficina"} />
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

      <article className="rounded-2xl border border-stone-800/10 bg-white/85 p-5 shadow-lg shadow-stone-900/5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-stone-950">Soluciones</h2>
            <p className="text-sm text-stone-500">Cada respuesta queda asociada al asesor que la registra.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 grid gap-4 rounded-xl border border-stone-800/10 bg-white/65 p-4 sm:grid-cols-2">
          {formError ? <div className="sm:col-span-2"><StateMessage tone="error" text={formError} /></div> : null}
          <label className="block text-sm font-medium text-stone-700 sm:col-span-2">
            <span>Solucion</span>
            <textarea
              className="input-base mt-2 min-h-24"
              value={form.comentario}
              onChange={(event) => setForm({ ...form, comentario: event.target.value })}
              placeholder="Ej: Carlos llamo y el cliente pidio reintentar manana."
              required
            />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            <span>Resultado</span>
            <input
              className="input-base mt-2"
              value={form.resultado}
              onChange={(event) => setForm({ ...form, resultado: event.target.value })}
              placeholder="Ej: no_contesto, gestionado, documentos"
            />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            <span>Estado resultante</span>
            <select
              className="input-base mt-2"
              value={form.estado_resultante}
              onChange={(event) => setForm({ ...form, estado_resultante: event.target.value })}
            >
              {estados.map((estado) => (
                <option key={estado.value} value={estado.value}>{estado.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-stone-700">
            <span>Proximo contacto</span>
            <input
              className="input-base mt-2"
              type="datetime-local"
              step={1800}
              value={form.fecha_proximo_contacto}
              onChange={(event) => setForm({ ...form, fecha_proximo_contacto: event.target.value })}
            />
          </label>
          <div className="flex items-end justify-end">
            <button type="submit" className="button-primary w-full sm:w-auto" disabled={saving}>
              {saving ? "Guardando..." : "Agregar solucion"}
            </button>
          </div>
        </form>

        <div className="mt-4 divide-y divide-stone-800/10">
          {seguimiento.soluciones.map((solucion) => (
            <div key={solucion.id} className="py-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-stone-950">
                  {solucion.usuario_nombre ?? `Usuario #${solucion.usuario_id}`}
                </p>
                <p className="text-xs text-stone-500">{formatDateTime(solucion.created_at)}</p>
              </div>
              <p className="mt-2 text-sm text-stone-800">{solucion.comentario}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-stone-600">
                {solucion.resultado ? <span className="rounded-full bg-stone-100 px-2.5 py-1">{solucion.resultado}</span> : null}
                {solucion.estado_resultante ? <span className="rounded-full bg-stone-100 px-2.5 py-1">{estadoLabel(solucion.estado_resultante)}</span> : null}
                {solucion.fecha_proximo_contacto ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">{formatDateTime(solucion.fecha_proximo_contacto)}</span> : null}
              </div>
            </div>
          ))}
          {seguimiento.soluciones.length === 0 ? (
            <p className="py-6 text-sm text-stone-500">Aun no hay soluciones registradas.</p>
          ) : null}
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

function estadoLabel(value: string) {
  return estados.find((estado) => estado.value === value)?.label ?? value;
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
