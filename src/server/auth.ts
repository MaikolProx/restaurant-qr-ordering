import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { pbkdf2Hex, randomToken, sha256Hex, timingSafeEqualHex } from "./security";
import type { AppVariables, Env, Role, SessionUser } from "./types";

export const SESSION_COOKIE = "__Host-sn_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

type AppContext = Context<{ Bindings: Env; Variables: AppVariables }>;

interface UserRow {
  id: number;
  username: string;
  role: Role;
  pass_hash: string;
  salt: string;
  iterations: number;
}

const DUMMY_SALT = "00000000000000000000000000000000";

export async function verifyCredentials(db: D1Database, username: string, password: string): Promise<UserRow | null> {
  const user = await db
    .prepare("SELECT id, username, role, pass_hash, salt, iterations FROM users WHERE username = ?1")
    .bind(username)
    .first<UserRow>();
  const computed = await pbkdf2Hex(password, user?.salt ?? DUMMY_SALT, user?.iterations ?? 100000);
  if (!user) return null;
  return timingSafeEqualHex(computed, user.pass_hash) ? user : null;
}

export async function createSession(c: AppContext, user: UserRow): Promise<SessionUser> {
  const token = randomToken(32);
  const csrf = randomToken(16);
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  await c.env.DB.prepare("INSERT INTO sessions (token_hash, user_id, csrf, expires_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(await sha256Hex(token), user.id, csrf, expires)
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return { id: user.id, username: user.username, role: user.role, csrf };
}

export async function destroySession(c: AppContext): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(await sha256Hex(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
}

export const loadSession: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = async (c, next) => {
  c.set("user", null);
  const token = getCookie(c, SESSION_COOKIE);
  if (token && /^[0-9a-f]{64}$/.test(token)) {
    const now = Math.floor(Date.now() / 1000);
    const row = await c.env.DB.prepare(
      `SELECT u.id, u.username, u.role, s.csrf FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?1 AND s.expires_at > ?2`,
    )
      .bind(await sha256Hex(token), now)
      .first<SessionUser>();
    if (row) c.set("user", row);
  }
  await next();
};

export function requireRole(...roles: Role[]): MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "No has iniciado sesión." }, 401);
    if (!roles.includes(user.role)) return c.json({ error: "No tienes permiso." }, 403);
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const header = c.req.header("x-csrf-token") ?? "";
      if (!timingSafeEqualHex(header, user.csrf)) {
        return c.json({ error: "Token CSRF inválido." }, 403);
      }
    }
    await next();
  };
}
