import { api, ApiError } from "./lib/api";
import { $, announce, h, mxn } from "./lib/dom";
import { currentUser, loginView, logout, type Me } from "./lib/staff";

interface AdminItem {
  id: number;
  category_id: number;
  name: string;
  description: string;
  price_cents: number;
  available: boolean;
}
interface Report {
  date: string;
  orders: number;
  revenue_cents: number;
  top: { name: string; qty: number; revenue_cents: number }[];
}

const root = $("#app");
type Tab = "carta" | "ventas" | "ajustes";

function toast(msg: string): void {
  announce(msg);
  const el = h("div", { class: "demo-note mt", role: "status" }, msg);
  root.prepend(el);
  window.setTimeout(() => el.remove(), 3000);
}

async function carta(panel: HTMLElement): Promise<void> {
  const data = await api<{ categories: { id: number; name: string }[]; items: AdminItem[] }>("/admin/items");
  const catName = new Map(data.categories.map((c) => [c.id, c.name]));
  const rows = data.items.map((it) => {
    const price = h("input", { type: "number", min: 0, step: "0.5", value: (it.price_cents / 100).toFixed(2), "aria-label": `Precio de ${it.name}` });
    const avail = h("input", { type: "checkbox", "aria-label": `${it.name} disponible` });
    avail.checked = it.available;
    const save = h("button", { class: "btn btn-sm btn-primary", type: "button" }, "Guardar");
    save.addEventListener("click", async () => {
      const cents = Math.round(Number(price.value) * 100);
      if (!Number.isFinite(cents) || cents < 0) return toast("Precio inválido.");
      try {
        await api(`/admin/items/${it.id}`, { method: "PATCH", body: { price_cents: cents, available: avail.checked } });
        toast(`${it.name} actualizado.`);
      } catch (e) {
        toast(e instanceof ApiError ? e.message : "No se pudo guardar.");
      }
    });
    return h("tr", {}, h("td", {}, h("strong", {}, it.name), h("div", { class: "meta" }, catName.get(it.category_id) ?? "")), h("td", {}, price), h("td", {}, h("label", { class: "switch" }, avail, "Disponible")), h("td", {}, save));
  });

  const name = h("input", { id: "n-name", required: true, maxlength: 80 });
  const priceNew = h("input", { id: "n-price", type: "number", min: 0, step: "0.5", required: true });
  const cat = h("select", { id: "n-cat" }, ...data.categories.map((c) => h("option", { value: c.id }, c.name)));
  const err = h("div", { class: "alert", role: "alert", hidden: true });
  const form = h(
    "form",
    { class: "card mt", novalidate: true },
    h("h2", {}, "Agregar platillo"),
    err,
    h("div", { class: "field" }, h("label", { for: "n-name" }, "Nombre"), name),
    h("div", { class: "field" }, h("label", { for: "n-price" }, "Precio (MXN)"), priceNew),
    h("div", { class: "field" }, h("label", { for: "n-cat" }, "Categoría"), cat),
    h("button", { class: "btn btn-primary", type: "submit" }, "Agregar"),
  );
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      await api("/admin/items", { method: "POST", body: { name: name.value.trim(), price_cents: Math.round(Number(priceNew.value) * 100), category_id: Number(cat.value) } });
      toast("Platillo agregado.");
      void show("carta");
    } catch (e) {
      err.hidden = false;
      err.textContent = e instanceof ApiError ? Object.values(e.fields).join(" ") || e.message : "No se pudo agregar.";
    }
  });

  panel.replaceChildren(
    h("div", { class: "table-scroll" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Platillo"), h("th", {}, "Precio"), h("th", {}, "Estado"), h("th", {}, h("span", { class: "sr-only" }, "Acciones")))), h("tbody", {}, ...rows))),
    form,
  );
}

async function ventas(panel: HTMLElement): Promise<void> {
  const date = h("input", { type: "date", id: "d", value: new Date().toISOString().slice(0, 10) });
  const out = h("div", {});
  const load = async () => {
    const r = await api<Report>(`/admin/report?date=${encodeURIComponent(date.value)}`);
    out.replaceChildren(
      h("div", { class: "kpis" }, h("div", { class: "card kpi" }, "Pedidos", h("strong", {}, String(r.orders))), h("div", { class: "card kpi" }, "Ventas", h("strong", {}, mxn(r.revenue_cents))), h("div", { class: "card kpi" }, "Ticket promedio", h("strong", {}, mxn(r.orders ? Math.round(r.revenue_cents / r.orders) : 0)))),
      r.top.length
        ? h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Producto"), h("th", {}, "Cantidad"), h("th", {}, "Ingresos"))), h("tbody", {}, ...r.top.map((t) => h("tr", {}, h("td", {}, t.name), h("td", {}, String(t.qty)), h("td", {}, mxn(t.revenue_cents))))))
        : h("p", { class: "meta" }, "Sin ventas ese día."),
      h("p", { class: "mt" }, h("a", { class: "btn btn-ghost", href: `/api/admin/report.csv?date=${encodeURIComponent(date.value)}` }, "Descargar CSV")),
    );
  };
  date.addEventListener("change", () => void load());
  panel.replaceChildren(h("div", { class: "field" }, h("label", { for: "d" }, "Fecha"), date), out);
  await load();
}

async function ajustes(panel: HTMLElement): Promise<void> {
  const menu = await api<{ restaurant: { is_open: boolean; hours: string; delivery_cents: number } }>("/menu");
  const open = h("input", { type: "checkbox", id: "s-open" });
  open.checked = menu.restaurant.is_open;
  const hours = h("input", { id: "s-hours", value: menu.restaurant.hours, maxlength: 120 });
  const fee = h("input", { id: "s-fee", type: "number", min: 0, step: "0.5", value: (menu.restaurant.delivery_cents / 100).toFixed(2) });
  const form = h(
    "form",
    { class: "card", novalidate: true },
    h("div", { class: "field" }, h("label", { class: "switch", for: "s-open" }, open, "Recibir pedidos ahora")),
    h("div", { class: "field" }, h("label", { for: "s-hours" }, "Horario visible"), hours),
    h("div", { class: "field" }, h("label", { for: "s-fee" }, "Costo de envío (MXN)"), fee),
    h("button", { class: "btn btn-primary", type: "submit" }, "Guardar ajustes"),
  );
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      await api("/admin/settings", { method: "PATCH", body: { is_open: open.checked, hours: hours.value.trim(), delivery_cents: Math.round(Number(fee.value) * 100) } });
      toast("Ajustes guardados.");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo guardar.");
    }
  });
  panel.replaceChildren(form);
}

let me: Me | null = null;

async function show(tab: Tab): Promise<void> {
  if (!me) return;
  const tabs: [Tab, string][] = [["carta", "Carta"], ["ventas", "Ventas"], ["ajustes", "Ajustes"]];
  const panel = h("div", { role: "tabpanel", id: "panel", tabindex: -1 }, h("p", {}, "Cargando…"));
  root.replaceChildren(
    h("div", { class: "staff-head" }, h("h1", {}, "Panel"), h("div", {}, h("a", { class: "btn btn-sm btn-ghost", href: "/cocina" }, "Ver cocina"), " ", h("button", { class: "btn btn-sm btn-ghost", type: "button", onclick: () => void logout() }, "Salir"))),
    h("div", { class: "tabs", role: "tablist" }, ...tabs.map(([id, label]) => h("button", { type: "button", role: "tab", "aria-selected": String(id === tab), "aria-controls": "panel", onclick: () => void show(id) }, label))),
    panel,
  );
  try {
    if (tab === "carta") await carta(panel);
    else if (tab === "ventas") await ventas(panel);
    else await ajustes(panel);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      me = null;
      loginView(root, "admin", start);
      return;
    }
    panel.replaceChildren(h("p", { class: "alert" }, e instanceof Error ? e.message : "Error"));
  }
}

function start(user: Me): void {
  if (user.role !== "admin") {
    root.replaceChildren(h("div", { class: "card login" }, h("h1", {}, "Sin acceso"), h("p", {}, "Tu usuario es de cocina."), h("a", { class: "btn btn-primary", href: "/cocina" }, "Ir a cocina"), " ", h("button", { class: "btn btn-ghost", type: "button", onclick: () => void logout() }, "Salir")));
    return;
  }
  me = user;
  void show("carta");
}

void currentUser().then((u) => (u ? start(u) : loginView(root, "admin", start)));
