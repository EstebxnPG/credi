"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
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
  cooperativa_nombre?: string | null;
  monto_aprobado?: number | null;
  disponible_desde?: string | null;
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

type CreditSummary = {
  creditos: number;
  aprobados: number;
  solicitado: number;
  aprobado: number;
};

type TaskItem = {
  id: number | string;
  title: string;
  detail: string;
  meta?: string;
  href: string;
  tone?: "stone" | "teal" | "amber" | "rose";
};

export default function DashboardPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [notifications, setNotifications] = useState<Notificacion[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [creditSummary, setCreditSummary] = useState<CreditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setSession(readSession()), []);

  useEffect(() => {
    if (!session) return;

    (async () => {
      try {
        const [c, s, n, o, r, cr] = await Promise.all([
          apiFetch<Credito[]>("/api/v1/creditos/?limit=20"),
          apiFetch<Seguimiento[]>("/api/v1/seguimientos/?solo_pendientes=true&limit=20"),
          apiFetch<{ items: Notificacion[] }>(
            "/api/v1/notificaciones/?estado=pendiente&page_size=10",
          ),
          apiFetch<Opportunity[]>("/api/v1/refinanciaciones/elegibles/?limit=20"),
          apiFetch<Summary>("/api/v1/reportes/resumen"),
          apiFetch<CreditSummary>("/api/v1/reportes/creditos/resumen"),
        ]);
        setCreditos(c);
        setSeguimientos(s);
        setNotifications(n.items);
        setOpportunities(o);
        setSummary(r);
        setCreditSummary(cr);
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
    <SuperAdminHome
      session={session}
      summary={summary}
      creditSummary={creditSummary}
      followups={seguimientos}
      credits={creditos}
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

function SuperAdminHome({
  session,
  summary,
  creditSummary,
  followups,
  credits,
  notifications,
  opportunities,
}: {
  session: SessionUser;
  summary: Summary | null;
  creditSummary: CreditSummary | null;
  followups: Seguimiento[];
  credits: Credito[];
  notifications: Notificacion[];
  opportunities: Opportunity[];
}) {
  const k = summary?.kpis;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = followups.filter(
    (x) =>
      ["abierto", "pendiente"].includes(x.estado) &&
      x.fecha_proximo_contacto &&
      x.fecha_proximo_contacto.slice(0, 10) < today,
  );
  const ready = opportunities.filter(
    (x) =>
      x.estado_refinanciacion === "Listo" &&
      !["rechazado", "convertido"].includes(x.estado_comercial),
  );
  const frictionCredits = credits.filter(
    (x) => x.tiene_documentos_pendientes || x.estado.toLowerCase().includes("devuelto"),
  );
  const criticalNotifications = notifications.filter((x) =>
    ["alta", "critica", "crítica"].includes(x.prioridad.toLowerCase()),
  );
  const maxOffice = Math.max(...(summary?.productividad_oficinas.map((x) => x.creditos) ?? [1]));
  const maxAdvisor = Math.max(...(summary?.productividad_asesoras.map((x) => x.creditos) ?? [1]));
  const approvalRate = k?.tasa_aprobacion ?? 0;

  const risks: TaskItem[] = [
    ...criticalNotifications.map((x) => ({
      id: `n-${x.id}`,
      title: x.titulo,
      detail: x.mensaje,
      meta: x.prioridad,
      href: x.href,
      tone: "rose" as const,
    })),
    ...overdue.map((x) => ({
      id: `s-${x.id}`,
      title: x.pensionado_nombre ?? `Seguimiento #${x.id}`,
      detail: x.usuario_nombre ? `Responsable: ${x.usuario_nombre}` : x.tipo,
      meta: x.fecha_proximo_contacto ? formatDateTime(x.fecha_proximo_contacto) : "Sin fecha",
      href: `/seguimientos/${x.id}`,
      tone: "amber" as const,
    })),
    ...frictionCredits.map((x) => ({
      id: `c-${x.id}`,
      title: `Credito #${x.id}`,
      detail: x.documentos_pendientes ?? x.estado,
      meta: x.estado,
      href: `/creditos/${x.id}`,
      tone: "stone" as const,
    })),
  ].slice(0, 8);

  return (
    <section className="space-y-3">
      <Hero
        eyebrow="Superadmin"
        title={`Control gerencial, ${session.nombre}`}
        text="KPIs del mes, friccion operativa y productividad para decidir donde intervenir."
        links={[
          ["Reportes", "/reportes"],
          ["Auditoria", "/logs"],
          ["Usuarios", "/usuarios"],
        ]}
      />

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Creditos del mes"
          value={k?.creditos_mes ?? 0}
          note={`${k?.creditos_total ?? 0} historicos`}
        />
        <Metric
          label="Aprobados del mes"
          value={k?.creditos_aprobados_mes ?? 0}
          note={`${approvalRate}% aprobacion global`}
          tone={approvalRate >= 50 ? "teal" : "amber"}
        />
        <Metric
          label="Monto solicitado"
          value={formatCurrency(creditSummary?.solicitado)}
          note={`${formatCurrency(creditSummary?.aprobado)} aprobado`}
          tone="teal"
        />
        <Metric
          label="Friccion abierta"
          value={overdue.length + frictionCredits.length + criticalNotifications.length}
          note="Vencidos, devueltos y alertas"
          tone="rose"
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.1fr_.9fr]">
        <Panel title="Riesgo operativo" subtitle="Elementos que requieren decision o seguimiento">
          <TaskList items={risks} />
        </Panel>
        <Panel title="Reporte corto del mes" subtitle="Resumen ejecutivo antes de entrar a Superset">
          <div className="grid gap-2 sm:grid-cols-2">
            <MiniReport label="Solicitudes" value={creditSummary?.creditos ?? 0} href="/reportes" />
            <MiniReport label="Aprobadas" value={creditSummary?.aprobados ?? 0} href="/reportes" />
            <MiniReport label="Refinanciaciones listas" value={ready.length} href="/refinanciaciones" />
            <MiniReport label="Cumpleanos 30 dias" value={k?.cumpleanos_30_dias ?? 0} href="/pensionados" />
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Productividad por oficina" subtitle="Volumen visible de creditos">
          {summary?.productividad_oficinas.length ? (
            summary.productividad_oficinas
              .slice(0, 8)
              .map((x) => <Bar key={x.nombre} label={x.nombre} value={x.creditos} max={maxOffice} />)
          ) : (
            <Empty text="Sin actividad por oficina" />
          )}
        </Panel>
        <Panel title="Productividad por asesora" subtitle="Ranking de creacion de creditos">
          {summary?.productividad_asesoras.length ? (
            summary.productividad_asesoras
              .slice(0, 8)
              .map((x) => <Bar key={x.nombre} label={x.nombre} value={x.creditos} max={maxAdvisor} />)
          ) : (
            <Empty text="Sin actividad por asesora" />
          )}
        </Panel>
      </div>

      <Panel title="Estados del flujo" subtitle="Distribucion actual de creditos">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {summary?.creditos_por_estado.map((x) => (
            <div key={x.estado} className="rounded-md border border-stone-800/10 bg-stone-50 px-3 py-2">
              <p className="text-xs text-stone-500">{x.estado}</p>
              <p className="mt-0.5 text-lg font-semibold">{x.total}</p>
            </div>
          ))}
        </div>
      </Panel>
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
  const actionable = followups.filter((x) => ["abierto", "pendiente"].includes(x.estado));
  const overdue = actionable.filter(
    (x) => x.fecha_proximo_contacto && x.fecha_proximo_contacto.slice(0, 10) < today,
  );
  const todayItems = actionable.filter((x) => x.fecha_proximo_contacto?.slice(0, 10) === today);
  const upcoming = actionable.filter(
    (x) => x.fecha_proximo_contacto && x.fecha_proximo_contacto.slice(0, 10) > today,
  );
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
        eyebrow="Centro operativo"
        title={`Tu jornada, ${session.nombre}`}
        text="Trabaja primero lo vencido, despues lo programado y luego las oportunidades comerciales."
        links={[
          ["Nuevo credito", "/creditos"],
          ["Registrar seguimiento", "/seguimientos"],
          ["Refinanciaciones", "/refinanciaciones"],
        ]}
      />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Vencidos" value={overdue.length} note="Requieren contacto" tone="rose" />
        <Metric label="Hoy" value={todayItems.length} note="Agenda del dia" tone="amber" />
        <Metric label="Refinanciaciones" value={ready.length} note="Listas para gestionar" tone="teal" />
        <Metric label="Notificaciones" value={notifications.length} note="Pendientes asignadas" />
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.1fr_.9fr]">
        <Panel title="Prioridad de trabajo" subtitle="Seguimientos vencidos y de hoy">
          <TaskList
            items={[...overdue, ...todayItems].slice(0, 8).map((x) => ({
              id: x.id,
              title: x.pensionado_nombre ?? `Seguimiento #${x.id}`,
              detail: x.tipo,
              meta: x.fecha_proximo_contacto ? formatDateTime(x.fecha_proximo_contacto) : "Sin fecha",
              href: `/seguimientos/${x.id}`,
              tone: overdue.some((item) => item.id === x.id) ? "rose" : "amber",
            }))}
          />
        </Panel>
        <Panel title="Refinanciaciones listas" subtitle="Oportunidades para contactar">
          <TaskList
            items={ready.slice(0, 8).map((x) => ({
              id: x.credito_id,
              title: x.pensionado_nombre ?? `Credito #${x.credito_id}`,
              detail: x.cooperativa_nombre ?? "Sin cooperativa",
              meta: x.disponible_desde ? formatDate(x.disponible_desde) : x.estado_comercial,
              href: `/creditos/${x.credito_id}`,
              tone: "teal",
            }))}
          />
        </Panel>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Creditos con friccion" subtitle="Correcciones y documentacion pendiente">
          <TaskList
            items={[
              ...returned.map((x) => ({
                id: `returned-${x.id}`,
                title: `Credito #${x.id} devuelto`,
                detail: x.estado,
                href: `/creditos/${x.id}`,
                tone: "rose" as const,
              })),
              ...docs.map((x) => ({
                id: `docs-${x.id}`,
                title: `Credito #${x.id} - documentos`,
                detail: x.documentos_pendientes ?? "Documentacion pendiente",
                href: `/creditos/${x.id}`,
                tone: "amber" as const,
              })),
            ].slice(0, 8)}
          />
        </Panel>
        <Panel title="Proximas tareas" subtitle="Seguimientos programados despues de hoy">
          <TaskList
            items={upcoming.slice(0, 8).map((x) => ({
              id: x.id,
              title: x.pensionado_nombre ?? `Seguimiento #${x.id}`,
              detail: x.tipo,
              meta: x.fecha_proximo_contacto ? formatDateTime(x.fecha_proximo_contacto) : "Sin fecha",
              href: `/seguimientos/${x.id}`,
            }))}
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
  value: number | string;
  note: string;
  tone?: "stone" | "teal" | "amber" | "rose";
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
      <p className={`mt-1 truncate text-xl font-semibold ${colors[tone]}`}>{value}</p>
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
      <div className="mb-1 flex justify-between gap-3 text-xs">
        <span className="truncate">{label}</span>
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

function MiniReport({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-md border border-stone-800/10 bg-stone-50 px-3 py-2 transition hover:border-teal-700/30 hover:bg-teal-50"
    >
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-stone-950">{value}</p>
    </Link>
  );
}

function Attention({ items }: { items: Notificacion[] }) {
  return (
    <Panel title="Notificaciones" subtitle="Alertas pendientes mas recientes">
      <TaskList
        items={items.map((x) => ({
          id: x.id,
          title: x.titulo,
          detail: x.mensaje,
          meta: x.prioridad,
          href: x.href,
          tone: x.prioridad.toLowerCase().includes("alta") ? "rose" : "stone",
        }))}
      />
    </Panel>
  );
}

function TaskList({ items }: { items: TaskItem[] }) {
  const toneClasses: Record<string, string> = {
    stone: "bg-stone-400",
    teal: "bg-teal-600",
    amber: "bg-amber-500",
    rose: "bg-rose-600",
  };

  return items.length ? (
    <div className="divide-y divide-stone-800/10">
      {items.map((x) => (
        <Link
          key={x.id}
          href={x.href}
          className="flex items-center justify-between gap-3 py-2 transition hover:text-teal-800"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${toneClasses[x.tone ?? "stone"]}`} />
              <p className="truncate text-sm font-semibold">{x.title}</p>
            </div>
            <p className="mt-0.5 line-clamp-1 text-xs text-stone-500">{x.detail}</p>
          </div>
          <span className="shrink-0 text-right text-xs font-medium text-stone-500">
            {x.meta ?? "Ver"}
          </span>
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
