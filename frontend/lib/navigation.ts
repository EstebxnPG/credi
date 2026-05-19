export type NavSection = "trabajo" | "crm" | "admin";

export type NavItem = {
  href: string;
  label: string;
  description: string;
  section: NavSection;
  adminOnly?: boolean;
};

export const navSections: Array<{ key: NavSection; label: string }> = [
  { key: "trabajo", label: "Trabajo" },
  { key: "crm", label: "CRM" },
  { key: "admin", label: "Administracion" },
];

export const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Inicio",
    description: "Bandeja de trabajo del dia",
    section: "trabajo",
  },
  {
    href: "/creditos",
    label: "Creditos",
    description: "Gestion comercial y estados",
    section: "trabajo",
  },
  {
    href: "/documentos",
    label: "Documentos",
    description: "Carga y versionado",
    section: "trabajo",
  },
  {
    href: "/refinanciaciones",
    label: "Refinanciaciones",
    description: "Casos asociados a creditos",
    section: "trabajo",
  },
  {
    href: "/pensionados",
    label: "Contactos",
    description: "Ficha 360 y seguimiento comercial",
    section: "crm",
  },
  {
    href: "/reportes",
    label: "Reportes",
    description: "Indicadores y exportaciones",
    section: "admin",
    adminOnly: true,
  },
  {
    href: "/usuarios",
    label: "Usuarios",
    description: "Roles y accesos",
    section: "admin",
    adminOnly: true,
  },
  {
    href: "/oficinas",
    label: "Oficinas",
    description: "Cobertura comercial",
    section: "admin",
    adminOnly: true,
  },
  {
    href: "/cooperativas",
    label: "Cooperativas",
    description: "Reglas de aprobacion",
    section: "admin",
    adminOnly: true,
  },
  {
    href: "/pagadurias",
    label: "Pagadurias",
    description: "Catalogo operativo",
    section: "admin",
    adminOnly: true,
  },
  {
    href: "/logs",
    label: "Logs",
    description: "Auditoria del sistema",
    section: "admin",
    adminOnly: true,
  },
];
