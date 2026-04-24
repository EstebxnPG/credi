import { ModulePage } from "@/components/module-page";

export default function PagaduriasPage() {
  return (
    <ModulePage
      eyebrow="Catalogo operativo"
      title="Pagadurias"
      description="Este modulo desbloquea la operacion diaria porque alimenta la FK del credito. Ideal para dejarlo funcional temprano."
      primaryAction="Crear pagaduria"
      secondaryAction="Ver catalogo"
      bullets={[
        "Conectar CRUD simple como oficinas.",
        "Usar selector en formulario de credito.",
        "Preparar busqueda rapida por nombre.",
      ]}
    />
  );
}
