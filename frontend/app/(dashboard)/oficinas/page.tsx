import { ModulePage } from "@/components/module-page";

export default function OficinasPage() {
  return (
    <ModulePage
      eyebrow="Cobertura"
      title="Oficinas"
      description="Modulo sencillo para administrar sedes y usarlas como base de filtros, productividad y control comercial."
      primaryAction="Crear oficina"
      secondaryAction="Ver sedes"
      bullets={[
        "Montar CRUD rapido con tabla y formulario lateral.",
        "Usar oficinas como filtro global en creditos.",
        "Preparar este modulo para reportes de productividad.",
      ]}
    />
  );
}
