import { expect, test } from "@playwright/test";

test("cliente pide desde la mesa y cocina lo prepara", async ({ page, browser }) => {
  await page.goto("/menu?mesa=7");
  await expect(page.getByText("Estás pidiendo desde la mesa 7.")).toBeVisible();
  await page.getByRole("button", { name: "Agregar uno de Guacamole en molcajete" }).click();
  await page.getByRole("button", { name: "Agregar uno de Horchata" }).click();
  await page.getByRole("button", { name: "Agregar uno de Horchata" }).click();
  await expect(page.locator("#cartsum")).toHaveText("3 productos · $235.00");

  await page.getByRole("button", { name: "Ver pedido" }).click();
  await expect(page.getByLabel("Número de mesa")).toHaveValue("7");
  await expect(page.getByLabel("Teléfono")).toBeHidden();
  await page.getByLabel("Nombre").fill("Prueba E2E");
  await page.getByRole("button", { name: "Enviar pedido" }).click();

  await expect(page).toHaveURL(/\/pedido\?t=[0-9a-f]{48}$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pedido A-");
  const code = (await page.getByRole("heading", { level: 1 }).innerText()).replace("Pedido ", "");

  const staff = await browser.newPage();
  await staff.goto("/cocina");
  await staff.getByLabel("Usuario").fill("cocina");
  await staff.getByLabel("Contraseña").fill("demo-cocina-2026");
  await staff.getByRole("button", { name: "Entrar" }).click();
  const ticket = staff.getByRole("article", { name: `Pedido ${code}` });
  await ticket.getByRole("button", { name: "Empezar" }).click();
  await staff.getByRole("article", { name: `Pedido ${code}` }).getByRole("button", { name: "Marcar listo" }).click();

  await expect(page.getByText("Listo").first()).toBeVisible({ timeout: 15000 });
  await staff.close();
});

test("valida campos de domicilio antes de enviar", async ({ page }) => {
  await page.goto("/menu");
  await page.getByRole("button", { name: "Agregar uno de Limonada mineral" }).click();
  await page.getByRole("button", { name: "Ver pedido" }).click();
  await page.getByText("A domicilio").click();
  await page.getByLabel("Nombre").fill("Sin Direccion");
  await page.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(page.getByRole("alert")).toContainText("Datos inválidos");
  await expect(page.getByLabel("Dirección de entrega")).toHaveAttribute("aria-invalid", "true");
});

test("páginas legales, 404 y cabeceras de seguridad", async ({ page, request }) => {
  for (const path of ["/aviso-legal", "/privacidad", "/cookies", "/terminos"]) {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
  }
  const missing = await page.goto("/no-existe-esta-pagina");
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Esta página no está en la carta" })).toBeVisible();

  const home = await request.get("/");
  const h = home.headers();
  expect(h["content-security-policy"]).toContain("default-src 'self'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["strict-transport-security"]).toContain("max-age");
});

test("panel rechaza acceso sin sesión y no muestra datos", async ({ request }) => {
  expect((await request.get("/api/admin/items")).status()).toBe(401);
  expect((await request.get("/api/staff/orders")).status()).toBe(401);
});

test("sin errores de consola ni scroll horizontal en móvil", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of ["/", "/menu", "/admin", "/cocina"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
  expect(errors.filter((e) => !e.includes("401"))).toEqual([]);
});
