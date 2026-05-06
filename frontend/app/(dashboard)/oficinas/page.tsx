"use client";

import { CatalogPage } from "@/components/catalog-page";

export default function OficinasPage() {
  return (
    <CatalogPage
      title="Oficinas"
      description="Aqui administras las sedes de la operacion. Este catalogo alimenta usuarios, creditos, filtros por cobertura y futuros reportes de productividad."
      endpoint="/api/v1/oficinas"
      fields={[
        { key: "nombre", label: "Nombre", requiredOnCreate: true },
        {
          key: "direccion",
          label: "Direccion",
          type: "textarea",
          placeholder: "Calle, barrio, ciudad o referencia",
          requiredOnCreate: true,
        },
      ]}
      getSummary={(items) => [
        { label: "Total", value: String(items.length) },
        {
          label: "Activas",
          value: String(items.filter((item) => item.is_active !== false).length),
        },
        {
          label: "Inactivas",
          value: String(items.filter((item) => item.is_active === false).length),
        },
      ]}
      getItemSubtitle={(item) => String(item.direccion ?? "Sin direccion registrada")}
      renderDetailRows={(item) => [
        { label: "Nombre", value: String(item.nombre) },
        {
          label: "Direccion",
          value: String(item.direccion ?? "No registrada"),
        },
        {
          label: "Estado",
          value: item.is_active === false ? "Inactiva" : "Activa",
        },
      ]}
    />
  );
}
