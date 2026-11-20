import { describe, expect, it } from "vitest";
import { canTransition, OrderError, orderCode, priceOrder } from "../../src/server/domain/orders";
import type { MenuItemRow } from "../../src/server/types";

const item = (id: number, price: number, available = 1): MenuItemRow => ({
  id,
  category_id: 1,
  name: `Producto ${id}`,
  description: "",
  price_cents: price,
  image: null,
  available,
  position: id,
});
const menu = new Map([
  [1, item(1, 18900)],
  [2, item(2, 4500)],
  [3, item(3, 9900, 0)],
]);

describe("priceOrder", () => {
  it("suma precios del servidor, no del cliente", () => {
    const r = priceOrder([{ item_id: 1, qty: 2 }, { item_id: 2, qty: 1 }], menu, "mesa", 3500);
    expect(r.subtotal_cents).toBe(18900 * 2 + 4500);
    expect(r.delivery_cents).toBe(0);
    expect(r.total_cents).toBe(42300);
  });

  it("cobra envío solo a domicilio", () => {
    expect(priceOrder([{ item_id: 2, qty: 1 }], menu, "domicilio", 3500).total_cents).toBe(8000);
    expect(priceOrder([{ item_id: 2, qty: 1 }], menu, "llevar", 3500).total_cents).toBe(4500);
  });

  it("rechaza productos agotados o inexistentes", () => {
    expect(() => priceOrder([{ item_id: 3, qty: 1 }], menu, "mesa", 0)).toThrow(OrderError);
    expect(() => priceOrder([{ item_id: 99, qty: 1 }], menu, "mesa", 0)).toThrow(/no existe/);
  });

  it("rechaza pedidos vacíos", () => {
    expect(() => priceOrder([], menu, "mesa", 0)).toThrow(/vacío/);
  });

  it("limpia notas", () => {
    expect(priceOrder([{ item_id: 1, qty: 1, notes: "  sin cebolla " }], menu, "mesa", 0).lines[0]?.notes).toBe("sin cebolla");
  });
});

describe("canTransition", () => {
  it.each([
    ["nuevo", "preparando", true],
    ["nuevo", "cancelado", true],
    ["preparando", "listo", true],
    ["listo", "entregado", true],
    ["nuevo", "entregado", false],
    ["listo", "cancelado", false],
    ["entregado", "nuevo", false],
    ["cancelado", "preparando", false],
  ] as const)("%s -> %s = %s", (from, to, ok) => {
    expect(canTransition(from, to)).toBe(ok);
  });
});

describe("orderCode", () => {
  it("rellena con ceros", () => {
    expect(orderCode(7)).toBe("A-0007");
    expect(orderCode(12345)).toBe("A-12345");
  });
});
