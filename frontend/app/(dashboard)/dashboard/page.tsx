"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { readSession, type SessionUser } from "@/lib/session";

type Credito = {
  id: number;
  oficina_id: number;
  estado: string;
  monto_solicitado: number;
  monto_aprobado: number | null;
  tiene_documentos_pendientes: boolean;
  documentos_pendientes: string | null;
  created_at: string;
};

type Seguimiento = {
  id: number;
  oficina_id: number;
  pensionado_nombre: string | null;
  tipo: string;
  estado: string;
  fecha_proximo_contacto: string | null;
  usuario_nombre: string | null;
};

type Notificacion = {
  id: number;
  oficina_id: number;
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

type Oficina = {
  id: number;
  nombre: string;
  direccion: string;
  color: "blue" | "red" | "teal" | "amber" | "stone";
  is_active: boolean;
};

type OfficeSummary = Oficina & {
  creditos_total: number;
  creditos_mes: number;
  aprobados_mes: number;
  tasa_aprobacion: number;
  monto_solicitado: number;
  monto_aprobado: number;
  creditos_friccion: number;
  seguimientos_vencidos: number;
  refinanciaciones_listas: number;
  alertas_pendientes: number;
  cumpleanos_hoy: number;
};

type BirthdayToday = {
  id: number;
  nombre: string;
  documento: string;
  oficina_id: number;
  fecha_nacimiento: string | null;
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
  oficinas_resumen?: OfficeSummary[];
  cumpleanos_hoy?: BirthdayToday[];
};

type CreditSummary = {
  creditos: number;
  aprobados: number;
  solicitado: number;
  aprobado: number;
};

type TaskItem = {
  id: number | string;
  officeId: number;
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
      summary={summary}
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
  const officeCards = summary?.oficinas_resumen ?? [];
  const maxOffice = Math.max(...officeCards.map((x) => x.creditos_mes), 1);
  const maxAdvisor = Math.max(...(summary?.productividad_asesoras.map((x) => x.creditos) ?? [1]));
  const approvalRate = k?.tasa_aprobacion ?? 0;

  const risks: TaskItem[] = [
    ...criticalNotifications.map((x) => ({
      id: `n-${x.id}`,
      officeId: x.oficina_id,
      title: x.titulo,
      detail: x.mensaje,
      meta: x.prioridad,
      href: x.href,
      tone: "rose" as const,
    })),
    ...overdue.map((x) => ({
      id: `s-${x.id}`,
      officeId: x.oficina_id,
      title: x.pensionado_nombre ?? `Seguimiento #${x.id}`,
      detail: x.usuario_nombre ? `Responsable: ${x.usuario_nombre}` : x.tipo,
      meta: x.fecha_proximo_contacto ? formatDateTime(x.fecha_proximo_contacto) : "Sin fecha",
      href: `/seguimientos/${x.id}`,
      tone: "amber" as const,
    })),
    ...frictionCredits.map((x) => ({
      id: `c-${x.id}`,
      officeId: x.oficina_id,
      title: `Crédito #${x.id}`,
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
        text="KPIs del mes, fricción operativa y productividad para decidir dónde intervenir."
        links={[
          ["Reportes", "/reportes"],
          ["Auditoría", "/logs"],
          ["Usuarios", "/usuarios"],
        ]}
      />  

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Créditos del mes global"
          value={k?.creditos_mes ?? 0}
          note={`${k?.creditos_total ?? 0} históricos`}
        />
        <Metric
          label="Aprobados del mes global"
          value={k?.creditos_aprobados_mes ?? 0}
          note={`${approvalRate}% aprobación global`}
          tone={approvalRate >= 50 ? "teal" : "amber"}
        />
        <Metric
          label="Monto solicitado global"
          value={formatCurrency(creditSummary?.solicitado)}
          note={`${formatCurrency(creditSummary?.aprobado)} aprobado`}
          tone="teal"
        />
        <Metric
          label="Pendientes críticos global"
          value={overdue.length + frictionCredits.length + criticalNotifications.length}
          note="Vencidos, devueltos y alertas"
          tone="rose"
        />
      </div>

      <Panel title="KPIs por oficina" subtitle="Cada sede tiene su propio pulso, aunque este en cero">
        {officeCards.length ? (
          <div className="grid gap-2 xl:grid-cols-2">
            {officeCards.map((office) => (
              <OfficeCard key={office.id} office={office} max={maxOffice} />
            ))}
          </div>
        ) : (
          <Empty text="No hay oficinas registradas" />
        )}
      </Panel>

      <div className="grid gap-3 xl:grid-cols-[1.1fr_.9fr]">
        <Panel title="Pendientes críticos por oficina" subtitle="Elementos que requieren decisión o seguimiento">
          <OfficeRiskList items={risks} offices={officeCards} />
        </Panel>
        <Panel title="Reporte corto del mes" subtitle="Resumen ejecutivo">
          <div className="grid gap-2 sm:grid-cols-2">
            <MiniReport label="Solicitudes" value={creditSummary?.creditos ?? 0} href="/reportes" />
            <MiniReport label="Aprobadas" value={creditSummary?.aprobados ?? 0} href="/reportes" />
            <MiniReport label="Refinanciaciones listas" value={ready.length} href="/refinanciaciones" />
            <MiniReport label="Cumpleaños hoy" value={summary?.cumpleanos_hoy?.length ?? 0} href="/pensionados" />
          </div>
        </Panel>
      </div>

      <BirthdayPanel items={summary?.cumpleanos_hoy ?? []} />

      <div className="grid gap-3 lg:grid-cols-[1.15fr_.85fr]">
        <Panel title="Estados del flujo" subtitle="Distribución actual de créditos">
          <div className="grid gap-2 sm:grid-cols-2">
            {summary?.creditos_por_estado.map((x) => (
              <div key={x.estado} className="rounded-md border border-stone-800/10 bg-stone-50 px-3 py-2">
                <p className="text-xs text-stone-500">{x.estado}</p>
                <p className="mt-0.5 text-lg font-semibold">{x.total}</p>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Productividad por asesora" subtitle="Ranking de creación de créditos">
          {summary?.productividad_asesoras.length ? (
            summary.productividad_asesoras
              .slice(0, 8)
              .map((x) => <Bar key={x.nombre} label={x.nombre} value={x.creditos} max={maxAdvisor} />)
          ) : (
            <Empty text="Sin actividad por asesora" />
          )}
        </Panel>
      </div>

    </section>
  );
}

function AdvisorHome({
  session,
  credits,
  followups,
  notifications,
  opportunities,
  summary,
}: {
  session: SessionUser;
  credits: Credito[];
  followups: Seguimiento[];
  notifications: Notificacion[];
  opportunities: Opportunity[];
  summary: Summary | null;
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
        text="Trabaja primero lo vencido, después lo programado y luego las oportunidades comerciales."
        links={[
          ["Nuevo crédito", "/creditos"],
          ["Registrar seguimiento", "/seguimientos"],
          ["Refinanciaciones", "/refinanciaciones"],
        ]}
      />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Vencidos" value={overdue.length} note="Requieren contacto" tone="rose" />
        <Metric label="Hoy" value={todayItems.length} note="Agenda del dia" tone="amber" />
        <Metric label="Refinanciaciones" value={ready.length} note="Listas para gestionar" tone="teal" />
        <Metric label="Cumpleaños hoy" value={summary?.cumpleanos_hoy?.length ?? 0} note="Clientes de tu oficina" tone="amber" />
      </div>
      <BirthdayPanel items={summary?.cumpleanos_hoy ?? []} />
      <div className="grid gap-3 lg:grid-cols-[1.1fr_.9fr]">
        <Panel title="Prioridad de trabajo" subtitle="Seguimientos vencidos y de hoy">
          <TaskList
            items={[...overdue, ...todayItems].slice(0, 8).map((x) => ({
              id: x.id,
              officeId: 0,
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
              officeId: 0,
              title: x.pensionado_nombre ?? `Crédito #${x.credito_id}`,
              detail: x.cooperativa_nombre ?? "Sin cooperativa",
              meta: x.disponible_desde ? formatDate(x.disponible_desde) : x.estado_comercial,
              href: `/creditos/${x.credito_id}`,
              tone: "teal",
            }))}
          />
        </Panel>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Créditos con fricción" subtitle="Correcciones y documentación pendiente">
          <TaskList
            items={[
              ...returned.map((x) => ({
                id: `returned-${x.id}`,
                officeId: x.oficina_id,
                title: `Crédito #${x.id} devuelto`,
                detail: x.estado,
                href: `/creditos/${x.id}`,
                tone: "rose" as const,
              })),
              ...docs.map((x) => ({
                id: `docs-${x.id}`,
                officeId: x.oficina_id,
                title: `Crédito #${x.id} - documentos`,
                detail: x.documentos_pendientes ?? "Documentación pendiente",
                href: `/creditos/${x.id}`,
                tone: "amber" as const,
              })),
            ].slice(0, 8)}
          />
        </Panel>
        <Panel title="Próximas tareas" subtitle="Seguimientos programados después de hoy">
          <TaskList
            items={upcoming.slice(0, 8).map((x) => ({
              id: x.id,
              officeId: 0,
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

function OfficeCard({ office, max }: { office: OfficeSummary; max: number }) {
  const colorClasses: Record<Oficina["color"], string> = {
    blue: "border-blue-700/20 bg-blue-50 text-blue-800",
    red: "border-red-500/20 bg-red-50 text-red-700",
    teal: "border-teal-700/20 bg-teal-50 text-teal-800",
    amber: "border-amber-700/20 bg-amber-50 text-amber-800",
    stone: "border-stone-800/10 bg-stone-100 text-stone-700",
  };
  const progress = max > 0 ? Math.max(office.creditos_mes > 0 ? 6 : 0, (office.creditos_mes / max) * 100) : 0;
  const critical = office.creditos_friccion + office.seguimientos_vencidos + office.alertas_pendientes;

  return (
    <Link
      href={`/reportes?oficina=${office.id}`}
      className="rounded-md border border-stone-800/10 bg-stone-50 px-3 py-3 transition hover:border-teal-700/30 hover:bg-teal-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-stone-950">{office.nombre}</p>
          <p className="mt-1 line-clamp-1 text-xs text-stone-500">{office.direccion}</p>
        </div>
        <span
          className={[
            "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
            office.is_active ? colorClasses[office.color] : "border-stone-800/10 bg-white text-stone-400",
          ].join(" ")}
        >
          {office.is_active ? "Activa" : "Inactiva"}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-stone-500">Créditos mes</p>
          <p className="mt-1 text-xl font-semibold text-stone-950">{office.creditos_mes}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-stone-500">Aprobados</p>
          <p className="mt-1 text-xl font-semibold text-teal-800">{office.aprobados_mes}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-stone-500">Críticos</p>
          <p className={["mt-1 text-xl font-semibold", critical > 0 ? "text-rose-700" : "text-stone-950"].join(" ")}>
            {critical}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-stone-500">Tasa</p>
          <p className="mt-1 text-xl font-semibold text-stone-950">{office.tasa_aprobacion}%</p>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full bg-teal-600/70" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-3 grid gap-1 text-xs text-stone-500">
        <p className="flex justify-between gap-2">
          <span>Total historico</span>
          <strong className="text-stone-700">{office.creditos_total}</strong>
        </p>
        <p className="flex justify-between gap-2">
          <span>Refis listas</span>
          <strong className="text-stone-700">{office.refinanciaciones_listas}</strong>
        </p>
        <p className="flex justify-between gap-2">
          <span>Cumpleaños hoy</span>
          <strong className={office.cumpleanos_hoy > 0 ? "text-amber-700" : "text-stone-700"}>
            {office.cumpleanos_hoy}
          </strong>
        </p>
        <p className="flex justify-between gap-2">
          <span>Monto aprobado</span>
          <strong className="text-stone-700">{formatCurrency(office.monto_aprobado)}</strong>
        </p>
      </div>
    </Link>
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

function BirthdayPanel({ items }: { items: BirthdayToday[] }) {
  return (
    <Panel title="Cumpleaños hoy" subtitle="Clientes que conviene contactar hoy">
      {items.length ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/pensionados/${item.id}`}
              className="rounded-md border border-amber-700/20 bg-amber-50 px-3 py-2 transition hover:border-amber-700/40 hover:bg-amber-100"
            >
              <p className="truncate text-sm font-semibold text-stone-950">{item.nombre}</p>
              <p className="mt-1 text-xs text-amber-800">Documento {item.documento}</p>
            </Link>
          ))}
        </div>
      ) : (
        <Empty text="No hay cumpleaños registrados para hoy" />
      )}
    </Panel>
  );
}

function Attention({ items }: { items: Notificacion[] }) {
  return (
    <Panel title="Notificaciones" subtitle="Alertas pendientes más recientes">
      <TaskList
        items={items.map((x) => ({
          id: x.id,
          officeId: x.oficina_id,
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

function OfficeRiskList({ items, offices }: { items: TaskItem[]; offices: OfficeSummary[] }) {
  if (!offices.length) {
    return <Empty text="No hay oficinas registradas" />;
  }

  const itemsByOffice = new Map<number, TaskItem[]>();
  items.forEach((item) => {
    const current = itemsByOffice.get(item.officeId) ?? [];
    itemsByOffice.set(item.officeId, [...current, item]);
  });

  return (
    <div className="space-y-3">
      {offices.map((office) => {
        const officeItems = itemsByOffice.get(office.id) ?? [];
        return (
          <div key={office.id} className="rounded-md border border-stone-800/10 bg-stone-50 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-stone-950">{office.nombre}</p>
                <p className="text-xs text-stone-500">
                  {officeItems.length} pendiente{officeItems.length === 1 ? "" : "s"} crítico
                  {officeItems.length === 1 ? "" : "s"}
                </p>
              </div>
              <span
                className={[
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  officeItems.length ? "bg-rose-50 text-rose-700" : "bg-teal-50 text-teal-700",
                ].join(" ")}
              >
                {officeItems.length || "OK"}
              </span>
            </div>
            <div className="mt-2">
              {officeItems.length ? (
                <TaskList items={officeItems.slice(0, 5)} />
              ) : (
                <p className="rounded-md bg-white px-3 py-2 text-sm text-stone-500">
                  Sin pendientes críticos.
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
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
    <Empty text="Nada pendiente por aquí" />
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
