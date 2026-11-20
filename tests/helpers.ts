import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Miniflare } from "miniflare";
import { createApp } from "../src/server/app";
import type { Env } from "../src/server/types";

const SCHEMA_DIR = join(import.meta.dirname, "..", "schema");

export async function makeEnv(): Promise<{ env: Env; dispose: () => Promise<void> }> {
  const mf = new Miniflare({ modules: true, script: "export default {}", d1Databases: ["DB"] });
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(SCHEMA_DIR, file), "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    const statements = sql
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    await db.batch(statements.map((s) => db.prepare(s)));
  }
  return { env: { DB: db as unknown as D1Database, DEMO_MODE: "1" }, dispose: () => mf.dispose() };
}

export function client(env: Env) {
  const app = createApp();
  let cookie = "";
  let csrf = "";
  let ip = "203.0.113.1";
  const call = async (method: string, path: string, body?: unknown, extra: Record<string, string> = {}) => {
    const headers: Record<string, string> = { "cf-connecting-ip": ip, ...extra };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (cookie) headers.cookie = cookie;
    if (csrf && method !== "GET") headers["x-csrf-token"] ??= csrf;
    const res = await app.request(`http://localhost/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, env);
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0] ?? "";
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, json: json as Record<string, any>, headers: res.headers };
  };
  return {
    call,
    async login(username: string, password: string) {
      const r = await call("POST", "/auth/login", { username, password });
      if (r.status === 200) csrf = r.json.csrf as string;
      return r;
    },
    setIp(next: string) {
      ip = next;
    },
    clearCsrf() {
      csrf = "";
    },
  };
}

export const validOrder = {
  type: "mesa",
  table_no: 5,
  customer_name: "Ana Prueba",
  items: [
    { item_id: 4, qty: 2 },
    { item_id: 10, qty: 1, notes: "sin hielo" },
  ],
};
