import { ModulePage } from "@/components/module-page";

export default function ReportesPage() {
  return (
    <ModulePage
      eyebrow="Analitica"
      title="Reportes estrategicos"
      description="Esta vista queda preparada para metricas de aprobacion, comisiones, productividad y exportaciones. Es un placeholder listo para conectar cuando terminemos la parte visual base."
      primaryAction="Definir indicadores"
      secondaryAction="Conectar fuentes"
      bullets={[
        "Construir tarjetas KPI y tablas resumidas.",
        "Agregar filtros por fecha, oficina y asesora.",
        "Conectar Excel y PDF cuando el backend lo exponga.",
      ]}
    />
  );
}
