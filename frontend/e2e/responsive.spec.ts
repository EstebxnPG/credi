import { expect, test } from "@playwright/test";

import { expectNoClientErrors } from "./helpers";

test("pantallas críticas no se rompen en móvil", async ({ page }) => {
  for (const [route, heading] of [
    ["/dashboard", "Centro operativo"],
    ["/creditos", "Solicitudes y estados"],
    ["/pensionados", "Contactos y base comercial"],
    ["/notificaciones", "Alertas y notificaciones"],
  ] as const) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByText("[object Object]")).toHaveCount(0);
    await expectNoClientErrors(page);
  }
});
