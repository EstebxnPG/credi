import { ModulePage } from "@/components/module-page";

export default function DocumentosPage() {
  return (
    <ModulePage
      eyebrow="Soporte documental"
      title="Documentos y versionado"
      description="La pantalla ya tiene lugar para subir archivos, ver versiones y desactivar documentos. Por ahora el backend guarda en disco local temporal mientras conectamos MinIO."
      primaryAction="Subir documento"
      secondaryAction="Ver versiones"
      bullets={[
        "Conectar upload con multipart/form-data.",
        "Mostrar lista por credito y estado activo/inactivo.",
        "Pintar reemplazo de version sin perder historico.",
      ]}
    />
  );
}
