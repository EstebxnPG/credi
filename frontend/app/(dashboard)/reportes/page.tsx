"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ApiError, apiDownload, apiFetch } from "@/lib/api";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

type ReportKey =
  | "creditos"
  | "pensionados"
  | "seguimientos"
  | "documentos"
  | "pendientes"
  | "oficinas"
  | "refinanciaciones"
  | "asesoras";

type Credito = {
  id: number;
  pensionado_id: number;
  asesor_id: number;
  oficina_id: number;
  estado: string;
  tipo_credito: string | null;
  monto_solicitado: number;
  monto_aprobado: number | null;
  fecha_registro: string;
};

type Pensionado = {
  id: number;
  nombre_completo: string;
  documento: string;
  oficina_id: number;
  created_by: number | null;
  creador_nombre: string | null;
  created_at: string;
  telefono?: string;
  celular?: string | null;
  correo?: string | null;
};

type Seguimiento = {
  id: number;
  pensionado_id: number;
  pensionado_nombre: string | null;
  oficina_id: number;
  oficina_nombre: string | null;
  usuario_id: number;
  usuario_nombre: string | null;
  tipo: string;
  comentario: string;
  resultado: string | null;
  estado: string;
  fecha_proximo_contacto: string | null;
  created_at: string;
  soluciones: SeguimientoSolucion[];
};

type SeguimientoSolucion = {
  id: number;
  usuario_id: number;
  usuario_nombre: string | null;
  comentario: string;
  resultado: string | null;
  estado_resultante: string | null;
  fecha_proximo_contacto: string | null;
  created_at: string;
};

type Documento = {
  id: number;
  credito_id: number;
  nombre: string;
  tipo: string;
  version: number;
  created_at: string;
};

type Pendiente = {
  id: number;
  credito_id: number;
  descripcion: string;
  estado: string;
  origen: string;
  created_at: string;
  resolved_at: string | null;
};

type Oficina = {
  id: number;
  nombre: string;
  direccion: string;
  is_active: boolean;
};

type Refinanciacion = {
  credito_id: number;
  pensionado_nombre: string | null;
  documento: string | null;
  cooperativa_nombre: string | null;
  monto_aprobado: number | null;
  disponible_desde: string;
  estado_comercial: string;
  estado_refinanciacion: string;
  reactivar_en: string | null;
};

type Asesora = {
  id: number;
  nombre: string;
  documento: string;
  correo: string;
  rol: string;
  oficina_id: number;
  is_active: boolean;
};

const reports: Array<{ key: ReportKey; label: string }> = [
  { key: "creditos", label: "Creditos" },
  { key: "pensionados", label: "Pensionados" },
  { key: "seguimientos", label: "Seguimientos" },
  { key: "documentos", label: "Documentos" },
  { key: "pendientes", label: "Pendientes operativos" },
  { key: "oficinas", label: "Oficinas" },
  { key: "refinanciaciones", label: "Refinanciaciones" },
  { key: "asesoras", label: "Asesoras" },
];

export default function ReportesPage() {
  const [active, setActive] = useState<ReportKey>("creditos");
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [pensionados, setPensionados] = useState<Pensionado[]>([]);
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [oficinas, setOficinas] = useState<Oficina[]>([]);
  const [refinanciaciones, setRefinanciaciones] = useState<Refinanciacion[]>([]);
  const [asesoras, setAsesoras] = useState<Asesora[]>([]);
  const [query, setQuery] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [oficinaId, setOficinaId] = useState("");
  const [estadoComercial, setEstadoComercial] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadReports() {
      setLoading(true);
      setError(null);
      try {
        const [
          creditosData,
          pensionadosData,
          seguimientosData,
          documentosData,
          pendientesData,
          oficinasData,
          refinanciacionesData,
          usuariosData,
        ] =
          await Promise.all([
            apiFetch<Credito[]>("/api/v1/creditos/?limit=15"),
            apiFetch<Pensionado[]>("/api/v1/pensionados/?limit=15"),
            apiFetch<Seguimiento[]>("/api/v1/seguimientos/?limit=15"),
            apiFetch<Documento[]>("/api/v1/documentos/?limit=15"),
            apiFetch<Pendiente[]>("/api/v1/pendientes-credito/?limit=15"),
            apiFetch<Oficina[]>("/api/v1/oficinas/?solo_activas=false"),
            apiFetch<Refinanciacion[]>("/api/v1/refinanciaciones/elegibles/?limit=15"),
            apiFetch<Asesora[]>("/api/v1/usuarios/?limit=15"),
          ]);

        if (!ignore) {
          setCreditos(creditosData);
          setPensionados(pensionadosData);
          setSeguimientos(seguimientosData);
          setDocumentos(documentosData);
          setPendientes(pendientesData);
          setOficinas(oficinasData);
          setRefinanciaciones(refinanciacionesData);
          setAsesoras(
            usuariosData.filter(
              (item) => item.rol === "asesora" || item.rol === "administrador",
            ),
          );
        }
      } catch (loadError) {
        if (!ignore) {
          setError(
            loadError instanceof ApiError
              ? loadError.message
              : "No se pudieron cargar los reportes",
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadReports();
    return () => {
      ignore = true;
    };
  }, []);

  const pensionadoById = useMemo(
    () => new Map(pensionados.map((item) => [item.id, item])),
    [pensionados],
  );
  const oficinaById = useMemo(
    () => new Map(oficinas.map((item) => [item.id, item])),
    [oficinas],
  );

  const filteredCreditos = useMemo(
    () =>
      creditos.filter((item) => {
        const pensionado = pensionadoById.get(item.pensionado_id);
        return (!oficinaId || item.oficina_id === Number(oficinaId)) &&
          inDateRange(item.fecha_registro, desde, hasta) &&
          matchesQuery(query, [
            item.id,
            item.estado,
            item.tipo_credito,
            pensionado?.nombre_completo,
            pensionado?.documento,
            oficinaById.get(item.oficina_id)?.nombre,
          ]);
      }),
    [creditos, desde, hasta, oficinaById, oficinaId, pensionadoById, query],
  );

  const filteredPensionados = useMemo(
    () => pensionados.filter((item) =>
      (!oficinaId || item.oficina_id === Number(oficinaId)) &&
      inDateRange(item.created_at, desde, hasta) &&
      matchesQuery(query, [item.nombre_completo, item.documento, item.creador_nombre, item.telefono, item.celular, item.correo, oficinaById.get(item.oficina_id)?.nombre]),
    ),
    [desde, hasta, oficinaById, oficinaId, pensionados, query],
  );

  const filteredSeguimientos = useMemo(
    () =>
      seguimientos.filter(
        (item) =>
          (!oficinaId || item.oficina_id === Number(oficinaId)) &&
          inDateRange(item.created_at, desde, hasta) &&
          matchesQuery(query, [
            item.pensionado_nombre,
            item.tipo,
            item.comentario,
            item.resultado,
            item.usuario_nombre,
            item.oficina_nombre,
          ]),
      ),
    [desde, hasta, oficinaId, query, seguimientos],
  );

  const filteredSolucionesSeguimiento = useMemo(
    () =>
      seguimientos
        .flatMap((seguimiento) =>
          (seguimiento.soluciones ?? []).map((solucion) => ({
            ...solucion,
            oficina_id: seguimiento.oficina_id,
            pensionado_nombre: seguimiento.pensionado_nombre,
          })),
        )
        .filter(
          (item) =>
            (!oficinaId || item.oficina_id === Number(oficinaId)) &&
            inDateRange(item.created_at, desde, hasta) &&
            matchesQuery(query, [
              item.pensionado_nombre,
              item.comentario,
              item.resultado,
              item.estado_resultante,
              item.usuario_nombre,
            ]),
        ),
    [desde, hasta, oficinaId, query, seguimientos],
  );

  const filteredDocumentos = useMemo(
    () =>
      documentos.filter((item) => {
        const credito = creditos.find((creditoItem) => creditoItem.id === item.credito_id);
        const pensionado = credito ? pensionadoById.get(credito.pensionado_id) : undefined;
        return (!oficinaId || credito?.oficina_id === Number(oficinaId)) &&
          inDateRange(item.created_at, desde, hasta) &&
          matchesQuery(query, [item.nombre, item.tipo, item.credito_id, pensionado?.nombre_completo]);
      }),
    [creditos, desde, documentos, hasta, oficinaId, pensionadoById, query],
  );

  const filteredPendientes = useMemo(
    () =>
      pendientes.filter(
        (item) => {
          const credito = creditos.find((creditoItem) => creditoItem.id === item.credito_id);
          return (!oficinaId || credito?.oficina_id === Number(oficinaId)) &&
          inDateRange(item.created_at, desde, hasta) &&
          matchesQuery(query, [item.credito_id, item.descripcion, item.estado, item.origen]);
        },
      ),
    [creditos, desde, hasta, oficinaId, pendientes, query],
  );

  const oficinaRows = useMemo(
    () =>
      oficinas
        .filter((oficina) => !oficinaId || oficina.id === Number(oficinaId))
        .map((oficina) => {
          const oficinaCreditos = filteredCreditos.filter((item) => item.oficina_id === oficina.id);
          const oficinaSeguimientos = filteredSeguimientos.filter(
            (item) => item.oficina_id === oficina.id,
          );
          return {
            ...oficina,
            creditos: oficinaCreditos.length,
            aprobados: oficinaCreditos.filter((item) => item.estado === "Aprobado").length,
            montoAprobado: oficinaCreditos.reduce(
              (total, item) => total + Number(item.monto_aprobado ?? 0),
              0,
            ),
            seguimientos: oficinaSeguimientos.length,
          };
        })
        .filter((item) => matchesQuery(query, [item.nombre, item.direccion])),
    [filteredCreditos, filteredSeguimientos, oficinaId, oficinas, query],
  );

  const filteredRefinanciaciones = useMemo(
    () =>
      refinanciaciones.filter((item) => {
        const credito = creditos.find((creditoItem) => creditoItem.id === item.credito_id);
        const pensionado = credito ? pensionadoById.get(credito.pensionado_id) : undefined;
        return (
          (!oficinaId || credito?.oficina_id === Number(oficinaId)) &&
          inDateRange(item.disponible_desde, desde, hasta) &&
          (!estadoComercial || item.estado_comercial === estadoComercial) &&
          matchesQuery(query, [
            item.credito_id,
            item.cooperativa_nombre,
            item.estado_comercial,
            pensionado?.nombre_completo,
            pensionado?.documento,
          ])
        );
      }),
    [creditos, desde, estadoComercial, hasta, oficinaId, pensionadoById, query, refinanciaciones],
  );

  const asesoraRows = useMemo(
    () =>
      asesoras
        .filter((asesora) => !oficinaId || asesora.oficina_id === Number(oficinaId))
        .map((asesora) => {
          const asesoraCreditos = filteredCreditos.filter(
            (item) => item.asesor_id === asesora.id,
          );
          const asesoraSeguimientos = filteredSeguimientos.filter(
            (item) => item.usuario_id === asesora.id,
          );
          const asesoraSoluciones = filteredSolucionesSeguimiento.filter(
            (item) => item.usuario_id === asesora.id,
          );
          const aprobados = asesoraCreditos.filter((item) => item.estado === "Aprobado");
          return {
            ...asesora,
            oficinaNombre: oficinaById.get(asesora.oficina_id)?.nombre ?? "Sin oficina",
            creditos: asesoraCreditos.length,
            aprobados: aprobados.length,
            tasaAprobacion: asesoraCreditos.length
              ? (aprobados.length / asesoraCreditos.length) * 100
              : 0,
            montoAprobado: aprobados.reduce(
              (total, item) => total + Number(item.monto_aprobado ?? 0),
              0,
            ),
            seguimientos: asesoraSeguimientos.length,
            solucionesSeguimiento: asesoraSoluciones.length,
          };
        })
        .filter((item) =>
          matchesQuery(query, [
            item.nombre,
            item.documento,
            item.correo,
            item.oficinaNombre,
          ]),
        ),
    [asesoras, filteredCreditos, filteredSeguimientos, filteredSolucionesSeguimiento, oficinaById, oficinaId, query],
  );

  function filterToday() {
    const today = localDateValue(new Date());
    setDesde(today);
    setHasta(today);
  }

  if (loading) {
    return <StateMessage text="Cargando reportes..." />;
  }

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-800/10 pb-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">
          Reportes
        </p>
        <h1 className="mt-2 text-xl font-semibold text-stone-950">Control operativo</h1>
        </div>
        <button className="button-primary" onClick={() => setExportOpen(true)}>Exportar créditos · Excel</button>
      </header>

      {error ? <StateMessage tone="error" text={error} /> : null}

      <div className="flex flex-wrap gap-2 border-b border-stone-800/10 pb-3">
        {reports.map((report) => (
          <button
            key={report.key}
            type="button"
            onClick={() => setActive(report.key)}
            className={[
              "rounded-lg border px-3 py-2 text-sm font-medium transition",
              active === report.key
                ? "border-teal-950 bg-teal-950 text-white"
                : "border-stone-800/10 bg-white text-stone-700 hover:bg-stone-50",
            ].join(" ")}
          >
            {report.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_180px_180px_auto_auto] md:items-end">
        <input
          className="input-base"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar en el reporte actual"
        />
        <label className="text-xs font-medium text-stone-600">
          <span className="mb-1 block">Oficina</span>
          <select className="input-base" value={oficinaId} onChange={(event) => setOficinaId(event.target.value)}>
            <option value="">Todas las oficinas</option>
            {oficinas.map((oficina) => <option key={oficina.id} value={oficina.id}>{oficina.nombre}</option>)}
          </select>
        </label>
        <DateField label="Desde" value={desde} onChange={setDesde} />
        <DateField label="Hasta" value={hasta} onChange={setHasta} />
        <button type="button" className="button-muted h-11 px-4" onClick={filterToday}>
          Hoy
        </button>
        <button
          type="button"
          className="button-muted h-11 px-4"
          onClick={() => {
            setDesde("");
            setHasta("");
            setOficinaId("");
            setEstadoComercial("");
          }}
          disabled={!desde && !hasta && !oficinaId && !estadoComercial}
        >
          Limpiar filtros
        </button>
      </div>

      {active === "refinanciaciones" ? (
        <div className="max-w-xs">
          <label className="text-xs font-medium text-stone-600">Estado comercial
            <select className="input-base mt-1" value={estadoComercial} onChange={(event) => setEstadoComercial(event.target.value)}>
              <option value="">Todos</option><option value="programado">Programado</option><option value="disponible">Disponible</option><option value="contactado">Contactado</option><option value="aceptado">Aceptado</option><option value="rechazado">Rechazado</option><option value="convertido">Convertido</option>
            </select>
          </label>
        </div>
      ) : null}

      {active === "creditos" ? (
        <CreditosReport items={filteredCreditos} pensionadoById={pensionadoById} oficinaById={oficinaById} />
      ) : null}
      {active === "pensionados" ? <PensionadosReport items={filteredPensionados} oficinaById={oficinaById} /> : null}
      {active === "seguimientos" ? <SeguimientosReport items={filteredSeguimientos} /> : null}
      {active === "documentos" ? <DocumentosReport items={filteredDocumentos} /> : null}
      {active === "pendientes" ? <PendientesReport items={filteredPendientes} /> : null}
      {active === "oficinas" ? <OficinasReport items={oficinaRows} /> : null}
      {active === "refinanciaciones" ? (
        <RefinanciacionesReport
          items={filteredRefinanciaciones}
          creditos={creditos}
          pensionadoById={pensionadoById}
        />
      ) : null}
      {active === "asesoras" ? <AsesorasReport items={asesoraRows} /> : null}
      {exportOpen ? <ExportCreditsModal oficinas={oficinas} initialDesde={desde} initialHasta={hasta} initialOficina={oficinaId} onClose={() => setExportOpen(false)} /> : null}
    </section>
  );
}

const exportColumns = [
  ["tipo_credito","Tipo de crédito"],["fecha_registro","Fecha de registro"],["nro_libranza","Número de libranza"],["monto","Monto"],["meses","Meses"],["pensionado","Nombre del pensionado"],["cedula","Cédula"],["telefono","Teléfono"],["correo","Correo"],["celular","Celular"],["pagaduria","Pagaduría"],["cooperativa","Cooperativa"],["cedula_asesor","Cédula asesor"],["direccion","Dirección"],
  ["credito_id","ID crédito"],["estado","Estado"],["pensionado","Pensionado"],["asesor","Asesor"],["oficina","Oficina"],["monto_solicitado","Monto solicitado"],["monto_aprobado","Monto aprobado"],["plazo","Plazo"],
] as const;
const defaultExportColumns = exportColumns.slice(0,14).map(([key])=>key);

function ExportCreditsModal({oficinas,initialDesde,initialHasta,initialOficina,onClose}:{oficinas:Oficina[];initialDesde:string;initialHasta:string;initialOficina:string;onClose:()=>void}){
  const [columns,setColumns]=useState<string[]>(defaultExportColumns),[desdeExport,setDesdeExport]=useState(initialDesde),[hastaExport,setHastaExport]=useState(initialHasta),[office,setOffice]=useState(initialOficina),[min,setMin]=useState(""),[max,setMax]=useState(""),[saving,setSaving]=useState(false),[exportError,setExportError]=useState<string|null>(null);
  function toggle(key:string){setColumns(c=>c.includes(key)?c.filter(x=>x!==key):[...c,key])}
  function move(key:string,delta:number){setColumns(c=>{const i=c.indexOf(key),j=i+delta;if(i<0||j<0||j>=c.length)return c;const n=[...c];[n[i],n[j]]=[n[j],n[i]];return n})}
  async function download(selected:string[]){setSaving(true);setExportError(null);try{const q=new URLSearchParams({columnas:selected.join(",")});if(desdeExport)q.set("desde",desdeExport);if(hastaExport)q.set("hasta",hastaExport);if(office)q.set("oficina_id",office);if(min)q.set("monto_desde",min);if(max)q.set("monto_hasta",max);const blob=await apiDownload(`/api/v1/reportes/creditos/exportar.xlsx?${q}`);const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`creditos_${new Date().toISOString().slice(0,10)}.xlsx`;a.click();URL.revokeObjectURL(url);onClose()}catch(e){setExportError(e instanceof ApiError?e.message:"No se pudo generar el Excel")}finally{setSaving(false)}}
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4"><div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-5 shadow-xl"><div className="flex justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Excel</p><h2 className="mt-1 text-xl font-semibold">Exportar créditos</h2><p className="mt-1 text-sm text-stone-600">Usa el formato estándar o arma las columnas en el orden requerido.</p></div><button className="button-muted h-fit" onClick={onClose}>Cerrar</button></div>{exportError?<p className="mt-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700">{exportError}</p>:null}<div className="mt-3 grid gap-3 sm:grid-cols-3"><DateField label="Desde" value={desdeExport} onChange={setDesdeExport}/><DateField label="Hasta" value={hastaExport} onChange={setHastaExport}/><label className="text-xs font-medium text-stone-600">Oficina<select className="input-base mt-1" value={office} onChange={e=>setOffice(e.target.value)}><option value="">Todas</option>{oficinas.map(o=><option key={o.id} value={o.id}>{o.nombre}</option>)}</select></label><label className="text-xs font-medium text-stone-600">Monto mínimo<input className="input-base mt-1" type="number" min="0" value={min} onChange={e=>setMin(e.target.value)}/></label><label className="text-xs font-medium text-stone-600">Monto máximo<input className="input-base mt-1" type="number" min="0" value={max} onChange={e=>setMax(e.target.value)}/></label></div><div className="mt-3 grid gap-5 md:grid-cols-2"><div><h3 className="text-sm font-semibold">Columnas disponibles</h3><div className="mt-2 space-y-1">{exportColumns.map(([key,label])=><label key={key} className="flex gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={columns.includes(key)} onChange={()=>toggle(key)}/>{label}</label>)}</div></div><div><h3 className="text-sm font-semibold">Orden del Excel</h3><div className="mt-2 space-y-1">{columns.map((key,index)=><div key={key} className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm"><span>{index+1}. {exportColumns.find(([k])=>k===key)?.[1]}</span><span className="flex gap-1"><button disabled={index===0} onClick={()=>move(key,-1)} className="rounded border px-2 disabled:opacity-30">↑</button><button disabled={index===columns.length-1} onClick={()=>move(key,1)} className="rounded border px-2 disabled:opacity-30">↓</button></span></div>)}</div></div></div><div className="mt-6 flex flex-wrap justify-end gap-2"><button disabled={saving} className="button-muted" onClick={()=>void download(defaultExportColumns)}>Exportar formato estándar</button><button disabled={saving||!columns.length} className="button-primary" onClick={()=>void download(columns)}>{saving?"Generando...":"Exportar personalizado"}</button></div></div></div>
}

function PensionadosReport({ items, oficinaById }: { items: Pensionado[]; oficinaById: Map<number, Oficina> }) {
  const offices = new Set(items.map((item) => item.oficina_id)).size;
  const creators = new Set(items.map((item) => item.created_by).filter(Boolean)).size;
  const thisMonth = new Date().toISOString().slice(0, 7);
  return <>
    <Metrics values={[["Pensionados", String(items.length)],["Registrados este mes", String(items.filter((item) => item.created_at.slice(0,7) === thisMonth).length)],["Oficinas", String(offices)],["Usuarios registradores", String(creators)]]}/>
    <ReportTable headers={["Pensionado","Documento","Oficina","Agregado por","Fecha de registro","Contacto"]}>
      {items.map((item) => <tr key={item.id}>
        <Cell><Link href={`/pensionados/${item.id}`} className="font-semibold text-teal-800">{item.nombre_completo}</Link></Cell>
        <Cell>{item.documento}</Cell>
        <Cell>{oficinaById.get(item.oficina_id)?.nombre ?? `Oficina #${item.oficina_id}`}</Cell>
        <Cell>{item.creador_nombre ?? "Histórico sin autor identificado"}</Cell>
        <Cell>{formatDateTime(item.created_at)}</Cell>
        <Cell><p>{item.celular ?? item.telefono ?? "Sin teléfono"}</p><p className="text-xs text-stone-500">{item.correo ?? "Sin correo"}</p></Cell>
      </tr>)}
    </ReportTable>
  </>;
}

function CreditosReport({
  items,
  pensionadoById,
  oficinaById,
}: {
  items: Credito[];
  pensionadoById: Map<number, Pensionado>;
  oficinaById: Map<number, Oficina>;
}) {
  const aprobados = items.filter((item) => item.estado === "Aprobado");
  const solicitado = items.reduce((total, item) => total + Number(item.monto_solicitado), 0);
  const aprobado = items.reduce((total, item) => total + Number(item.monto_aprobado ?? 0), 0);
  return (
    <>
      <Metrics values={[
        ["Creditos", String(items.length)],
        ["Aprobados", String(aprobados.length)],
        ["Solicitado", formatCurrency(solicitado)],
        ["Aprobado", formatCurrency(aprobado)],
      ]} />
      <ReportTable headers={["Credito", "Pensionado", "Oficina", "Tipo", "Estado", "Solicitado", "Registro"]}>
        {items.map((item) => (
          <tr key={item.id}>
            <Cell><Link className="font-semibold text-teal-800" href={`/creditos/${item.id}`}>#{item.id}</Link></Cell>
            <Cell>{pensionadoById.get(item.pensionado_id)?.nombre_completo ?? `Pensionado #${item.pensionado_id}`}</Cell>
            <Cell>{oficinaById.get(item.oficina_id)?.nombre ?? "Sin oficina"}</Cell>
            <Cell>{item.tipo_credito ?? "Sin tipo"}</Cell>
            <Cell>{item.estado}</Cell>
            <Cell>{formatCurrency(item.monto_solicitado)}</Cell>
            <Cell>{formatDate(item.fecha_registro)}</Cell>
          </tr>
        ))}
      </ReportTable>
    </>
  );
}

function SeguimientosReport({ items }: { items: Seguimiento[] }) {
  const programados = items.filter((item) => item.fecha_proximo_contacto);
  const conResultado = items.filter((item) => item.resultado);
  return (
    <>
      <Metrics values={[
        ["Seguimientos", String(items.length)],
        ["Programados", String(programados.length)],
        ["Con resultado", String(conResultado.length)],
        ["Sin resultado", String(items.length - conResultado.length)],
      ]} />
      <ReportTable headers={["Pensionado", "Tipo", "Oficina", "Asesor", "Comentario", "Proximo contacto", "Registro"]}>
        {items.map((item) => (
          <tr key={item.id}>
            <Cell><Link className="font-semibold text-teal-800" href={`/seguimientos/${item.id}`}>{item.pensionado_nombre ?? `Pensionado #${item.pensionado_id}`}</Link></Cell>
            <Cell>{item.tipo}</Cell>
            <Cell>{item.oficina_nombre ?? "Sin oficina"}</Cell>
            <Cell>{item.usuario_nombre ?? "Sin usuario"}</Cell>
            <Cell>{item.comentario}</Cell>
            <Cell>{item.fecha_proximo_contacto ? formatDateTime(item.fecha_proximo_contacto) : "Sin programar"}</Cell>
            <Cell>{formatDateTime(item.created_at)}</Cell>
          </tr>
        ))}
      </ReportTable>
    </>
  );
}

function DocumentosReport({ items }: { items: Documento[] }) {
  const pdf = items.filter((item) => item.tipo === "PDF").length;
  const imagenes = items.filter((item) => item.tipo !== "PDF").length;
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function downloadDocument(item: Documento) {
    setDownloadingId(item.id);
    setDownloadError(null);

    try {
      const blob = await apiDownload(`/api/v1/documentos/${item.id}/descargar`);
      const typedBlob = new Blob([blob], { type: documentMimeType(item.tipo) });
      const url = URL.createObjectURL(typedBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = documentFileName(item);
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(error instanceof ApiError ? error.message : "No se pudo descargar el documento");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <>
      <Metrics values={[
        ["Documentos", String(items.length)],
        ["PDF", String(pdf)],
        ["Imagenes", String(imagenes)],
        ["Creditos con docs", String(new Set(items.map((item) => item.credito_id)).size)],
      ]} />
      {downloadError ? <StateMessage tone="error" text={downloadError} /> : null}
      <ReportTable headers={["Documento", "Credito", "Tipo", "Version", "Registro", "Archivo"]}>
        {items.map((item) => (
          <tr key={item.id}>
            <Cell>{item.nombre}</Cell>
            <Cell><Link className="font-semibold text-teal-800" href={`/creditos/${item.credito_id}`}>#{item.credito_id}</Link></Cell>
            <Cell>{item.tipo}</Cell>
            <Cell>{String(item.version)}</Cell>
            <Cell>{formatDateTime(item.created_at)}</Cell>
            <Cell>
              <button
                type="button"
                className="button-muted px-2.5 py-1.5 text-xs"
                disabled={downloadingId === item.id}
                onClick={() => void downloadDocument(item)}
              >
                {downloadingId === item.id ? "Descargando..." : "Descargar"}
              </button>
            </Cell>
          </tr>
        ))}
      </ReportTable>
    </>
  );
}

function PendientesReport({ items }: { items: Pendiente[] }) {
  const abiertos = items.filter((item) => item.estado === "pendiente").length;
  const resueltos = items.filter((item) => item.estado === "resuelto").length;
  return (
    <>
      <Metrics values={[
        ["Pendientes", String(items.length)],
        ["Abiertos", String(abiertos)],
        ["Resueltos", String(resueltos)],
        ["Creditos afectados", String(new Set(items.map((item) => item.credito_id)).size)],
      ]} />
      <ReportTable headers={["Descripcion", "Credito", "Origen", "Estado", "Creado", "Resuelto"]}>
        {items.map((item) => (
          <tr key={item.id}>
            <Cell>{item.descripcion}</Cell>
            <Cell><Link className="font-semibold text-teal-800" href={`/creditos/${item.credito_id}`}>#{item.credito_id}</Link></Cell>
            <Cell>{item.origen}</Cell>
            <Cell>{item.estado}</Cell>
            <Cell>{formatDateTime(item.created_at)}</Cell>
            <Cell>{item.resolved_at ? formatDateTime(item.resolved_at) : "Sin resolver"}</Cell>
          </tr>
        ))}
      </ReportTable>
    </>
  );
}

function OficinasReport({
  items,
}: {
  items: Array<Oficina & { creditos: number; aprobados: number; montoAprobado: number; seguimientos: number }>;
}) {
  return (
    <>
      <Metrics values={[
        ["Oficinas", String(items.length)],
        ["Activas", String(items.filter((item) => item.is_active).length)],
        ["Creditos", String(items.reduce((total, item) => total + item.creditos, 0))],
        ["Seguimientos", String(items.reduce((total, item) => total + item.seguimientos, 0))],
      ]} />
      <ReportTable headers={["Oficina", "Direccion", "Estado", "Creditos", "Aprobados", "Monto aprobado", "Seguimientos"]}>
        {items.map((item) => (
          <tr key={item.id}>
            <Cell>{item.nombre}</Cell>
            <Cell>{item.direccion}</Cell>
            <Cell>{item.is_active ? "Activa" : "Inactiva"}</Cell>
            <Cell>{String(item.creditos)}</Cell>
            <Cell>{String(item.aprobados)}</Cell>
            <Cell>{formatCurrency(item.montoAprobado)}</Cell>
            <Cell>{String(item.seguimientos)}</Cell>
          </tr>
        ))}
      </ReportTable>
    </>
  );
}

function RefinanciacionesReport({
  items,
  creditos,
  pensionadoById,
}: {
  items: Refinanciacion[];
  creditos: Credito[];
  pensionadoById: Map<number, Pensionado>;
}) {
  const disponibles = items.filter((item) => item.estado_refinanciacion === "Listo").length;
  const programados = items.filter((item) => item.estado_comercial === "programado").length;
  const convertidos = items.filter((item) => item.estado_comercial === "convertido").length;

  return (
    <>
      <Metrics
        values={[
          ["Oportunidades", String(items.length)],
          ["Disponibles ahora", String(disponibles)],
          ["Programadas", String(programados)],
          ["Convertidas", String(convertidos)],
        ]}
      />
      <ReportTable
        headers={[
          "Credito",
          "Pensionado",
          "Cooperativa",
          "Tentativa para refi",
          "Estado comercial",
          "Monto anterior",
        ]}
      >
        {items.map((item) => {
          const credito = creditos.find((creditoItem) => creditoItem.id === item.credito_id);
          const pensionado = credito ? pensionadoById.get(credito.pensionado_id) : undefined;
          return (
            <tr key={item.credito_id}>
              <Cell>
                <Link
                  className="font-semibold text-teal-800"
                  href={`/creditos/${item.credito_id}`}
                >
                  #{item.credito_id}
                </Link>
              </Cell>
              <Cell>{pensionado?.nombre_completo ?? "Sin pensionado"}</Cell>
              <Cell>{item.cooperativa_nombre ?? "Sin cooperativa"}</Cell>
              <Cell>{formatDate(item.disponible_desde)}</Cell>
              <Cell><SoftStatus value={item.estado_comercial} /></Cell>
              <Cell>{formatCurrency(item.monto_aprobado)}</Cell>
            </tr>
          );
        })}
      </ReportTable>
    </>
  );
}

function AsesorasReport({
  items,
}: {
  items: Array<
    Asesora & {
      oficinaNombre: string;
      creditos: number;
      aprobados: number;
      tasaAprobacion: number;
      montoAprobado: number;
      seguimientos: number;
      solucionesSeguimiento: number;
    }
  >;
}) {
  return (
    <>
      <Metrics
        values={[
          ["Asesoras", String(items.length)],
          ["Activas", String(items.filter((item) => item.is_active).length)],
          ["Creditos", String(items.reduce((total, item) => total + item.creditos, 0))],
          ["Soluciones", String(items.reduce((total, item) => total + item.solucionesSeguimiento, 0))],
          [
            "Monto aprobado",
            formatCurrency(items.reduce((total, item) => total + item.montoAprobado, 0)),
          ],
        ]}
      />
      <ReportTable
        headers={[
          "Asesora",
          "Oficina",
          "Estado",
          "Creditos",
          "Aprobados",
          "Tasa",
          "Monto aprobado",
          "Seguimientos",
          "Soluciones",
        ]}
      >
        {items.map((item) => (
          <tr key={item.id}>
            <Cell>
              <Link
                href={`/reportes/asesoras/${item.id}`}
                className="font-semibold text-teal-800"
              >
                {item.nombre}
              </Link>
              <p className="mt-1 text-xs text-stone-500">{item.correo}</p>
            </Cell>
            <Cell>{item.oficinaNombre}</Cell>
            <Cell>{item.is_active ? "Activa" : "Inactiva"}</Cell>
            <Cell>{String(item.creditos)}</Cell>
            <Cell>{String(item.aprobados)}</Cell>
            <Cell>{`${item.tasaAprobacion.toFixed(1)}%`}</Cell>
            <Cell>{formatCurrency(item.montoAprobado)}</Cell>
            <Cell>{String(item.seguimientos)}</Cell>
            <Cell>{String(item.solucionesSeguimiento)}</Cell>
          </tr>
        ))}
      </ReportTable>
    </>
  );
}

function SoftStatus({ value }: { value: string }) {
  const tones: Record<string, string> = {
    programado: "border-sky-200 bg-sky-50 text-sky-700",
    disponible: "border-emerald-200 bg-emerald-50 text-emerald-700",
    contactado: "border-amber-200 bg-amber-50 text-amber-700",
    aceptado: "border-teal-200 bg-teal-50 text-teal-700",
    rechazado: "border-rose-200 bg-rose-50 text-rose-700",
    convertido: "border-violet-200 bg-violet-50 text-violet-700",
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${tones[value] ?? "border-stone-200 bg-stone-50 text-stone-600"}`}>{value}</span>;
}

function Metrics({ values }: { values: Array<[string, string]> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {values.map(([label, value]) => (
        <div key={label} className="border-b border-stone-800/10 px-1 py-3">
          <p className="text-xs uppercase tracking-[0.16em] text-stone-500">{label}</p>
          <p className="mt-2 text-xl font-semibold text-stone-950">{value}</p>
        </div>
      ))}
    </div>
  );
}

function ReportTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="mt-4 overflow-x-auto border-y border-stone-800/10 bg-white/70">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-stone-800/10 bg-stone-50 text-xs uppercase tracking-[0.12em] text-stone-500">
          <tr>{headers.map((header) => <th key={header} className="whitespace-nowrap px-4 py-3 font-semibold">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-stone-800/10 text-stone-700">{children}</tbody>
      </table>
    </div>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="max-w-80 px-4 py-3 align-top">{children}</td>;
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs font-medium text-stone-600">
      <span className="mb-1 block">{label}</span>
      <input className="input-base" type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function matchesQuery(query: string, values: Array<string | number | null | undefined>) {
  const term = query.trim().toLowerCase();
  return !term || values.some((value) => String(value ?? "").toLowerCase().includes(term));
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

function documentMimeType(tipo: string) {
  const normalized = tipo.toUpperCase();
  if (normalized === "PDF") {
    return "application/pdf";
  }
  if (normalized === "PNG") {
    return "image/png";
  }
  return "image/jpeg";
}

function documentFileName(item: Documento) {
  const cleanName = item.nombre.trim() || `documento-${item.id}`;
  const lowerName = cleanName.toLowerCase();
  if (/\.(pdf|png|jpe?g)$/.test(lowerName)) {
    return cleanName;
  }

  const extension = item.tipo.toUpperCase() === "PDF" ? "pdf" : item.tipo.toUpperCase() === "PNG" ? "png" : "jpg";
  return `${cleanName}.${extension}`;
}

function StateMessage({ text, tone = "default" }: { text: string; tone?: "default" | "error" }) {
  return (
    <div className={[
      "border px-5 py-4 text-sm",
      tone === "error" ? "border-red-500/20 bg-red-50 text-red-700" : "border-stone-800/10 bg-white text-stone-500",
    ].join(" ")}>
      {text}
    </div>
  );
}
