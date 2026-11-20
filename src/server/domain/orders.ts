import type { MenuItemRow, OrderStatus, OrderType } from "../types";

export interface CartLine {
  item_id: number;
  qty: number;
  notes?: string | undefined;
}

export interface PricedLine {
  item_id: number;
  name: string;
  unit_price_cents: number;
  qty: number;
  notes: string;
}

export interface PricedOrder {
  lines: PricedLine[];
  subtotal_cents: number;
  delivery_cents: number;
  total_cents: number;
}

export class OrderError extends Error {
  constructor(
    public readonly code: "item_not_found" | "item_unavailable" | "empty_order" | "too_many_items",
    message: string,
  ) {
    super(message);
    this.name = "OrderError";
  }
}

export const MAX_DISTINCT_LINES = 30;

export function priceOrder(
  cart: CartLine[],
  menu: ReadonlyMap<number, MenuItemRow>,
  type: OrderType,
  deliveryFeeCents: number,
): PricedOrder {
  if (cart.length === 0) throw new OrderError("empty_order", "El pedido está vacío.");
  if (cart.length > MAX_DISTINCT_LINES) throw new OrderError("too_many_items", "Demasiados productos distintos.");

  const lines: PricedLine[] = cart.map((line) => {
    const item = menu.get(line.item_id);
    if (!item) throw new OrderError("item_not_found", `El producto ${line.item_id} no existe.`);
    if (item.available !== 1) throw new OrderError("item_unavailable", `${item.name} está agotado.`);
    return {
      item_id: item.id,
      name: item.name,
      unit_price_cents: item.price_cents,
      qty: line.qty,
      notes: (line.notes ?? "").trim(),
    };
  });

  const subtotal = lines.reduce((sum, l) => sum + l.unit_price_cents * l.qty, 0);
  const delivery = type === "domicilio" ? deliveryFeeCents : 0;
  return { lines, subtotal_cents: subtotal, delivery_cents: delivery, total_cents: subtotal + delivery };
}

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  nuevo: ["preparando", "cancelado"],
  preparando: ["listo", "cancelado"],
  listo: ["entregado"],
  entregado: [],
  cancelado: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function orderCode(id: number): string {
  return `A-${String(id).padStart(4, "0")}`;
}
