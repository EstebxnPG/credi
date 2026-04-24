import { ModulePage } from "@/components/module-page";

export default function LogsPage() {
  return (
    <ModulePage
      eyebrow="Auditoria"
      title="Logs del sistema"
      description="Aqui puedes aterrizar una tabla de auditoria para administradores, con filtros por usuario, accion, tabla y fecha."
      primaryAction="Filtrar actividad"
      secondaryAction="Exportar vista"
      bullets={[
        "Conectar GET /logs con filtros por query string.",
        "Mostrar valores antes y despues en drawer lateral.",
        "Usar esto para soporte y trazabilidad operativa.",
      ]}
    />
  );
}
