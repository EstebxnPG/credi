"use client";

import { CatalogPage } from "@/components/catalog-page";

export default function PagaduriasPage() {
  return (
    <CatalogPage
      title="Pagadurias"
      description="Aqui administras las pagadurias que luego se usan en creditos. Es un catalogo corto, pero muy importante para que el flujo comercial no dependa de datos inventados."
      endpoint="/api/v1/pagadurias"
      fields={[
        {
          key: "nombre",
          label: "Nombre",
          placeholder: "Ej: Colpensiones Regional Norte",
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
      renderDetailRows={(item) => [
        { label: "Nombre", value: String(item.nombre) },
        {
          label: "Estado",
          value: item.is_active === false ? "Inactiva" : "Activa",
        },
      ]}
    />
  );
}
