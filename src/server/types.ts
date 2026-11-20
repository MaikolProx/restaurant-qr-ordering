export interface Env {
  DB: D1Database;
  SESSION_SECRET?: string;
  DEMO_MODE?: string;
}

export type Role = "admin" | "cocina";

export interface SessionUser {
  id: number;
  username: string;
  role: Role;
  csrf: string;
}

export type OrderType = "mesa" | "llevar" | "domicilio";
export type OrderStatus = "nuevo" | "preparando" | "listo" | "entregado" | "cancelado";

export interface MenuItemRow {
  id: number;
  category_id: number;
  name: string;
  description: string;
  price_cents: number;
  image: string | null;
  available: number;
  position: number;
}

export interface AppVariables {
  user: SessionUser | null;
}
