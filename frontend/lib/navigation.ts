export type NavItem = {
  href: string;
  label: string;
  description: string;
  adminOnly?: boolean;
};

export const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Resumen",
    description: "Vista operativa del dia",
  },
  {
    href: "/pensionados",
    label: "Pensionados",
    description: "Captacion y seguimiento",
  },
  {
    href: "/creditos",
    label: "Creditos",
    description: "Gestion comercial y estados",
  },
  {
    href: "/documentos",
    label: "Documentos",
    description: "Carga y versionado",
  },
  {
    href: "/refinanciaciones",
    label: "Refinanciaciones",
    description: "Casos asociados a creditos",
  },
  {
    href: "/cooperativas",
    label: "Cooperativas",
    description: "Reglas y comisiones",
    adminOnly: true,
  },
  {
    href: "/oficinas",
    label: "Oficinas",
    description: "Cobertura comercial",
    adminOnly: true,
  },
  {
    href: "/pagadurias",
    label: "Pagadurias",
    description: "Catalogo operativo",
    adminOnly: true,
  },
  {
    href: "/usuarios",
    label: "Usuarios",
    description: "Roles y accesos",
    adminOnly: true,
  },
  {
    href: "/logs",
    label: "Logs",
    description: "Auditoria del sistema",
    adminOnly: true,
  },
  {
    href: "/reportes",
    label: "Reportes",
    description: "Indicadores y exportaciones",
    adminOnly: true,
  },
];
