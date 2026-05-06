"use client";

import { CatalogPage } from "@/components/catalog-page";

export default function CooperativasPage() {
  return (
    <CatalogPage
      title="Cooperativas"
      description="Aquí administras las reglas que condicionan la creación del crédito: edades, montos, plazos y tiempo mínimo como pensionado."
      endpoint="/api/v1/cooperativas"
      fields={[
        { key: "nombre", label: "Nombre" },
        { key: "edad_minima", label: "Edad mínima", type: "number" },
        { key: "edad_maxima", label: "Edad máxima", type: "number" },
        { key: "monto_minimo", label: "Monto mínimo", type: "number" },
        { key: "monto_maximo", label: "Monto máximo", type: "number" },
        { key: "plazo_minimo", label: "Plazo mínimo", type: "number" },
        { key: "plazo_maximo", label: "Plazo máximo", type: "number" },
        {
          key: "tiempo_minimo_pension",
          label: "Tiempo mínimo pensionado (meses)",
          type: "number",
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
      getItemSubtitle={(item) => `Edad ${item.edad_minima}-${item.edad_maxima}`}
      renderDetailRows={(item) => [
        { label: "Nombre", value: String(item.nombre) },
        {
          label: "Rango de edad",
          value: `${item.edad_minima} a ${item.edad_maxima} años`,
        },
        {
          label: "Rango de monto",
          value: `${item.monto_minimo} a ${item.monto_maximo}`,
        },
        {
          label: "Rango de plazo",
          value: `${item.plazo_minimo} a ${item.plazo_maximo} meses`,
        },
        {
          label: "Tiempo mínimo pensionado",
          value: `${item.tiempo_minimo_pension} meses`,
        },
      ]}
    />
  );
}
