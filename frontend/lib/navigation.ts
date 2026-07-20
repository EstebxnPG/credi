export type NavSection = "operacion" | "configuracion";

export type NavItem = {
  href: string;
  label: string;
  description: string;
  section: NavSection;
  adminOnly?: boolean;
};

export const navSections: Array<{ key: NavSection; label: string }> = [
  { key: "operacion", label: "Operación" },
  { key: "configuracion", label: "Configuración" },
];

export const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Inicio",
    description: "Resumen operativo del día",
    section: "operacion",
  },
  {
    href: "/creditos",
    label: "Créditos",
    description: "Gestión de solicitudes y estados",
    section: "operacion",
  },
  {
    href: "/refinanciaciones",
    label: "Oportunidades",
    description: "Refinanciaciones y créditos nuevos",
    section: "operacion",
  },
  {
    href: "/pensionados",
    label: "Pensionados",
    description: "Contactos, datos base e historial comercial",
    section: "operacion",
  },
  {
    href: "/seguimientos",
    label: "Seguimientos",
    description: "Contactos realizados y próximas gestiones",
    section: "operacion",
  },
  {
    href: "/notificaciones",
    label: "Notificaciones",
    description: "Alertas y eventos de la operación",
    section: "operacion",
  },
  {
    href: "/usuarios",
    label: "Usuarios",
    description: "Roles, oficinas y accesos",
    section: "configuracion",
    adminOnly: true,
  },
  {
    href: "/cooperativas",
    label: "Cooperativas",
    description: "Reglas comerciales de aprobación",
    section: "configuracion",
  },
  {
    href: "/oficinas",
    label: "Oficinas",
    description: "Sedes y cobertura operacional",
    section: "configuracion",
    adminOnly: true,
  },
  {
    href: "/pagadurias",
    label: "Pagadurías",
    description: "Entidades pagadoras usadas en créditos",
    section: "configuracion",
    adminOnly: true,
  },
  {
    href: "/reportes",
    label: "Reportes",
    description: "Indicadores de gestión",
    section: "configuracion",
    adminOnly: true,
  },
  {
    href: "/logs",
    label: "Auditoría",
    description: "Registro de acciones del sistema",
    section: "configuracion",
    adminOnly: true,
  },
];
