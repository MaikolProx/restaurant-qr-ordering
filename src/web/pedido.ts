import { api, ApiError } from "./lib/api";
import { $, announce, h, mxn } from "./lib/dom";

interface OrderStatus {
  code: string;
  type: "mesa" | "llevar" | "domicilio";
  table_no: number | null;
  status: "nuevo" | "preparando" | "listo" | "entregado" | "cancelado";
  subtotal_cents: number;
  delivery_cents: number;
  total_cents: number;
  created_at: string;
  items: { name: string; qty: number; unit_price_cents: number; notes: string }[];
}

const STEPS = ["nuevo", "preparando", "listo", "entregado"] as const;
const LABEL: Record<OrderStatus["status"], string> = {
  nuevo: "Recibido",
  preparando: "En preparación",
  listo: "Listo",
  entregado: "Entregado",
  cancelado: "Cancelado",
};
const token = new URLSearchParams(location.search).get("t") ?? "";
let last = "";
let timer = 0;

function render(o: OrderStatus): void {
  const idx = STEPS.indexOf(o.status as (typeof STEPS)[number]);
  const where = o.type === "mesa" ? `Mesa ${o.table_no}` : o.type === "llevar" ? "Para llevar" : "A domicilio";
  const box = $("#track");
  box.setAttribute("aria-busy", "false");
  box.replaceChildren(
    h("span", { class: o.status === "cancelado" ? "badge badge-off" : o.status === "listo" ? "badge badge-ok" : "badge" }, LABEL[o.status]),
    h("h1", {}, `Pedido ${o.code}`),
    h("p", {}, where),
    o.status === "cancelado"
      ? h("p", { class: "alert" }, "El restaurante canceló este pedido. Si tienes dudas, pregunta al personal.")
      : h("ol", { class: "steps", "aria-label": "Avance del pedido" }, ...STEPS.map((s, i) => h("li", { class: i < idx ? "done" : i === idx ? "now" : "", "aria-current": i === idx ? "step" : undefined }, LABEL[s]))),
    h("ul", { class: "lines" }, ...o.items.map((it) => h("li", {}, h("span", {}, `${it.qty} × ${it.name}`, it.notes ? h("small", {}, ` (${it.notes})`) : ""), h("span", {}, mxn(it.qty * it.unit_price_cents))))),
    h("div", { class: "totals" }, o.delivery_cents ? h("div", {}, h("span", {}, "Envío"), h("span", {}, mxn(o.delivery_cents))) : "", h("div", { class: "grand" }, h("span", {}, "Total"), h("span", {}, mxn(o.total_cents)))),
    h("p", { class: "demo-note mt" }, "Esta página se actualiza sola. Guarda el enlace para volver a consultarla."),
    h("p", {}, h("a", { class: "btn btn-ghost", href: "/menu" }, "Volver al menú")),
  );
  if (last && last !== o.status) announce(`Tu pedido ahora está: ${LABEL[o.status]}`);
  last = o.status;
}

async function poll(): Promise<void> {
  try {
    const o = await api<OrderStatus>(`/orders/${encodeURIComponent(token)}`);
    render(o);
    if (o.status === "entregado" || o.status === "cancelado") return;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      $("#track").replaceChildren(h("h1", {}, "No encontramos ese pedido"), h("p", {}, "Revisa el enlace. Los pedidos de la demo se borran a las 24 horas."), h("a", { class: "btn btn-primary", href: "/menu" }, "Ir al menú"));
      return;
    }
  }
  timer = window.setTimeout(() => void poll(), document.hidden ? 20000 : 5000);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && timer) {
    window.clearTimeout(timer);
    void poll();
  }
});

if (!/^[0-9a-f]{48}$/.test(token)) {
  $("#track").replaceChildren(h("h1", {}, "Enlace inválido"), h("a", { class: "btn btn-primary", href: "/menu" }, "Ir al menú"));
} else {
  void poll();
}
