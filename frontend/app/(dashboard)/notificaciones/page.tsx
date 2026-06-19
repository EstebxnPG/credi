/* eslint-disable prefer-const, @typescript-eslint/no-explicit-any */
"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type Item = { id:number; tipo:string; clase:"accion"|"informativa"; estado:string; titulo:string; mensaje:string; prioridad:"alta"|"media"|"baja"; href:string; fecha:string; leida:boolean; responsable_id:number|null; oficina_id:number };
type Page = { items:Item[]; total:number; page:number; page_size:number; unread:number };

const estados = ["", "pendiente", "en_progreso", "pospuesta", "resuelta", "descartada"];

export default function NotificacionesPage() {
  const [data,setData]=useState<Page>({items:[],total:0,page:1,page_size:25,unread:0});
  const [page,setPage]=useState(1); const [estado,setEstado]=useState(""); const [clase,setClase]=useState(""); const [prioridad,setPrioridad]=useState(""); const [texto,setTexto]=useState(""); const [error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{ try { setError(null); const q=new URLSearchParams({page:String(page),page_size:"25"}); if(estado)q.set("estado",estado); if(clase)q.set("clase",clase); if(prioridad)q.set("prioridad",prioridad); if(texto)q.set("texto",texto); setData(await apiFetch<Page>(`/api/v1/notificaciones/?${q}`)); } catch(e){setError(e instanceof ApiError?e.message:"No se pudieron cargar las alertas");}},[page,estado,clase,prioridad,texto]);
  useEffect(()=>{void load()},[load]);
  async function action(id:number, next:string){let body:any={estado:next}; if(next==="descartada"){const justificacion=window.prompt("Justificación obligatoria"); if(!justificacion)return; body.justificacion=justificacion;} if(next==="pospuesta")body.pospuesta_hasta=new Date(Date.now()+86400000).toISOString(); await apiFetch(`/api/v1/notificaciones/${id}/estado`,{method:"PATCH",body:JSON.stringify(body)}); window.dispatchEvent(new Event("notifications-updated")); await load();}
  async function read(item:Item){if(!item.leida)await apiFetch(`/api/v1/notificaciones/${item.id}/leer`,{method:"PATCH"});}
  return <section className="space-y-4">
    <header className="border-b border-stone-800/10 pb-4"><p className="text-xs font-semibold uppercase tracking-[.22em] text-stone-500">Centro de trabajo</p><h1 className="mt-2 text-2xl font-semibold">Alertas y notificaciones</h1><p className="mt-2 text-sm text-stone-600">Acciones operativas e información, separadas por estado y fecha.</p></header>
    {error&&<p className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="Sin leer" value={data.unread}/><Metric label="Resultados" value={data.total}/><Metric label="Página" value={data.page}/></div>
    <div className="flex flex-wrap gap-2">
      <input value={texto} onChange={e=>{setTexto(e.target.value);setPage(1)}} placeholder="Buscar" className="rounded-lg border px-3 py-2 text-sm" />
      <select value={estado} onChange={e=>{setEstado(e.target.value);setPage(1)}} className="rounded-lg border px-3 py-2 text-sm">{estados.map(x=><option key={x} value={x}>{x||"Estados activos"}</option>)}</select>
      <select value={clase} onChange={e=>{setClase(e.target.value);setPage(1)}} className="rounded-lg border px-3 py-2 text-sm"><option value="">Todas las clases</option><option value="accion">Acción</option><option value="informativa">Informativa</option></select>
      <select value={prioridad} onChange={e=>{setPrioridad(e.target.value);setPage(1)}} className="rounded-lg border px-3 py-2 text-sm"><option value="">Todas las prioridades</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select>
    </div>
    <div className="space-y-6">{Object.entries(Object.groupBy?.(data.items,x=>x.estado) ?? data.items.reduce((a,x)=>{(a[x.estado]??=[]).push(x);return a},{ } as Record<string,Item[]>)).map(([group,items])=><div key={group}><h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-stone-500">{group.replaceAll("_"," ")}</h2><div className="divide-y border bg-white">{items!.map(item=><article key={item.id} className={item.leida?"p-4":"bg-amber-50/50 p-4"}><div className="flex flex-wrap justify-between gap-3"><Link href={item.href} onClick={()=>void read(item)}><p className="font-semibold">{item.titulo}</p><p className="mt-1 text-sm text-stone-600">{item.mensaje}</p><p className="mt-2 text-xs text-stone-500">{formatDateTime(item.fecha)} · {item.prioridad} · Oficina {item.oficina_id}</p></Link>{item.clase==="accion"&&!["resuelta","descartada"].includes(item.estado)&&<div className="flex flex-wrap gap-2"><Btn text="En progreso" onClick={()=>action(item.id,"en_progreso")}/><Btn text="Posponer 1 día" onClick={()=>action(item.id,"pospuesta")}/><Btn text="Resolver" onClick={()=>action(item.id,"resuelta")}/><Btn text="Descartar" onClick={()=>action(item.id,"descartada")}/></div>}</div></article>)}</div></div>)}</div>
    <div className="flex justify-between"><button disabled={page===1} onClick={()=>setPage(p=>p-1)} className="button-muted rounded-lg px-3 py-2 disabled:opacity-40">Anterior</button><button disabled={page*25>=data.total} onClick={()=>setPage(p=>p+1)} className="button-muted rounded-lg px-3 py-2 disabled:opacity-40">Siguiente</button></div>
  </section>;
}
function Metric({label,value}:{label:string;value:number}){return <div className="border-b p-3"><p className="text-xs uppercase text-stone-500">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>}
function Btn({text,onClick}:{text:string;onClick:()=>void}){return <button onClick={onClick} className="h-fit rounded-lg border px-2.5 py-1.5 text-xs hover:bg-stone-50">{text}</button>}
