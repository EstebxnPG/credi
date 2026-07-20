import { expect, test } from "@playwright/test";

import { expectNoClientErrors, expectShell, selectSearchOption } from "./helpers";

test.describe("admin", () => {
  test("ve navegacion administrativa y modulos principales", async ({ page }) => {
    await page.goto("/dashboard");
    await expectShell(page, "Admin E2E");
    await expect(page.getByRole("link", { name: "Usuarios" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Auditor/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Reportes" })).toBeVisible();
    await expectNoClientErrors(page);

    const routes = [
      ["/pensionados", "Contactos y base comercial"],
      ["/creditos", "Solicitudes y estados"],
      ["/seguimientos", /Contactos y pr.*ximas gestiones/i],
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

  test("ve notificaciones de varias oficinas y puede marcarlas leidas", async ({ page }) => {
    await page.goto("/notificaciones");
    await expect(page.getByRole("heading", { name: "Alertas y notificaciones" })).toBeVisible();
    await expect(page.getByText("E2E oficina principal")).toBeVisible();
    await expect(page.getByText("E2E oficina dos")).toBeVisible();

    await page.getByRole("button", { name: /Marcar todas como le.*das/i }).click();
    await expect(page.getByText("[object Object]")).toHaveCount(0);
    await expectNoClientErrors(page);
  });

  test("puede abrir el modal de credito sin romper UI", async ({ page }) => {
    await page.goto("/creditos");
    await page.getByRole("button", { name: /Crear cr.*dito/i }).click();
    await expect(page.getByText(/Nuevo cr.*dito/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Crear solicitud" })).toBeVisible();
    const creditForm = page.locator("form").filter({ hasText: "Crear solicitud" });
    await expect(creditForm.getByRole("button", { name: /Crear cr.*dito/i })).toBeVisible();
    await expect(creditForm.getByRole("button", { name: "Cancelar" })).toBeVisible();
    await expectNoClientErrors(page);
  });

  test("puede abrir el modal de pensionado con credito asociado", async ({ page }) => {
    await page.goto("/pensionados");
    await page.getByRole("button", { name: "Crear pensionado" }).click();
    await expect(page.getByText("Nuevo pensionado")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Crear pensionado" })).toBeVisible();
    await page.getByLabel(/Crear cr.*dito para este pensionado/i).check();
    await expect(page.getByText("Guarda el pensionado y crea la solicitud de")).toBeVisible();
    await expectNoClientErrors(page);
  });

  test("busca pensionados por nombre y conserva estado vacio explicito", async ({ page }) => {
    await page.goto("/pensionados");

    await page.getByLabel("Buscar").fill("880001001");
    await expect(page.getByText("ALFA E2E PRUEBA QA")).toBeVisible();
    await expect(page.getByText("880001002")).toHaveCount(0);

    await page.getByLabel("Buscar").fill("SIN-RESULTADOS-E2E");
    await expect(page.getByText(/No hay pensionados para/i)).toBeVisible();
    await expect(page.getByText("[object Object]")).toHaveCount(0);
    await expectNoClientErrors(page);
  });

  test("valida errores de pensionado sin crear registros invalidos", async ({ page }) => {
    await page.goto("/pensionados");
    await page.getByRole("button", { name: "Crear pensionado" }).click();
    const form = page.locator("form").filter({ hasText: "Crear pensionado" });

    await form.getByRole("textbox", { name: "Nombre", exact: true }).fill("QA");
    await form.getByLabel("Apellidos").fill("Prueba QA");
    await form.getByLabel("Documento").fill("ABC123");
    await form.getByLabel("Fecha de nacimiento").fill("2027-01-01");
    await form.getByLabel("Correo").fill("correo-invalido");
    await form.getByLabel("Telefono").fill("6015550199");
    await form.getByLabel("Direccion").fill("Direccion prueba");
    await form.getByRole("button", { name: "Crear pensionado" }).click();

    const correoValido = await form.getByLabel("Correo").evaluate((input) =>
      input instanceof HTMLInputElement ? input.validity.valid : true,
    );
    expect(correoValido).toBe(false);

    await form.getByLabel("Correo").fill("qa.invalido@example.com");
    await form.getByRole("button", { name: "Crear pensionado" }).click();
    await expect(page.getByText(/Documento debe tener entre 6 y 12/)).toBeVisible();
    await expect(page.getByText("[object Object]")).toHaveCount(0);
    await expectNoClientErrors(page);
  });

  test("valida reglas basicas al crear credito", async ({ page }) => {
    await page.goto("/creditos");
    await page.getByRole("button", { name: /Crear cr.*dito/i }).click();
    const form = page.locator("form").filter({ hasText: "Crear solicitud" });

    await selectSearchOption(page, "Pensionado", "880001001", "ALFA E2E");
    await selectSearchOption(page, "Cooperativa", "Cooperativa E2E", "Cooperativa E2E");
    await selectSearchOption(page, "Pagaduria", "Pagaduria E2E", "Pagaduria E2E");
    await form.getByLabel("Monto solicitado").fill("0");
    await form.getByRole("spinbutton", { name: "Plazo", exact: true }).fill("0");
    await form.getByRole("checkbox", { name: "Documentos pendientes" }).check();
    await form.getByRole("button", { name: /Crear cr.*dito/i }).click();

    await expect(page.getByText(/monto solicitado debe ser mayor a 0/i)).toBeVisible();
    await expect(page.getByText("[object Object]")).toHaveCount(0);

    await form.getByLabel("Monto solicitado").fill("1000000");
    await form.getByRole("spinbutton", { name: "Plazo", exact: true }).fill("12");
    await form.getByLabel("Tipo de credito").selectOption("COMPRA CARTERA");
    await form.getByRole("button", { name: /Crear cr.*dito/i }).click();
    await expect(page.getByText(/entidad financiera/i)).toBeVisible();
    await expectNoClientErrors(page);
  });

  test("busca creditos por pensionado, documento, libranza y cooperativa", async ({ page }) => {
    await page.goto("/creditos");

    const search = page.getByPlaceholder(/Buscar por credito/i);
    for (const term of ["880001001", "E2E-LIB-001", "Cooperativa E2E", "ALFA E2E"]) {
      await search.fill(term);
      await expect(page.getByText("E2E-LIB-001")).toBeVisible();
      await expect(page.getByText("[object Object]")).toHaveCount(0);
    }
    await expectNoClientErrors(page);
  });
});
