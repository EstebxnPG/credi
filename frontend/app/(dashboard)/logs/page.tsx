"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError, apiFetch } from "@/lib/api";
import { readSession } from "@/lib/session";

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

type Usuario = {
  id: number;
  nombre: string;
};

export default function LogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [usuarioId, setUsuarioId] = useState("");
  const [tabla, setTabla] = useState("");
  const [accion, setAccion] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = readSession();
    if (!session) {
      router.replace("/login?message=Inicia sesion para revisar logs");
      return;
    }
  }, [router]);

  async function loadUsuarios() {
    const data = await apiFetch<Usuario[]>("/api/v1/usuarios/");
    setUsuarios(data);
  }

  async function loadLogs() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (usuarioId) {
        params.set("usuario_id", usuarioId);
      }
      if (tabla) {
        params.set("tabla_afectada", tabla);
      }
      if (accion) {
        params.set("tipo_accion", accion);
      }
      if (fechaDesde) {
        params.set("fecha_desde", `${fechaDesde}T00:00:00`);
      }
      if (fechaHasta) {
        params.set("fecha_hasta", `${fechaHasta}T23:59:59`);
      }

      const query = params.toString();
      const data = await apiFetch<LogItem[]>(`/api/v1/logs/${query ? `?${query}` : ""}`);
      setLogs(data);
      setSelectedId((current) => {
        if (current && data.some((item) => item.id === current)) {
          return current;
        }
        return data[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : "No se pudieron cargar los logs",
      );
      setLogs([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function loadInitialData() {
      try {
        await loadUsuarios();
        await loadLogs();
      } catch (loadError) {
        setError(
          loadError instanceof ApiError
            ? loadError.message
            : "No se pudo cargar el modulo de logs",
        );
        setLoading(false);
      }
    }

    void loadInitialData();
  }, []);

  const selectedLog = useMemo(
    () => logs.find((item) => item.id === selectedId) ?? null,
    [logs, selectedId],
  );

  const usuariosMap = useMemo(() => {
    return new Map(usuarios.map((usuario) => [usuario.id, usuario.nombre]));
  }, [usuarios]);

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <article className="glass-panel p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-stone-500">
            Auditoria
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
            Logs del sistema
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600">
            Aqui revisas quien hizo que, sobre que tabla y en que momento. No es
            una pantalla glamorosa, pero es la diferencia entre adivinar y auditar.
          </p>
        </article>

        <article className="glass-panel p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
            Filtros
          </p>

          <div className="mt-4 space-y-3">
            <SelectField
              label="Usuario"
              value={usuarioId}
              onChange={setUsuarioId}
              options={[
                { value: "", label: "Todos" },
                ...usuarios.map((usuario) => ({
                  value: String(usuario.id),
                  label: usuario.nombre,
                })),
              ]}
            />

            <InputField label="Tabla afectada" value={tabla} onChange={setTabla} />
            <InputField label="Tipo accion" value={accion} onChange={setAccion} />

            <div className="grid gap-3 md:grid-cols-2">
              <InputField
                label="Fecha desde"
                type="date"
                value={fechaDesde}
                onChange={setFechaDesde}
              />
              <InputField
                label="Fecha hasta"
                type="date"
                value={fechaHasta}
                onChange={setFechaHasta}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" className="button-primary" onClick={() => void loadLogs()}>
                Aplicar filtros
              </button>
              <button
                type="button"
                className="button-muted"
                onClick={() => {
                  setUsuarioId("");
                  setTabla("");
                  setAccion("");
                  setFechaDesde("");
                  setFechaHasta("");
                  void loadLogs();
                }}
              >
                Limpiar
              </button>
            </div>
          </div>
        </article>
      </div>

      {error ? (
        <div className="rounded-3xl border border-red-500/20 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)]">
        <article className="glass-panel overflow-hidden">
          <div className="border-b border-stone-800/10 px-6 py-5">
            <h2 className="text-xl font-semibold text-stone-950">Actividad registrada</h2>
            <p className="mt-1 text-sm text-stone-500">
              Selecciona un log para inspeccionar valores antes y despues.
            </p>
          </div>

          <div className="space-y-3 p-4">
            {loading ? (
              <EmptyState text="Cargando logs..." />
            ) : logs.length === 0 ? (
              <EmptyState text="No hay logs para los filtros actuales." />
            ) : (
              logs.map((item) => {
                const active = item.id === selectedId;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={[
                      "w-full rounded-3xl border px-5 py-4 text-left transition",
                      active
                        ? "border-teal-700/20 bg-teal-950 text-white shadow-xl shadow-teal-950/15"
                        : "border-stone-800/10 bg-white/65 hover:bg-white/90",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] opacity-70">
                          Log #{item.id}
                        </p>
                        <h3 className="mt-2 text-xl font-semibold">
                          {item.tabla_afectada} · {item.tipo_accion}
                        </h3>
                        <p className="mt-1 text-sm opacity-80">
                          {usuariosMap.get(item.usuario_id) ?? `Usuario #${item.usuario_id}`}
                        </p>
                      </div>
                      <p className="text-xs opacity-70">{formatDate(item.created_at)}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </article>

        <article className="glass-panel p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
            Detalle del log
          </p>

          {!selectedLog ? (
            <EmptyState text="Selecciona un log para revisar su detalle." />
          ) : (
            <div className="mt-5 space-y-4">
              <DetailRow
                label="Usuario"
                value={usuariosMap.get(selectedLog.usuario_id) ?? `Usuario #${selectedLog.usuario_id}`}
              />
              <DetailRow label="Tabla" value={selectedLog.tabla_afectada} />
              <DetailRow label="Registro afectado" value={String(selectedLog.registro_afectado)} />
              <DetailRow label="Accion" value={selectedLog.tipo_accion} />
              <DetailRow label="Fecha" value={formatDate(selectedLog.created_at)} />
              <JsonBlock title="Valores antes" value={selectedLog.valores_antes} />
              <JsonBlock title="Valores despues" value={selectedLog.valores_despues} />
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-stone-700">{label}</label>
      <input
        className="input-base"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-stone-700">{label}</label>
      <select
        className="input-base"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-800/10 bg-white/65 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.22em] text-stone-500">{label}</p>
      <p className="mt-2 text-sm leading-6 text-stone-800">{value}</p>
    </div>
  );
}

function JsonBlock({
  title,
  value,
}: {
  title: string;
  value: Record<string, unknown> | null;
}) {
  return (
    <div className="rounded-2xl border border-stone-800/10 bg-stone-950 p-4 text-stone-100">
      <p className="text-xs uppercase tracking-[0.22em] text-stone-400">{title}</p>
      <pre className="mt-3 overflow-x-auto text-xs leading-6">
        {value ? JSON.stringify(value, null, 2) : "Sin datos"}
      </pre>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-stone-800/15 bg-white/40 px-5 py-8 text-center text-sm text-stone-500">
      {text}
    </div>
  );
}
