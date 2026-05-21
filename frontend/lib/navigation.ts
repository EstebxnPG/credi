export type NavSection = "operacion" | "configuracion";

export type NavItem = {
  href: string;
  label: string;
  description: string;
  section: NavSection;
  adminOnly?: boolean;
};

export const navSections: Array<{ key: NavSection; label: string }> = [
  { key: "operacion", label: "Operacion" },
  { key: "configuracion", label: "Configuracion" },
];

export const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Inicio",
    description: "Resumen operativo del dia",
    section: "operacion",
  },
  {
    href: "/creditos",
    label: "Creditos",
    description: "Gestion de solicitudes y estados",
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
    description: "Contactos realizados y proximas gestiones",
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
    description: "Reglas comerciales de aprobacion",
    section: "configuracion",
    adminOnly: true,
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
    label: "Pagadurias",
    description: "Entidades pagadoras usadas en creditos",
    section: "configuracion",
    adminOnly: true,
  },
  {
    href: "/reportes",
    label: "Reportes",
    description: "Indicadores de gestion",
    section: "configuracion",
    adminOnly: true,
  },
  {
    href: "/logs",
    label: "Auditoria",
    description: "Registro de acciones del sistema",
    section: "configuracion",
    adminOnly: true,
  },
];
