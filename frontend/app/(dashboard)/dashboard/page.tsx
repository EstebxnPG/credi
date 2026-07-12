"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { readSession, type SessionUser } from "@/lib/session";

type Credito = {
  id: number;
  estado: string;
  monto_solicitado: number;
  monto_aprobado: number | null;
  tiene_documentos_pendientes: boolean;
  documentos_pendientes: string | null;
  created_at: string;
};

type Seguimiento = {
  id: number;
  pensionado_nombre: string | null;
  tipo: string;
  estado: string;
  fecha_proximo_contacto: string | null;
  usuario_nombre: string | null;
};

type Notificacion = {
  id: number;
  titulo: string;
  mensaje: string;
  href: string;
  prioridad: string;
  estado: string;
  fecha: string;
};

type Opportunity = {
  credito_id: number;
  pensionado_nombre: string | null;
  estado_refinanciacion: string;
  estado_comercial: string;
};

type Summary = {
  kpis: {
    creditos_total: number;
    creditos_mes: number;
    creditos_activos: number;
    creditos_aprobados: number;
    creditos_aprobados_mes: number;
    tasa_aprobacion: number;
    cumpleanos_30_dias: number;
  };
  creditos_por_estado: Array<{ estado: string; total: number }>;
  productividad_oficinas: Array<{ nombre: string; creditos: number }>;
  productividad_asesoras: Array<{ nombre: string; creditos: number }>;
};

export default function DashboardPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [notifications, setNotifications] = useState<Notificacion[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setSession(readSession()), []);

  useEffect(() => {
    if (!session) return;

    (async () => {
      try {
        const [c, s, n, o, r] = await Promise.all([
          apiFetch<Credito[]>("/api/v1/creditos/?limit=15"),
          apiFetch<Seguimiento[]>("/api/v1/seguimientos/?limit=15"),
          apiFetch<{ items: Notificacion[] }>(
            "/api/v1/notificaciones/?estado=pendiente&page_size=8",
          ),
          apiFetch<Opportunity[]>("/api/v1/refinanciaciones/elegibles/?limit=15"),
          apiFetch<Summary>("/api/v1/reportes/resumen"),
        ]);
        setCreditos(c);
        setSeguimientos(s);
        setNotifications(n.items);
        setOpportunities(o);
        setSummary(r);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "No se pudo cargar el inicio");
      } finally {
        setLoading(false);
      }
    })();
  }, [session]);

  if (loading || !session) return <State text="Preparando tu espacio de trabajo..." />;
  if (error) return <State text={error} error />;

  return session.rol === "administrador" ? (
    <AdminHome
      session={session}
      summary={summary}
      notifications={notifications}
      opportunities={opportunities}
    />
  ) : (
    <AdvisorHome
      session={session}
      credits={creditos}
      followups={seguimientos}
      notifications={notifications}
      opportunities={opportunities}
    />
  );
}

function AdminHome({
  session,
  summary,
  notifications,
  opportunities,
}: {
  session: SessionUser;
  summary: Summary | null;
  notifications: Notificacion[];
  opportunities: Opportunity[];
}) {
  const k = summary?.kpis;
  const ready = opportunities.filter(
    (x) =>
      x.estado_refinanciacion === "Listo" &&
      !["rechazado", "convertido"].includes(x.estado_comercial),
  ).length;
  const maxOffice = Math.max(...(summary?.productividad_oficinas.map((x) => x.creditos) ?? [1]));

  return (
    <section className="space-y-3">
      <Hero
        eyebrow="Vision general"
        title={`Buenos dias, ${session.nombre}`}
        text="Pulso operativo y asuntos que requieren atencion."
        links={[
          ["Ver reportes", "/reportes"],
          ["Exportar creditos", "/reportes"],
          ["Auditoria", "/logs"],
        ]}
      />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Creditos del mes" value={k?.creditos_mes ?? 0} note={`${k?.creditos_total ?? 0} historicos`} />
        <Metric label="Aprobados del mes" value={k?.creditos_aprobados_mes ?? 0} note={`${k?.tasa_aprobacion ?? 0}% aprobacion global`} tone="teal" />
        <Metric label="Oportunidades" value={ready} note={`${opportunities.length} proximas o activas`} tone="amber" />
        <Metric label="Alertas" value={notifications.length} note="Prioridad operativa" tone="rose" />
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.1fr_.9fr]">
        <Panel title="Actividad por oficina" subtitle="Creditos visibles por sede">
          {summary?.productividad_oficinas.length ? (
            summary.productividad_oficinas.map((x) => (
              <Bar key={x.nombre} label={x.nombre} value={x.creditos} max={maxOffice} />
            ))
          ) : (
            <Empty text="Sin actividad por oficina" />
          )}
        </Panel>
        <Panel title="Creditos por estado" subtitle="Distribucion actual del flujo">
          <div className="grid grid-cols-2 gap-2">
            {summary?.creditos_por_estado.map((x) => (
              <div key={x.estado} className="rounded-md bg-stone-50 px-3 py-2">
                <p className="text-xs text-stone-500">{x.estado}</p>
                <p className="mt-0.5 text-lg font-semibold">{x.total}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <Attention items={notifications} />
    </section>
  );
}

function AdvisorHome({
  session,
  credits,
  followups,
  notifications,
  opportunities,
}: {
  session: SessionUser;
  credits: Credito[];
  followups: Seguimiento[];
  notifications: Notificacion[];
  opportunities: Opportunity[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const accionables = followups.filter((x) => ["abierto", "pendiente"].includes(x.estado));
  const overdue = accionables.filter(
    (x) => x.fecha_proximo_contacto && x.fecha_proximo_contacto.slice(0, 10) < today,
  );
  const todayItems = accionables.filter((x) => x.fecha_proximo_contacto?.slice(0, 10) === today);
  const returned = credits.filter((x) => x.estado.toLowerCase().includes("devuelto"));
  const docs = credits.filter((x) => x.tiene_documentos_pendientes);
  const ready = opportunities.filter(
    (x) =>
      x.estado_refinanciacion === "Listo" &&
      !["rechazado", "convertido"].includes(x.estado_comercial),
  );

  return (
    <section className="space-y-3">
      <Hero
        eyebrow="Tu jornada"
        title={`Hola, ${session.nombre}`}
        text="Empieza por lo vencido, continua con lo programado y revisa oportunidades."
        links={[
          ["Nuevo credito", "/creditos"],
          ["Registrar seguimiento", "/seguimientos"],
          ["Refinanciaciones", "/refinanciaciones"],
        ]}
      />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Vencidos" value={overdue.length} note="Requieren contacto" tone="rose" />
        <Metric label="Hoy" value={todayItems.length} note="Agenda del dia" tone="amber" />
        <Metric label="Devueltos" value={returned.length} note="Pendientes de correccion" />
        <Metric label="Para refinanciar" value={ready.length} note="Oportunidades disponibles" tone="teal" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Prioridad de hoy" subtitle="Seguimientos vencidos y programados">
          <TaskList
            items={[...overdue, ...todayItems].slice(0, 6).map((x) => ({
              id: x.id,
              title: x.pensionado_nombre ?? `Seguimiento #${x.id}`,
              detail: x.fecha_proximo_contacto ? formatDateTime(x.fecha_proximo_contacto) : x.tipo,
              href: `/seguimientos/${x.id}`,
            }))}
          />
        </Panel>
        <Panel title="Creditos con friccion" subtitle="Correcciones y documentacion">
          <TaskList
            items={[
              ...returned.map((x) => ({
                id: x.id,
                title: `Credito #${x.id} devuelto`,
                detail: x.estado,
                href: `/creditos/${x.id}`,
              })),
              ...docs.map((x) => ({
                id: x.id + 100000,
                title: `Credito #${x.id} - documentos`,
                detail: x.documentos_pendientes ?? "Documentacion pendiente",
                href: `/creditos/${x.id}`,
              })),
            ].slice(0, 6)}
          />
        </Panel>
      </div>
      <Attention items={notifications} />
    </section>
  );
}

function Hero({
  eyebrow,
  title,
  text,
  links,
}: {
  eyebrow: string;
  title: string;
  text: string;
  links: string[][];
}) {
  return (
    <article className="rounded-lg border border-stone-800/10 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-teal-700">
            {eyebrow}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-stone-950">{title}</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-stone-600">{text}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {links.map(([label, href], i) => (
            <Link key={label} href={href} className={i === 0 ? "button-primary" : "button-muted"}>
              {label}
            </Link>
          ))}
        </div>
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  note,
  tone = "stone",
}: {
  label: string;
  value: number;
  note: string;
  tone?: string;
}) {
  const colors: Record<string, string> = {
    stone: "text-stone-950",
    teal: "text-teal-800",
    amber: "text-amber-700",
    rose: "text-rose-700",
  };

  return (
    <div className="rounded-lg border border-stone-800/10 bg-white px-3 py-2.5 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-stone-500">
        {label}
      </p>
      <p className={`mt-1 text-xl font-semibold ${colors[tone]}`}>{value}</p>
      <p className="mt-0.5 text-xs text-stone-500">{note}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-lg border border-stone-800/10 bg-white p-3 shadow-sm">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p>
      <div className="mt-3 space-y-2">{children}</div>
    </article>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
        <div
          className="h-full rounded-full bg-teal-600/70"
          style={{ width: `${Math.max(5, (value / max) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function Attention({ items }: { items: Notificacion[] }) {
  return (
    <Panel title="Atencion operativa" subtitle="Alertas pendientes mas recientes">
      <TaskList
        items={items.map((x) => ({
          id: x.id,
          title: x.titulo,
          detail: x.mensaje,
          href: x.href,
        }))}
      />
    </Panel>
  );
}

function TaskList({
  items,
}: {
  items: Array<{ id: number; title: string; detail: string; href: string }>;
}) {
  return items.length ? (
    <div className="divide-y divide-stone-800/10">
      {items.map((x) => (
        <Link
          key={x.id}
          href={x.href}
          className="flex items-center justify-between gap-3 py-2 transition hover:text-teal-800"
        >
          <div>
            <p className="text-sm font-semibold">{x.title}</p>
            <p className="mt-0.5 line-clamp-1 text-xs text-stone-500">{x.detail}</p>
          </div>
          <span aria-hidden>→</span>
        </Link>
      ))}
    </div>
  ) : (
    <Empty text="Nada pendiente por aqui" />
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-md bg-stone-50 p-3 text-center text-sm text-stone-500">{text}</p>;
}

function State({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <div
      className={
        error
          ? "rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          : "rounded-md border bg-white p-3 text-sm text-stone-500"
      }
    >
      {text}
    </div>
  );
}
