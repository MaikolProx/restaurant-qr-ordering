import { Hono } from "hono";
import { API_HEADERS } from "./headers";
import type { Context } from "hono";
import type { ZodError, ZodType } from "zod";
import { createSession, destroySession, loadSession, requireRole, verifyCredentials } from "./auth";
import { canTransition, OrderError, orderCode, priceOrder } from "./domain/orders";
import { hitRateLimit, RULES } from "./ratelimit";
import { randomToken } from "./security";
import type { AppVariables, Env, MenuItemRow, OrderStatus, OrderType } from "./types";
import { itemInput, itemPatch, loginInput, orderInput, reportQuery, settingsPatch, statusInput } from "./validation";

type App = { Bindings: Env; Variables: AppVariables };
type Ctx = Context<App>;

const MAX_BODY_BYTES = 16 * 1024;

function clientIp(c: Ctx): string {
  return c.req.header("cf-connecting-ip") ?? "local";
}

function issues(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) out[i.path.join(".") || "_"] ??= i.message;
  return out;
}

async function readJson<T>(c: Ctx, schema: ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; res: Response }> {
  const len = Number(c.req.header("content-length") ?? "0");
  if (len > MAX_BODY_BYTES) return { ok: false, res: c.json({ error: "Solicitud demasiado grande." }, 413) };
  if (!(c.req.header("content-type") ?? "").includes("application/json")) {
    return { ok: false, res: c.json({ error: "Se esperaba JSON." }, 415) };
  }
  let raw: unknown;
  try {
    const text = await c.req.text();
    if (text.length > MAX_BODY_BYTES) return { ok: false, res: c.json({ error: "Solicitud demasiado grande." }, 413) };
    raw = JSON.parse(text);
  } catch {
    return { ok: false, res: c.json({ error: "JSON inválido." }, 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, res: c.json({ error: "Datos inválidos.", fields: issues(parsed.error) }, 400) };
  return { ok: true, data: parsed.data };
}

async function getSettings(db: D1Database): Promise<Record<string, string>> {
  const { results } = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  return Object.fromEntries(results.map((r) => [r.key, r.value]));
}

async function audit(db: D1Database, userId: number | null, action: string, detail: string): Promise<void> {
  await db.prepare("INSERT INTO audit_log (user_id, action, detail) VALUES (?1, ?2, ?3)").bind(userId, action, detail).run();
}

export function createApp(): Hono<App> {
  const app = new Hono<App>().basePath("/api");

  app.onError((err, c) => {
    console.error("api_error", err instanceof Error ? err.message : String(err));
    return c.json({ error: "Error interno. Intenta de nuevo." }, 500);
  });
  app.notFound((c) => c.json({ error: "No encontrado." }, 404));

  app.use("*", async (c, next) => {
    await next();
    for (const [k, v] of Object.entries(API_HEADERS)) c.header(k, v);
  });
  app.use("*", loadSession);

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/menu", async (c) => {
    if (await hitRateLimit(c.env.DB, `read:${clientIp(c)}`, RULES.read)) return c.json({ error: "Demasiadas solicitudes." }, 429);
    const [cats, items, settings] = await Promise.all([
      c.env.DB.prepare("SELECT id, name FROM categories ORDER BY position").all<{ id: number; name: string }>(),
      c.env.DB.prepare("SELECT * FROM items ORDER BY position").all<MenuItemRow>(),
      getSettings(c.env.DB),
    ]);
    return c.json({
      restaurant: {
        name: settings.restaurant_name ?? "",
        is_open: settings.is_open === "1",
        hours: settings.hours ?? "",
        delivery_cents: Number(settings.delivery_cents ?? 0),
        whatsapp: settings.whatsapp ?? "",
      },
      categories: cats.results.map((cat) => ({
        ...cat,
        items: items.results
          .filter((i) => i.category_id === cat.id)
          .map((i) => ({ id: i.id, name: i.name, description: i.description, price_cents: i.price_cents, image: i.image, available: i.available === 1 })),
      })),
    });
  });

  app.post("/orders", async (c) => {
    if (await hitRateLimit(c.env.DB, `order:${clientIp(c)}`, RULES.order)) {
      return c.json({ error: "Demasiados pedidos seguidos. Espera unos minutos." }, 429);
    }
    const body = await readJson(c, orderInput);
    if (!body.ok) return body.res;
    const input = body.data;
    if (input.website) return c.json({ error: "Datos inválidos." }, 400);

    const settings = await getSettings(c.env.DB);
    if (settings.is_open !== "1") return c.json({ error: "El restaurante está cerrado en este momento." }, 409);

    const ids = input.items.map((i) => i.item_id);
    const placeholders = ids.map((_, i) => `?${i + 1}`).join(",");
    const { results } = await c.env.DB.prepare(`SELECT * FROM items WHERE id IN (${placeholders})`).bind(...ids).all<MenuItemRow>();
    const menu = new Map(results.map((r) => [r.id, r]));

    let priced;
    try {
      priced = priceOrder(input.items, menu, input.type as OrderType, Number(settings.delivery_cents ?? 0));
    } catch (err) {
      if (err instanceof OrderError) return c.json({ error: err.message, code: err.code }, 422);
      throw err;
    }

    if (c.env.DEMO_MODE === "1") {
      await c.env.DB.prepare("DELETE FROM orders WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')").run();
    }

    const token = randomToken(24);
    const inserted = await c.env.DB.prepare(
      `INSERT INTO orders (public_token, code, type, table_no, customer_name, phone, address, notes, subtotal_cents, delivery_cents, total_cents)
       VALUES (?1, 'pendiente', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) RETURNING id`,
    )
      .bind(
        token,
        input.type,
        input.type === "mesa" ? (input.table_no ?? null) : null,
        input.customer_name,
        input.phone ?? null,
        input.type === "domicilio" ? (input.address ?? null) : null,
        input.notes ?? "",
        priced.subtotal_cents,
        priced.delivery_cents,
        priced.total_cents,
      )
      .first<{ id: number }>();
    if (!inserted) throw new Error("insert_failed");
    const code = orderCode(inserted.id);

    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE orders SET code = ?1 WHERE id = ?2").bind(code, inserted.id),
      ...priced.lines.map((l) =>
        c.env.DB.prepare(
          "INSERT INTO order_items (order_id, item_id, name, unit_price_cents, qty, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        ).bind(inserted.id, l.item_id, l.name, l.unit_price_cents, l.qty, l.notes),
      ),
    ]);

    return c.json({ token, code, status: "nuevo", total_cents: priced.total_cents }, 201);
  });

  app.get("/orders/:token", async (c) => {
    const token = c.req.param("token");
    if (!/^[0-9a-f]{48}$/.test(token)) return c.json({ error: "No encontrado." }, 404);
    if (await hitRateLimit(c.env.DB, `read:${clientIp(c)}`, RULES.read)) return c.json({ error: "Demasiadas solicitudes." }, 429);
    const order = await c.env.DB.prepare(
      "SELECT id, code, type, table_no, status, subtotal_cents, delivery_cents, total_cents, created_at FROM orders WHERE public_token = ?1",
    )
      .bind(token)
      .first<{ id: number } & Record<string, unknown>>();
    if (!order) return c.json({ error: "No encontrado." }, 404);
    const { results } = await c.env.DB.prepare("SELECT name, qty, unit_price_cents, notes FROM order_items WHERE order_id = ?1")
      .bind(order.id)
      .all();
    const { id: _id, ...publicOrder } = order;
    return c.json({ ...publicOrder, items: results });
  });

  app.post("/auth/login", async (c) => {
    if (await hitRateLimit(c.env.DB, `login:${clientIp(c)}`, RULES.login)) {
      return c.json({ error: "Demasiados intentos. Espera 5 minutos." }, 429);
    }
    const body = await readJson(c, loginInput);
    if (!body.ok) return body.res;
    const user = await verifyCredentials(c.env.DB, body.data.username, body.data.password);
    if (!user) return c.json({ error: "Usuario o contraseña incorrectos." }, 401);
    await c.env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?1").bind(Math.floor(Date.now() / 1000)).run();
    const session = await createSession(c, user);
    await audit(c.env.DB, user.id, "login", "");
    return c.json({ username: session.username, role: session.role, csrf: session.csrf });
  });

  app.post("/auth/logout", async (c) => {
    await destroySession(c);
    return c.json({ ok: true });
  });

  app.get("/auth/me", (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "No has iniciado sesión." }, 401);
    return c.json({ username: user.username, role: user.role, csrf: user.csrf });
  });

  app.get("/staff/orders", requireRole("admin", "cocina"), async (c) => {
    const { results: orders } = await c.env.DB.prepare(
      `SELECT id, code, type, table_no, customer_name, phone, address, notes, status, total_cents, created_at, updated_at
       FROM orders WHERE status IN ('nuevo', 'preparando', 'listo') OR updated_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 minutes')
       ORDER BY created_at ASC LIMIT 200`,
    ).all<{ id: number }>();
    if (orders.length === 0) return c.json({ orders: [] });
    const ids = orders.map((o) => o.id);
    const { results: lines } = await c.env.DB.prepare(
      `SELECT order_id, name, qty, notes FROM order_items WHERE order_id IN (${ids.map((_, i) => `?${i + 1}`).join(",")})`,
    )
      .bind(...ids)
      .all<{ order_id: number }>();
    return c.json({ orders: orders.map((o) => ({ ...o, items: lines.filter((l) => l.order_id === o.id) })) });
  });

  app.patch("/staff/orders/:id", requireRole("admin", "cocina"), async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: "No encontrado." }, 404);
    const body = await readJson(c, statusInput);
    if (!body.ok) return body.res;
    const current = await c.env.DB.prepare("SELECT status FROM orders WHERE id = ?1").bind(id).first<{ status: OrderStatus }>();
    if (!current) return c.json({ error: "No encontrado." }, 404);
    if (!canTransition(current.status, body.data.status)) {
      return c.json({ error: `No se puede pasar de ${current.status} a ${body.data.status}.` }, 409);
    }
    await c.env.DB.prepare("UPDATE orders SET status = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?2 AND status = ?3")
      .bind(body.data.status, id, current.status)
      .run();
    await audit(c.env.DB, c.get("user")?.id ?? null, "order_status", `${id}:${current.status}->${body.data.status}`);
    return c.json({ id, status: body.data.status });
  });

  app.get("/admin/items", requireRole("admin"), async (c) => {
    const { results } = await c.env.DB.prepare("SELECT * FROM items ORDER BY category_id, position").all<MenuItemRow>();
    const { results: categories } = await c.env.DB.prepare("SELECT id, name FROM categories ORDER BY position").all();
    return c.json({ categories, items: results.map((i) => ({ ...i, available: i.available === 1 })) });
  });

  app.post("/admin/items", requireRole("admin"), async (c) => {
    const body = await readJson(c, itemInput);
    if (!body.ok) return body.res;
    const d = body.data;
    const cat = await c.env.DB.prepare("SELECT id FROM categories WHERE id = ?1").bind(d.category_id).first();
    if (!cat) return c.json({ error: "Datos inválidos.", fields: { category_id: "La categoría no existe." } }, 400);
    const row = await c.env.DB.prepare(
      `INSERT INTO items (category_id, name, description, price_cents, available, position)
       VALUES (?1, ?2, ?3, ?4, ?5, (SELECT COALESCE(MAX(position), 0) + 1 FROM items)) RETURNING id`,
    )
      .bind(d.category_id, d.name, d.description, d.price_cents, d.available ? 1 : 0)
      .first<{ id: number }>();
    await audit(c.env.DB, c.get("user")?.id ?? null, "item_create", String(row?.id));
    return c.json({ id: row?.id }, 201);
  });

  app.patch("/admin/items/:id", requireRole("admin"), async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: "No encontrado." }, 404);
    const body = await readJson(c, itemPatch);
    if (!body.ok) return body.res;
    const fields = Object.entries(body.data).filter(([, v]) => v !== undefined);
    if (fields.length === 0) return c.json({ error: "Nada que actualizar." }, 400);
    const allowed = new Set(["category_id", "name", "description", "price_cents", "available"]);
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [k, v] of fields) {
      if (!allowed.has(k)) continue;
      values.push(k === "available" ? (v ? 1 : 0) : v);
      sets.push(`${k} = ?${values.length}`);
    }
    values.push(id);
    const res = await c.env.DB.prepare(`UPDATE items SET ${sets.join(", ")} WHERE id = ?${values.length}`).bind(...values).run();
    if (res.meta.changes === 0) return c.json({ error: "No encontrado." }, 404);
    await audit(c.env.DB, c.get("user")?.id ?? null, "item_update", `${id}:${sets.join(",")}`);
    return c.json({ id });
  });

  app.patch("/admin/settings", requireRole("admin"), async (c) => {
    const body = await readJson(c, settingsPatch);
    if (!body.ok) return body.res;
    const stmts = Object.entries(body.data)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) =>
        c.env.DB.prepare("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2").bind(
          k,
          typeof v === "boolean" ? (v ? "1" : "0") : String(v),
        ),
      );
    if (stmts.length === 0) return c.json({ error: "Nada que actualizar." }, 400);
    await c.env.DB.batch(stmts);
    await audit(c.env.DB, c.get("user")?.id ?? null, "settings_update", Object.keys(body.data).join(","));
    return c.json(await getSettings(c.env.DB));
  });

  async function report(c: Ctx) {
    const q = reportQuery.safeParse({ date: c.req.query("date") });
    if (!q.success) return null;
    const date = q.data.date ?? new Date().toISOString().slice(0, 10);
    const summary = await c.env.DB.prepare(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(total_cents), 0) AS revenue_cents
       FROM orders WHERE substr(created_at, 1, 10) = ?1 AND status != 'cancelado'`,
    )
      .bind(date)
      .first<{ orders: number; revenue_cents: number }>();
    const { results: top } = await c.env.DB.prepare(
      `SELECT oi.name, SUM(oi.qty) AS qty, SUM(oi.qty * oi.unit_price_cents) AS revenue_cents
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE substr(o.created_at, 1, 10) = ?1 AND o.status != 'cancelado'
       GROUP BY oi.name ORDER BY qty DESC LIMIT 10`,
    )
      .bind(date)
      .all<{ name: string; qty: number; revenue_cents: number }>();
    return { date, orders: summary?.orders ?? 0, revenue_cents: summary?.revenue_cents ?? 0, top };
  }

  app.get("/admin/report", requireRole("admin"), async (c) => {
    const r = await report(c);
    if (!r) return c.json({ error: "Fecha inválida." }, 400);
    return c.json(r);
  });

  app.get("/admin/report.csv", requireRole("admin"), async (c) => {
    const r = await report(c);
    if (!r) return c.json({ error: "Fecha inválida." }, 400);
    const esc = (v: string | number) => {
      const s = String(v);
      const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const rows = [["producto", "cantidad", "ingresos_mxn"], ...r.top.map((t) => [t.name, t.qty, (t.revenue_cents / 100).toFixed(2)])];
    const csv = rows.map((row) => row.map(esc).join(",")).join("\r\n");
    return c.body(csv, 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ventas-${r.date}.csv"`,
    });
  });

  return app;
}
