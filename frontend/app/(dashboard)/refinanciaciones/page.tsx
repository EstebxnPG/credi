import { ModulePage } from "@/components/module-page";

export default function RefinanciacionesPage() {
  return (
    <ModulePage
      eyebrow="Casos asociados"
      title="Refinanciaciones"
      description="Este modulo ya tiene lugar para listar refinanciaciones ligadas a cada credito y crear nuevas entradas sin perder trazabilidad."
      primaryAction="Nueva refinanciacion"
      secondaryAction="Filtrar por credito"
      bullets={[
        "Consumir GET, POST y PATCH del backend.",
        "Montar formulario compacto dentro del detalle del credito.",
        "Relacionar refinanciaciones con reportes mas adelante.",
      ]}
    />
  );
}
