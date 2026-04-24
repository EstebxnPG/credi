import { ModulePage } from "@/components/module-page";

export default function UsuariosPage() {
  return (
    <ModulePage
      eyebrow="Accesos"
      title="Usuarios y roles"
      description="Pantalla reservada para administracion de usuarios, asignacion de oficina y control de roles dentro del sistema."
      primaryAction="Crear usuario"
      secondaryAction="Revisar roles"
      bullets={[
        "Conectar CRUD de usuarios.",
        "Mostrar rol, oficina, intentos fallidos y estado.",
        "Agregar acciones rapidas de activacion y revision.",
      ]}
    />
  );
}
