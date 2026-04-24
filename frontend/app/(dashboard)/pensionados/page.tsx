import { ModulePage } from "@/components/module-page";

export default function PensionadosPage() {
  return (
    <ModulePage
      eyebrow="Captacion"
      title="Modulo de pensionados"
      description="Este espacio sera el listado, alta y edicion de pensionados. Ya puedes conectar aqui busqueda por documento, formulario y navegacion al detalle."
      primaryAction="Crear pensionado"
      secondaryAction="Ver listado"
      bullets={[
        "Consumir GET y POST de pensionados.",
        "Agregar buscador por documento y nombre.",
        "Preparar formulario reutilizable para crear y editar.",
      ]}
    />
  );
}
