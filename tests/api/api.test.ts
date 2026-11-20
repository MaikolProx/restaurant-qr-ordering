import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../../src/server/types";
import { client, makeEnv, validOrder } from "../helpers";

let env: Env;
let dispose: () => Promise<void>;

beforeEach(async () => {
  ({ env, dispose } = await makeEnv());
});
afterEach(async () => {
  await dispose();
});

describe("menú público", () => {
  it("lista categorías y productos con precios", async () => {
    const r = await client(env).call("GET", "/menu");
    expect(r.status).toBe(200);
    expect(r.json.restaurant.name).toBe("Sabor Norteño");
    expect(r.json.categories).toHaveLength(4);
    expect(r.json.categories[1].items[0]).toMatchObject({ name: "Tacos de arrachera (3)", price_cents: 18900 });
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("pedidos", () => {
  it("crea un pedido con total calculado en el servidor", async () => {
    const c = client(env);
    const r = await c.call("POST", "/orders", { ...validOrder, items: [{ item_id: 4, qty: 2 }] });
    expect(r.status).toBe(201);
    expect(r.json.total_cents).toBe(37800);
    expect(r.json.code).toMatch(/^A-\d{4}$/);
    expect(r.json.token).toMatch(/^[0-9a-f]{48}$/);

    const status = await c.call("GET", `/orders/${r.json.token}`);
    expect(status.status).toBe(200);
    expect(status.json.status).toBe("nuevo");
    expect(status.json.id).toBeUndefined();
    expect(status.json.items[0]).toMatchObject({ name: "Tacos de arrachera (3)", qty: 2 });
  });

  it("rechaza un precio enviado por el cliente", async () => {
    const r = await client(env).call("POST", "/orders", { ...validOrder, items: [{ item_id: 4, qty: 1, price_cents: 1 }] });
    expect(r.status).toBe(400);
  });

  it("valida campos según el tipo de pedido", async () => {
    const c = client(env);
    const sinMesa = await c.call("POST", "/orders", { ...validOrder, table_no: undefined });
    expect(sinMesa.status).toBe(400);
    expect(sinMesa.json.fields.table_no).toBeDefined();
    const domicilio = await c.call("POST", "/orders", { ...validOrder, type: "domicilio" });
    expect(domicilio.status).toBe(400);
    expect(domicilio.json.fields.address).toBeDefined();
  });

  it("cobra envío a domicilio", async () => {
    const r = await client(env).call("POST", "/orders", {
      type: "domicilio",
      customer_name: "Luis",
      phone: "81 1234 5678",
      address: "Calle Falsa 123, Centro",
      items: [{ item_id: 10, qty: 1 }],
    });
    expect(r.status).toBe(201);
    expect(r.json.total_cents).toBe(4500 + 3500);
  });

  it("rechaza productos agotados con 422", async () => {
    await env.DB.prepare("UPDATE items SET available = 0 WHERE id = 4").run();
    const r = await client(env).call("POST", "/orders", validOrder);
    expect(r.status).toBe(422);
    expect(r.json.code).toBe("item_unavailable");
  });

  it("rechaza pedidos con el restaurante cerrado", async () => {
    await env.DB.prepare("UPDATE settings SET value = '0' WHERE key = 'is_open'").run();
    expect((await client(env).call("POST", "/orders", validOrder)).status).toBe(409);
  });

  it("bloquea el honeypot anti-spam", async () => {
    expect((await client(env).call("POST", "/orders", { ...validOrder, website: "spam" })).status).toBe(400);
  });

  it("exige JSON y rechaza cuerpos enormes", async () => {
    const c = client(env);
    expect((await c.call("POST", "/orders", undefined, { "content-type": "text/plain" })).status).toBe(415);
    const big = { ...validOrder, notes: "x".repeat(20000) };
    expect((await c.call("POST", "/orders", big)).status).toBe(413);
  });

  it("limita pedidos por IP (429)", async () => {
    const c = client(env);
    for (let i = 0; i < 10; i++) expect((await c.call("POST", "/orders", validOrder)).status).toBe(201);
    expect((await c.call("POST", "/orders", validOrder)).status).toBe(429);
    c.setIp("203.0.113.99");
    expect((await c.call("POST", "/orders", validOrder)).status).toBe(201);
  });

  it("devuelve 404 a tokens inválidos o inexistentes", async () => {
    const c = client(env);
    expect((await c.call("GET", "/orders/123")).status).toBe(404);
    expect((await c.call("GET", `/orders/${"a".repeat(48)}`)).status).toBe(404);
  });
});

describe("autenticación y permisos", () => {
  it("rechaza credenciales incorrectas y limita intentos", async () => {
    const c = client(env);
    for (let i = 0; i < 5; i++) expect((await c.login("admin", "mala")).status).toBe(401);
    expect((await c.login("admin", "demo-admin-2026")).status).toBe(429);
  });

  it("no revela si el usuario existe", async () => {
    const c = client(env);
    const a = await c.login("noexiste", "x");
    const b = await c.login("admin", "x");
    expect(a.status).toBe(401);
    expect(a.json.error).toBe(b.json.error);
  });

  it("emite cookie segura de sesión", async () => {
    const c = client(env);
    const r = await c.call("POST", "/auth/login", { username: "admin", password: "demo-admin-2026" });
    const cookie = r.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("__Host-sn_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
  });

  it("protege rutas de personal (401 sin sesión, 403 sin rol)", async () => {
    const anon = client(env);
    expect((await anon.call("GET", "/staff/orders")).status).toBe(401);
    const cocina = client(env);
    expect((await cocina.login("cocina", "demo-cocina-2026")).status).toBe(200);
    expect((await cocina.call("GET", "/staff/orders")).status).toBe(200);
    expect((await cocina.call("GET", "/admin/items")).status).toBe(403);
  });

  it("exige token CSRF en cambios", async () => {
    const c = client(env);
    await c.login("admin", "demo-admin-2026");
    c.clearCsrf();
    expect((await c.call("PATCH", "/admin/settings", { is_open: false })).status).toBe(403);
  });

  it("cierra sesión", async () => {
    const c = client(env);
    await c.login("admin", "demo-admin-2026");
    await c.call("POST", "/auth/logout");
    expect((await c.call("GET", "/auth/me")).status).toBe(401);
  });
});

describe("flujo de cocina", () => {
  it("avanza estados válidos y rechaza saltos", async () => {
    const pub = client(env);
    const order = await pub.call("POST", "/orders", validOrder);
    const cocina = client(env);
    await cocina.login("cocina", "demo-cocina-2026");
    const list = await cocina.call("GET", "/staff/orders");
    const id = list.json.orders[0].id as number;
    expect(list.json.orders[0].items).toHaveLength(2);

    expect((await cocina.call("PATCH", `/staff/orders/${id}`, { status: "entregado" })).status).toBe(409);
    expect((await cocina.call("PATCH", `/staff/orders/${id}`, { status: "preparando" })).status).toBe(200);
    expect((await cocina.call("PATCH", `/staff/orders/${id}`, { status: "listo" })).status).toBe(200);
    expect((await pub.call("GET", `/orders/${order.json.token}`)).json.status).toBe("listo");
    expect((await cocina.call("PATCH", `/staff/orders/999`, { status: "listo" })).status).toBe(404);
  });
});

describe("administración", () => {
  it("edita productos, horarios y genera reporte", async () => {
    const admin = client(env);
    await admin.login("admin", "demo-admin-2026");

    expect((await admin.call("PATCH", "/admin/items/4", { price_cents: 19900, available: false })).status).toBe(200);
    const items = await admin.call("GET", "/admin/items");
    expect(items.json.items.find((i: { id: number }) => i.id === 4)).toMatchObject({ price_cents: 19900, available: false });

    const created = await admin.call("POST", "/admin/items", { category_id: 1, name: "Elote asado", price_cents: 6500 });
    expect(created.status).toBe(201);
    expect((await admin.call("POST", "/admin/items", { category_id: 99, name: "X", price_cents: 1 })).status).toBe(400);
    expect((await admin.call("PATCH", "/admin/items/4", { evil: "x" })).status).toBe(400);

    expect((await admin.call("PATCH", "/admin/settings", { is_open: true, hours: "13:00 a 22:00" })).json.hours).toBe("13:00 a 22:00");

    await client(env).call("POST", "/orders", { ...validOrder, items: [{ item_id: 10, qty: 3 }] });
    const rep = await admin.call("GET", "/admin/report");
    expect(rep.json.orders).toBe(1);
    expect(rep.json.revenue_cents).toBe(13500);
    const csv = await admin.call("GET", "/admin/report.csv");
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(String(csv.json)).toContain('"Horchata","3","135.00"');
  });

  it("neutraliza fórmulas en el CSV", async () => {
    const admin = client(env);
    await admin.login("admin", "demo-admin-2026");
    await admin.call("POST", "/admin/items", { category_id: 1, name: "=HYPERLINK(1)", price_cents: 100 });
    const items = await admin.call("GET", "/admin/items");
    const evil = items.json.items.find((i: { name: string }) => i.name.startsWith("="));
    await client(env).call("POST", "/orders", { ...validOrder, items: [{ item_id: evil.id, qty: 1 }] });
    const csv = await admin.call("GET", "/admin/report.csv");
    expect(String(csv.json)).toContain(`"'=HYPERLINK(1)"`);
  });
});
