import { expect, test } from "@playwright/test";

import { expectNoClientErrors, expectShell } from "./helpers";

test.describe("admin", () => {
  test("ve navegación administrativa y módulos principales", async ({ page }) => {
    await page.goto("/dashboard");
    await expectShell(page, "Admin E2E");
    await expect(page.getByRole("link", { name: "Usuarios" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Auditoría" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Reportes" })).toBeVisible();
    await expectNoClientErrors(page);

    const routes = [
      ["/pensionados", "Contactos y base comercial"],
      ["/creditos", "Solicitudes y estados"],
      ["/seguimientos", "Contactos y próximas gestiones"],
      ["/notificaciones", "Alertas y notificaciones"],
      ["/usuarios", "Usuarios"],
      ["/reportes", "Control operativo"],
    ] as const;

    for (const [route, heading] of routes) {
      await page.goto(route);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      await expect(page.getByText("[object Object]")).toHaveCount(0);
      await expectNoClientErrors(page);
    }
  });

  test("ve notificaciones de varias oficinas y puede marcarlas leídas", async ({ page }) => {
    await page.goto("/notificaciones");
    await expect(page.getByRole("heading", { name: "Alertas y notificaciones" })).toBeVisible();
    await expect(page.getByText("E2E oficina principal")).toBeVisible();
    await expect(page.getByText("E2E oficina dos")).toBeVisible();

    await page.getByRole("button", { name: "Marcar todas como leídas" }).click();
    await expect(page.getByText("[object Object]")).toHaveCount(0);
    await expectNoClientErrors(page);
  });

  test("puede abrir el modal de crédito sin romper UI", async ({ page }) => {
    await page.goto("/creditos");
    await page.getByRole("button", { name: "Crear crédito" }).click();
    await expect(page.getByText("Nuevo crédito")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Crear solicitud" })).toBeVisible();
    const creditForm = page.locator("form").filter({ hasText: "Crear solicitud" });
    await expect(creditForm.getByRole("button", { name: "Crear crédito" })).toBeVisible();
    await expect(creditForm.getByRole("button", { name: "Cancelar" })).toBeVisible();
    await expectNoClientErrors(page);
  });

  test("puede abrir el modal de pensionado con crédito asociado", async ({ page }) => {
    await page.goto("/pensionados");
    await page.getByRole("button", { name: "Crear pensionado" }).click();
    await expect(page.getByText("Nuevo pensionado")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Crear pensionado" })).toBeVisible();
    await page.getByLabel("Crear crédito para este pensionado").check();
    await expect(page.getByText("Guarda el pensionado y crea la solicitud de")).toBeVisible();
    await expectNoClientErrors(page);
  });
});
