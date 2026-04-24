import { ModulePage } from "@/components/module-page";

const focusAreas = [
  "Conectar tarjetas resumen con endpoints reales de creditos, estados y productividad.",
  "Pintar alertas por documentos pendientes y creditos devueltos.",
  "Agregar indicadores visibles para administracion y asesoras.",
];

export default function DashboardPage() {
  return (
    <ModulePage
      eyebrow="Resumen general"
      title="Tu tablero ya esta listo para convertirse en centro operativo."
      description="Aqui vas a concentrar metas del dia, conversion comercial, creditos por estado y alertas de trabajo pendientes. Por ahora queda una base limpia y coherente con el negocio."
      primaryAction="Conectar resumen"
      secondaryAction="Definir widgets"
      bullets={focusAreas}
    />
  );
}
