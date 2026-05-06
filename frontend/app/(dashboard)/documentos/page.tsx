"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError, apiFetch } from "@/lib/api";
import { readSession } from "@/lib/session";

type Credito = {
  id: number;
  monto_solicitado: number;
  estado: string;
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

type DocumentoReplaceResponse = {
  anterior: Documento;
  nuevo: Documento;
};

export default function DocumentosPage() {
  const router = useRouter();
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [selectedCreditoId, setSelectedCreditoId] = useState<string>("todos");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [uploadCreditoId, setUploadCreditoId] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const session = readSession();
    if (!session) {
      router.replace("/login?message=Inicia sesion para gestionar documentos");
      return;
    }
  }, [router]);

  async function loadCreditos() {
    const data = await apiFetch<Credito[]>("/api/v1/creditos/");
    const ordered = [...data].sort((left, right) => right.id - left.id);
    setCreditos(ordered);
    setUploadCreditoId((current) => current || String(ordered[0]?.id ?? ""));
  }

  async function loadDocumentos() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (selectedCreditoId !== "todos") {
        params.set("credito_id", selectedCreditoId);
      }
      params.set("solo_activos", showActiveOnly ? "true" : "false");

      const query = params.toString();
      const data = await apiFetch<Documento[]>(`/api/v1/documentos/?${query}`);
      const ordered = [...data].sort((left, right) => right.id - left.id);
      setDocumentos(ordered);
      setSelectedId((current) => {
        if (current && ordered.some((item) => item.id === current)) {
          return current;
        }
        return ordered[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : "No se pudieron cargar los documentos",
      );
      setDocumentos([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function loadInitialData() {
      try {
        await loadCreditos();
        await loadDocumentos();
      } catch (loadError) {
        setError(
          loadError instanceof ApiError
            ? loadError.message
            : "No se pudo cargar el modulo documental",
        );
        setLoading(false);
      }
    }

    void loadInitialData();
  }, []);

  useEffect(() => {
    if (!readSession()) {
      return;
    }

    void loadDocumentos();
  }, [selectedCreditoId, showActiveOnly]);

  const selectedDocumento = useMemo(
    () => documentos.find((item) => item.id === selectedId) ?? null,
    [documentos, selectedId],
  );

  const creditosMap = useMemo(() => {
    return new Map(creditos.map((credito) => [credito.id, credito]));
  }, [creditos]);

  async function handleUpload() {
    if (!uploadCreditoId || !uploadFile) {
      setError("Selecciona un credito y un archivo antes de subir.");
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("credito_id", uploadCreditoId);
      formData.append("archivo", uploadFile);

      const documento = await apiFetch<Documento>("/api/v1/documentos/", {
        method: "POST",
        body: formData,
      });

      setDocumentos((current) => [documento, ...current]);
      setSelectedId(documento.id);
      setUploadFile(null);
      setSuccess("Documento subido correctamente.");
    } catch (uploadError) {
      setError(
        uploadError instanceof ApiError
          ? uploadError.message
          : "No se pudo subir el documento",
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleReplace() {
    if (!selectedDocumento || !replaceFile) {
      setError("Selecciona un documento y el nuevo archivo para reemplazar.");
      return;
    }

    setReplacing(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("archivo", replaceFile);

      const response = await apiFetch<DocumentoReplaceResponse>(
        `/api/v1/documentos/${selectedDocumento.id}/reemplazar`,
        {
          method: "PATCH",
          body: formData,
        },
      );

      setDocumentos((current) =>
        [response.nuevo, ...current.filter((item) => item.id !== response.anterior.id)],
      );
      setSelectedId(response.nuevo.id);
      setReplaceFile(null);
      setSuccess("Documento reemplazado y versionado correctamente.");
      await loadDocumentos();
    } catch (replaceError) {
      setError(
        replaceError instanceof ApiError
          ? replaceError.message
          : "No se pudo reemplazar el documento",
      );
    } finally {
      setReplacing(false);
    }
  }

  async function handleDeactivate() {
    if (!selectedDocumento) {
      return;
    }

    if (!window.confirm(`Vas a desactivar ${selectedDocumento.nombre}. Deseas continuar?`)) {
      return;
    }

    setDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await apiFetch<Documento>(`/api/v1/documentos/${selectedDocumento.id}`, {
        method: "DELETE",
      });

      setDocumentos((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSelectedId(updated.id);
      setSuccess("Documento desactivado correctamente.");
      await loadDocumentos();
    } catch (deleteError) {
      setError(
        deleteError instanceof ApiError
          ? deleteError.message
          : "No se pudo desactivar el documento",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <article className="glass-panel p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-stone-500">
            Soporte documental
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
            Documentos y versionado
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600">
            Aqui subes archivos ligados al credito y conservas historial de
            versiones. Aun guarda en disco local, pero ya sirve para la
            operacion y la trazabilidad.
          </p>
        </article>

        <article className="glass-panel p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
            Filtros
          </p>
          <div className="mt-4 space-y-3">
            <SelectField
              label="Credito"
              value={selectedCreditoId}
              onChange={setSelectedCreditoId}
              options={[
                { value: "todos", label: "Todos los creditos" },
                ...creditos.map((credito) => ({
                  value: String(credito.id),
                  label: `#${credito.id} · ${credito.estado} · ${formatCurrency(credito.monto_solicitado)}`,
                })),
              ]}
            />

            <label className="flex items-center gap-3 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={showActiveOnly}
                onChange={(event) => setShowActiveOnly(event.target.checked)}
              />
              Mostrar solo documentos activos
            </label>
          </div>
        </article>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <article className="glass-panel overflow-hidden">
          <div className="border-b border-stone-800/10 px-6 py-5">
            <h2 className="text-xl font-semibold text-stone-950">Listado</h2>
            <p className="mt-1 text-sm text-stone-500">
              Selecciona un documento para revisar version, ruta y credito asociado.
            </p>
          </div>

          <div className="space-y-3 p-4">
            {loading ? (
              <EmptyState text="Cargando documentos..." />
            ) : documentos.length === 0 ? (
              <EmptyState text="No hay documentos para el filtro actual." />
            ) : (
              documentos.map((documento) => {
                const active = documento.id === selectedId;
                const credito = creditosMap.get(documento.credito_id);

                return (
                  <button
                    key={documento.id}
                    type="button"
                    onClick={() => setSelectedId(documento.id)}
                    className={[
                      "w-full rounded-3xl border px-5 py-4 text-left transition",
                      active
                        ? "border-teal-700/20 bg-teal-950 text-white shadow-xl shadow-teal-950/15"
                        : "border-stone-800/10 bg-white/65 hover:bg-white/90",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] opacity-70">
                          Documento #{documento.id}
                        </p>
                        <h3 className="mt-2 text-xl font-semibold">{documento.nombre}</h3>
                      </div>
                      <span
                        className={[
                          "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
                          documento.is_active
                            ? active
                              ? "bg-white/15 text-white"
                              : "bg-emerald-100 text-emerald-700"
                            : active
                              ? "bg-white/15 text-white"
                              : "bg-stone-900/5 text-stone-500",
                        ].join(" ")}
                      >
                        v{documento.version}
                      </span>
                    </div>
                    <div className={["mt-3 grid gap-2 text-sm sm:grid-cols-2", active ? "text-teal-50/85" : "text-stone-600"].join(" ")}>
                      <p>Credito #{documento.credito_id}</p>
                      <p>{credito?.estado ?? "Sin estado"}</p>
                      <p>{documento.tipo}</p>
                      <p>{formatDate(documento.created_at)}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </article>

        <article className="glass-panel p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
            Subir documento
          </p>

          <div className="mt-4 space-y-3">
            <SelectField
              label="Credito destino"
              value={uploadCreditoId}
              onChange={setUploadCreditoId}
              options={creditos.map((credito) => ({
                value: String(credito.id),
                label: `#${credito.id} · ${credito.estado} · ${formatCurrency(credito.monto_solicitado)}`,
              }))}
            />

            <FileField
              label="Archivo"
              onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
            />

            <button
              type="button"
              className="button-primary w-full"
              onClick={() => void handleUpload()}
              disabled={uploading}
            >
              {uploading ? "Subiendo..." : "Subir documento"}
            </button>
          </div>

          <div className="mt-6 border-t border-stone-800/10 pt-5">
            <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
              Reemplazar version
            </p>

            <div className="mt-4 space-y-3">
              <FileField
                label="Nuevo archivo"
                onChange={(event) => setReplaceFile(event.target.files?.[0] ?? null)}
              />

              <button
                type="button"
                className="button-muted w-full"
                onClick={() => void handleReplace()}
                disabled={replacing || !selectedDocumento || selectedDocumento.is_active === false}
              >
                {replacing ? "Reemplazando..." : "Reemplazar documento seleccionado"}
              </button>
            </div>
          </div>

          {selectedDocumento ? (
            <div className="mt-6 space-y-3 border-t border-stone-800/10 pt-5">
              <DetailRow label="Nombre" value={selectedDocumento.nombre} />
              <DetailRow label="Ruta guardada" value={selectedDocumento.url} />
              <DetailRow
                label="Estado"
                value={selectedDocumento.is_active ? "Activo" : "Inactivo"}
              />

              <button
                type="button"
                className="rounded-2xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:border-stone-800/10 disabled:bg-stone-100 disabled:text-stone-400"
                onClick={() => void handleDeactivate()}
                disabled={deleting || !selectedDocumento.is_active}
              >
                {deleting ? "Desactivando..." : selectedDocumento.is_active ? "Desactivar documento" : "Documento inactivo"}
              </button>
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {success}
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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

function FileField({
  label,
  onChange,
}: {
  label: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-stone-700">{label}</label>
      <input
        className="input-base file:mr-4 file:rounded-xl file:border-0 file:bg-stone-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={onChange}
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-800/10 bg-white/65 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.22em] text-stone-500">{label}</p>
      <p className="mt-2 break-all text-sm leading-6 text-stone-800">{value}</p>
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
