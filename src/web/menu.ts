import { api, ApiError, type MenuItem, type MenuResponse } from "./lib/api";
import { $, announce, h, mxn } from "./lib/dom";

type Cart = Record<number, number>;
const CART_KEY = "sn_cart_v1";
const params = new URLSearchParams(location.search);
const mesa = Number(params.get("mesa"));
const tableFromQr = Number.isInteger(mesa) && mesa >= 1 && mesa <= 99 ? mesa : null;

let menu: MenuResponse | null = null;
const items = new Map<number, MenuItem>();
let cart: Cart = loadCart();

function loadCart(): Cart {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) ?? "{}") as unknown;
    if (raw && typeof raw === "object") {
      const out: Cart = {};
      for (const [k, v] of Object.entries(raw)) if (Number.isInteger(v) && (v as number) > 0) out[Number(k)] = Math.min(20, v as number);
      return out;
    }
  } catch {
    /* almacenamiento no disponible: carrito en memoria */
  }
  return {};
}

function saveCart(): void {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    /* sin almacenamiento local */
  }
}

function cartLines() {
  return Object.entries(cart)
    .map(([id, qty]) => ({ item: items.get(Number(id)), qty }))
    .filter((l): l is { item: MenuItem; qty: number } => Boolean(l.item && l.item.available));
}

function currentType(): string {
  return (document.querySelector<HTMLInputElement>('input[name="type"]:checked')?.value ?? (tableFromQr ? "mesa" : "llevar"));
}

function totals() {
  const subtotal = cartLines().reduce((s, l) => s + l.item.price_cents * l.qty, 0);
  const delivery = currentType() === "domicilio" ? (menu?.restaurant.delivery_cents ?? 0) : 0;
  return { subtotal, delivery, total: subtotal + delivery, count: cartLines().reduce((s, l) => s + l.qty, 0) };
}

function setQty(id: number, qty: number): void {
  if (qty <= 0) delete cart[id];
  else cart[id] = Math.min(20, qty);
  saveCart();
  renderQty(id);
  renderCartBar();
}

function renderQty(id: number): void {
  const out = document.querySelector<HTMLOutputElement>(`output[data-id="${id}"]`);
  if (out) out.value = String(cart[id] ?? 0);
}

function renderCartBar(): void {
  const t = totals();
  const bar = $("#cartbar");
  bar.hidden = t.count === 0;
  document.body.classList.toggle("has-cart", t.count > 0);
  $("#cartsum").textContent = `${t.count} ${t.count === 1 ? "producto" : "productos"} · ${mxn(t.subtotal)}`;
}

function itemCard(item: MenuItem): HTMLElement {
  const name = h("h3", { id: `item-${item.id}` }, item.name);
  const stepper = item.available
    ? h(
        "div",
        { class: "stepper", role: "group", "aria-labelledby": `item-${item.id}` },
        h("button", { type: "button", "aria-label": `Quitar uno de ${item.name}`, onclick: () => setQty(item.id, (cart[item.id] ?? 0) - 1) }, "−"),
        h("output", { "data-id": item.id, "aria-live": "polite", "aria-label": "Cantidad" }, String(cart[item.id] ?? 0)),
        h("button", { type: "button", "aria-label": `Agregar uno de ${item.name}`, onclick: () => setQty(item.id, (cart[item.id] ?? 0) + 1) }, "+"),
      )
    : h("span", { class: "badge badge-off" }, "Agotado");
  const img = item.image
    ? h("img", { src: `/img/${item.image}.webp`, alt: item.name, width: 112, height: 112, loading: "lazy", decoding: "async" })
    : h("div", { "aria-hidden": "true" });
  return h(
    "article",
    { class: `item${item.available ? "" : " is-off"}` },
    h("div", {}, name, h("p", {}, item.description), h("div", { class: "row" }, h("span", { class: "price" }, mxn(item.price_cents)), stepper)),
    img,
  );
}

function renderMenu(data: MenuResponse): void {
  const root = $("#menu");
  root.replaceChildren();
  root.setAttribute("aria-busy", "false");
  const tabs = $("#tabs");
  tabs.replaceChildren();
  for (const cat of data.categories) {
    const slug = `cat-${cat.id}`;
    tabs.append(h("a", { href: `#${slug}` }, cat.name));
    root.append(h("section", { class: "menu-cat", id: slug, "aria-labelledby": `${slug}-h` }, h("h2", { id: `${slug}-h` }, cat.name), h("div", { class: "items" }, ...cat.items.map(itemCard))));
  }
  const status = $("#status");
  if (!data.restaurant.is_open) {
    status.hidden = false;
    status.textContent = `Ahora estamos cerrados. Horario: ${data.restaurant.hours}. Puedes ver la carta, pero no enviar pedidos.`;
  } else if (tableFromQr) {
    status.hidden = false;
    status.textContent = `Estás pidiendo desde la mesa ${tableFromQr}.`;
  }
  observeTabs();
}

function observeTabs(): void {
  const links = [...document.querySelectorAll<HTMLAnchorElement>("#tabs a")];
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        for (const l of links) l.setAttribute("aria-current", String(l.hash === `#${e.target.id}`));
      }
    },
    { rootMargin: "-130px 0px -60% 0px" },
  );
  document.querySelectorAll(".menu-cat").forEach((s) => io.observe(s));
}

function renderCartDialog(): void {
  const list = $("#lines");
  list.replaceChildren(
    ...cartLines().map(({ item, qty }) =>
      h(
        "li",
        {},
        h("span", {}, `${qty} × ${item.name}`),
        h("span", {}, mxn(item.price_cents * qty), " ", h("button", { type: "button", class: "btn btn-sm btn-ghost", "aria-label": `Quitar ${item.name}`, onclick: () => { setQty(item.id, 0); renderCartDialog(); } }, "Quitar")),
      ),
    ),
  );
  if (cartLines().length === 0) list.append(h("li", {}, "Tu pedido está vacío."));
  const t = totals();
  $("#totals").replaceChildren(
    h("div", {}, h("span", {}, "Subtotal"), h("span", {}, mxn(t.subtotal))),
    t.delivery ? h("div", {}, h("span", {}, "Envío"), h("span", {}, mxn(t.delivery))) : "",
    h("div", { class: "grand" }, h("span", {}, "Total"), h("span", {}, mxn(t.total))),
  );
  for (const field of document.querySelectorAll<HTMLElement>("[data-for]")) {
    field.hidden = !(field.dataset.for ?? "").split(" ").includes(currentType());
  }
  ($("#send") as HTMLButtonElement).disabled = cartLines().length === 0 || !menu?.restaurant.is_open;
}

function showErrors(fields: Record<string, string>, message: string): void {
  const alert = $("#formerr");
  alert.hidden = false;
  alert.textContent = message;
  for (const el of document.querySelectorAll<HTMLElement>("[data-err]")) {
    const key = el.dataset.err ?? "";
    el.textContent = fields[key] ?? "";
    const input = document.getElementById(key);
    if (input) input.setAttribute("aria-invalid", fields[key] ? "true" : "false");
  }
  const first = Object.keys(fields).map((k) => document.getElementById(k)).find(Boolean);
  (first ?? alert).focus();
}

async function submit(ev: SubmitEvent): Promise<void> {
  ev.preventDefault();
  const form = ev.target as HTMLFormElement;
  const fd = new FormData(form);
  const type = currentType();
  const str = (k: string) => String(fd.get(k) ?? "").trim();
  const payload: Record<string, unknown> = {
    type,
    customer_name: str("customer_name"),
    items: cartLines().map(({ item, qty }) => ({ item_id: item.id, qty })),
  };
  if (type === "mesa") payload.table_no = Number(str("table_no"));
  if (type !== "mesa") payload.phone = str("phone") || undefined;
  if (type === "domicilio") payload.address = str("address") || undefined;
  if (str("notes")) payload.notes = str("notes");
  if (str("website")) payload.website = str("website");

  const send = $("#send") as HTMLButtonElement;
  send.disabled = true;
  send.textContent = "Enviando…";
  try {
    const r = await api<{ token: string; code: string }>("/orders", { method: "POST", body: payload });
    cart = {};
    saveCart();
    location.assign(`/pedido?t=${encodeURIComponent(r.token)}`);
  } catch (err) {
    const e = err instanceof ApiError ? err : new ApiError(0, "Algo salió mal.");
    showErrors(e.fields, e.message);
    send.disabled = false;
    send.textContent = "Enviar pedido";
  }
}

async function init(): Promise<void> {
  const dialog = $("#cart") as HTMLDialogElement;
  $("#opencart").addEventListener("click", () => {
    const radio = document.querySelector<HTMLInputElement>(`input[name="type"][value="${tableFromQr ? "mesa" : "llevar"}"]`);
    if (radio && !document.querySelector('input[name="type"]:checked')) radio.checked = true;
    if (tableFromQr) ($("#table_no") as HTMLInputElement).value = String(tableFromQr);
    renderCartDialog();
    dialog.showModal();
  });
  $("#closecart").addEventListener("click", () => dialog.close());
  $("#keep").addEventListener("click", () => dialog.close());
  document.querySelectorAll('input[name="type"]').forEach((r) => r.addEventListener("change", renderCartDialog));
  $("#orderform").addEventListener("submit", (e) => void submit(e as SubmitEvent));

  try {
    menu = await api<MenuResponse>("/menu");
    for (const c of menu.categories) for (const i of c.items) items.set(i.id, i);
    renderMenu(menu);
    renderCartBar();
  } catch (err) {
    const root = $("#menu");
    root.setAttribute("aria-busy", "false");
    root.replaceChildren(h("p", { class: "alert" }, err instanceof Error ? err.message : "No se pudo cargar la carta."), h("button", { class: "btn btn-primary", type: "button", onclick: () => location.reload() }, "Reintentar"));
    announce("No se pudo cargar la carta.");
  }
}

void init();
