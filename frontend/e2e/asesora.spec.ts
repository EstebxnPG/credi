import { expect, test } from "@playwright/test";

import { expectNoClientErrors, expectShell } from "./helpers";

test.describe("asesora", () => {
  test("no ve navegación administrativa restringida", async ({ page }) => {
    await page.goto("/dashboard");
    await expectShell(page, "Asesora E2E");
    await expect(page.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Auditoría" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Reportes" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Créditos" })).toBeVisible();
    await expectNoClientErrors(page);
  });

  test("solo ve notificaciones de su oficina", async ({ page }) => {
    await page.goto("/notificaciones");
    await expect(page.getByRole("heading", { name: "Alertas y notificaciones" })).toBeVisible();
    await expect(page.getByText("E2E oficina principal")).toBeVisible();
    await expect(page.getByText("E2E oficina dos")).toHaveCount(0);
    await expectNoClientErrors(page);
  });

  test("no puede acceder por URL directa a usuarios ni auditoría", async ({ page }) => {
    await page.goto("/usuarios");
    await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
    await expect(page.getByText("Solo administradores pueden realizar esta acción")).toBeVisible();

    await page.goto("/logs");
    await expect(page.getByRole("heading", { name: "Auditoría" })).toBeVisible();
    await expect(page.getByText("Solo administradores pueden realizar esta acción")).toBeVisible();
    await expectNoClientErrors(page);
  });

  test("puede abrir flujos operativos de créditos y pensionados", async ({ page }) => {
    await page.goto("/creditos");
    await expect(page.getByRole("heading", { name: "Solicitudes y estados" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Crear crédito" })).toBeVisible();

    await page.goto("/pensionados");
    await expect(page.getByRole("heading", { name: "Contactos y base comercial" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Crear pensionado" })).toBeVisible();
    await expectNoClientErrors(page);
  });
});
