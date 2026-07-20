import { expect, test } from "@playwright/test";

const ADMIN = {
  correo: "admin.e2e@crediconfiemos.com",
  contrasena: "AdminE2E2026*",
};

test.describe("autenticacion", () => {
  test("redirige rutas internas a login con next cuando no hay sesion", async ({ page }) => {
    await page.goto("/creditos");

    await expect(page).toHaveURL(/\/login\?next=%2Fcreditos$/);
    await expect(page.getByRole("heading", { name: /Inicia sesi/i })).toBeVisible();
  });

  test("muestra error legible con credenciales incorrectas", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("Ingresa tu correo").fill(ADMIN.correo);
    await page.locator('input[type="password"]').fill("clave-incorrecta");
    await page.getByRole("button", { name: "Entrar al panel" }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText("[object Object]")).toHaveCount(0);
    await expect(page.locator(".text-red-700")).toContainText(/\w+/);
  });

  test("limpia sesion expirada y vuelve a login", async ({ page }) => {
    const expiredToken = [
      btoa(JSON.stringify({ alg: "none", typ: "JWT" })),
      btoa(JSON.stringify({ sub: "1", exp: 1 })),
      "signature",
    ].join(".");

    await page.addInitScript((token) => {
      window.localStorage.setItem(
        "credi.session",
        JSON.stringify({
          accessToken: token,
          nombre: "Admin E2E",
          rol: "administrador",
          oficinaId: 1,
        }),
      );
    }, expiredToken);

    await page.goto("/creditos");

    await expect(page).toHaveURL(/\/login\?next=%2Fcreditos$/);
    await expect(
      page.evaluate(() => window.localStorage.getItem("credi.session")),
    ).resolves.toBeNull();
  });

  test("login valido entra al dashboard y logout borra sesion", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("Ingresa tu correo").fill(ADMIN.correo);
    await page.locator('input[type="password"]').fill(ADMIN.contrasena);
    await page.getByRole("button", { name: "Entrar al panel" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("banner").getByText("Admin E2E")).toBeVisible();

    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.evaluate(() => window.localStorage.getItem("credi.session")),
    ).resolves.toBeNull();
  });
});
