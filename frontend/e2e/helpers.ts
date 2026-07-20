import { expect, type Page } from "@playwright/test";

export async function expectNoClientErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
}

export async function expectShell(page: Page, userName: string) {
  await expect(page.getByRole("heading", { name: "Centro operativo" })).toBeVisible();
  await expect(page.getByText(userName)).toBeVisible();
}

export async function selectSearchOption(page: Page, label: string, searchText: string, optionText: string) {
  const placeholders: Record<string, RegExp> = {
    Pensionado: /Buscar pensionado/i,
    Cooperativa: /Buscar cooperativa/i,
    Pagaduria: /Buscar pagaduria/i,
  };
  await page.getByPlaceholder(placeholders[label] ?? new RegExp(label, "i")).fill(searchText);
  await page.getByRole("button", { name: new RegExp(optionText, "i") }).first().click();
}
