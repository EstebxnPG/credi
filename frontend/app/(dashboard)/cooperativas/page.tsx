import { ModulePage } from "@/components/module-page";

export default function CooperativasPage() {
  return (
    <ModulePage
      eyebrow="Catalogo admin"
      title="Cooperativas"
      description="Aqui vas a editar reglas de validacion, montos, plazos y porcentaje de comision. Es clave para el negocio porque condiciona la creacion del credito."
      primaryAction="Crear cooperativa"
      secondaryAction="Editar reglas"
      bullets={[
        "Conectar CRUD admin con tabla simple.",
        "Resaltar rangos de edad, monto y plazo.",
        "Agregar estado activa/inactiva visible en el listado.",
      ]}
    />
  );
}
