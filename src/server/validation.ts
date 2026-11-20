import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);

export const orderInput = z
  .object({
    type: z.enum(["mesa", "llevar", "domicilio"]),
    table_no: z.number().int().min(1).max(99).optional(),
    customer_name: text(60).min(2),
    phone: text(20).regex(/^[0-9 +()-]{8,20}$/, "Teléfono inválido").optional(),
    address: text(200).optional(),
    notes: text(300).optional(),
    website: z.string().max(0).optional(),
    items: z
      .array(
        z.object({
          item_id: z.number().int().positive(),
          qty: z.number().int().min(1).max(20),
          notes: text(120).optional(),
        }).strict(),
      )
      .min(1)
      .max(30),
  })
  .strict()
  .superRefine((o, ctx) => {
    if (o.type === "mesa" && o.table_no === undefined) {
      ctx.addIssue({ code: "custom", path: ["table_no"], message: "Indica el número de mesa." });
    }
    if (o.type === "domicilio") {
      if (!o.address || o.address.length < 8) ctx.addIssue({ code: "custom", path: ["address"], message: "Indica la dirección." });
      if (!o.phone) ctx.addIssue({ code: "custom", path: ["phone"], message: "Indica un teléfono." });
    }
    if (o.type === "llevar" && !o.phone) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "Indica un teléfono." });
    }
    const ids = o.items.map((i) => i.item_id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["items"], message: "Producto repetido." });
    }
  });
export type OrderInput = z.infer<typeof orderInput>;

export const loginInput = z.object({ username: text(40).min(1), password: z.string().min(1).max(200) }).strict();

export const statusInput = z.object({ status: z.enum(["preparando", "listo", "entregado", "cancelado"]) }).strict();

export const itemInput = z
  .object({
    category_id: z.number().int().positive(),
    name: text(80).min(2),
    description: text(240).default(""),
    price_cents: z.number().int().min(0).max(10_000_00),
    available: z.boolean().default(true),
  })
  .strict();

export const itemPatch = itemInput.partial().strict();

export const settingsPatch = z
  .object({
    is_open: z.boolean().optional(),
    hours: text(120).min(3).optional(),
    delivery_cents: z.number().int().min(0).max(100_000).optional(),
  })
  .strict();

export const reportQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
