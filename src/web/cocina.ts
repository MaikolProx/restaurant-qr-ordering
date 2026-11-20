import { api, ApiError } from "./lib/api";
import { $, announce, h, mxn, timeAgo } from "./lib/dom";
import { currentUser, loginView, logout, type Me } from "./lib/staff";

interface Ticket {
  id: number;
  code: string;
  type: "mesa" | "llevar" | "domicilio";
  table_no: number | null;
  customer_name: string;
  phone: string | null;
  address: string | null;
  notes: string;
  status: "nuevo" | "preparando" | "listo" | "entregado" | "cancelado";
  total_cents: number;
  created_at: string;
  items: { name: string; qty: number; notes: string }[];
}

const COLUMNS = [
  { status: "nuevo", title: "Nuevos" },
  { status: "preparando", title: "En preparación" },
  { status: "listo", title: "Listos para entregar" },
] as const;
const NEXT: Partial<Record<Ticket["status"], { to: Ticket["status"]; label: string; cls: string }>> = {
  nuevo: { to: "preparando", label: "Empezar", cls: "btn-primary" },
  preparando: { to: "listo", label: "Marcar listo", cls: "btn-ok" },
  listo: { to: "entregado", label: "Entregado", cls: "btn-ghost" },
};
const LATE_MIN = 20;

const root = $("#app");
let known = new Set<number>();
let first = true;
let timer = 0;

function where(t: Ticket): string {
  if (t.type === "mesa") return `Mesa ${t.table_no}`;
  if (t.type === "llevar") return `Para llevar · ${t.customer_name}`;
  return `Domicilio · ${t.customer_name}`;
}

function beep(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch {
    /* audio no disponible */
  }
}

async function move(t: Ticket, to: Ticket["status"]): Promise<void> {
  try {
    await api(`/staff/orders/${t.id}`, { method: "PATCH", body: { status: to } });
    announce(`Pedido ${t.code} movido a ${to}`);
  } catch (e) {
    alert(e instanceof ApiError ? e.message : "No se pudo actualizar.");
  }
  void refresh();
}

function ticket(t: Ticket): HTMLElement {
  const late = (Date.now() - new Date(t.created_at).getTime()) / 60000 > LATE_MIN && t.status !== "listo";
  const next = NEXT[t.status];
  return h(
    "article",
    { class: `ticket${late ? " late" : ""}`, "aria-label": `Pedido ${t.code}` },
    h("header", {}, h("strong", {}, t.code), h("span", { class: "meta" }, timeAgo(t.created_at))),
    h("div", {}, where(t)),
    late ? h("span", { class: "badge badge-warn" }, `Más de ${LATE_MIN} min`) : "",
    h("ul", {}, ...t.items.map((i) => h("li", {}, `${i.qty} × ${i.name}`, i.notes ? h("div", { class: "note" }, i.notes) : ""))),
    t.notes ? h("p", { class: "note" }, `Nota: ${t.notes}`) : "",
    t.type === "domicilio" && t.address ? h("p", { class: "meta" }, t.address, t.phone ? ` · ${t.phone}` : "") : "",
    h(
      "div",
      { class: "actions" },
      next ? h("button", { class: `btn btn-sm ${next.cls}`, type: "button", onclick: () => void move(t, next.to) }, next.label) : "",
      t.status !== "listo" ? h("button", { class: "btn btn-sm btn-danger", type: "button", onclick: () => confirm(`¿Cancelar el pedido ${t.code}?`) && void move(t, "cancelado") }, "Cancelar") : "",
      h("span", { class: "meta" }, mxn(t.total_cents)),
    ),
  );
}

function board(me: Me, tickets: Ticket[]): void {
  const active = tickets.filter((t) => t.status !== "entregado" && t.status !== "cancelado");
  root.replaceChildren(
    h(
      "div",
      { class: "staff-head" },
      h("h1", {}, "Cocina"),
      h("div", {}, h("span", { class: "meta" }, `${me.username} · se actualiza cada 5 s `), h("button", { class: "btn btn-sm btn-ghost", type: "button", onclick: () => void logout() }, "Salir")),
    ),
    h(
      "div",
      { class: "kds" },
      ...COLUMNS.map((col) => {
        const list = active.filter((t) => t.status === col.status);
        return h("section", { class: "kds-col", "aria-label": col.title }, h("h2", {}, col.title, h("span", {}, String(list.length))), ...(list.length ? list.map(ticket) : [h("p", { class: "meta" }, "Sin pedidos.")]));
      }),
    ),
  );
}

let me: Me | null = null;

async function refresh(): Promise<void> {
  window.clearTimeout(timer);
  if (!me) return;
  try {
    const { orders } = await api<{ orders: Ticket[] }>("/staff/orders");
    const fresh = orders.filter((o) => o.status === "nuevo" && !known.has(o.id));
    if (!first && fresh.length) {
      beep();
      announce(`${fresh.length} pedido nuevo`);
    }
    known = new Set(orders.map((o) => o.id));
    first = false;
    board(me, orders);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      me = null;
      loginView(root, "cocina", start);
      return;
    }
  }
  timer = window.setTimeout(() => void refresh(), 5000);
}

function start(user: Me): void {
  me = user;
  void refresh();
}

void currentUser().then((u) => (u ? start(u) : loginView(root, "cocina", start)));
