import { pbkdf2Sync, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const ITER = 100000;
const hash = (pw) => {
  const salt = randomBytes(16).toString("hex");
  const h = pbkdf2Sync(pw, Buffer.from(salt, "hex"), ITER, 32, "sha256").toString("hex");
  return { salt, h };
};
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const categories = [
  [1, "Entradas", 1], [2, "Platos fuertes", 2], [3, "Postres", 3], [4, "Bebidas", 4],
];
const items = [
  [1, 1, "Guacamole en molcajete", "Aguacate, jitomate, cebolla, cilantro y totopos recién hechos.", 14500, "guacamole"],
  [2, 1, "Queso fundido con chorizo", "Queso asadero gratinado con chorizo y tortillas de harina.", 15900, "queso-fundido"],
  [3, 1, "Sopa de tortilla", "Caldo de jitomate, chile pasilla, aguacate, queso y crema.", 11900, "sopa-tortilla"],
  [4, 2, "Tacos de arrachera (3)", "Arrachera a la parrilla, cebolla, cilantro y salsa verde.", 18900, "tacos-arrachera"],
  [5, 2, "Cabrito al pastor", "Cabrito estilo Monterrey con frijoles charros y tortillas.", 34900, "cabrito"],
  [6, 2, "Enchiladas rojas", "Rellenas de pollo, queso fresco, crema y lechuga.", 16500, "enchiladas"],
  [7, 2, "Burrito norteño", "Carne asada, frijoles, arroz y salsa de la casa.", 17500, "burrito"],
  [8, 3, "Flan de la casa", "Flan napolitano con caramelo.", 7900, "flan"],
  [9, 3, "Churros con chocolate", "Churros recién hechos con azúcar y canela.", 8900, "churros"],
  [10, 4, "Horchata", "Agua de horchata con canela, 500 ml.", 4500, "horchata"],
  [11, 4, "Limonada mineral", "Limón, menta y agua mineral, 500 ml.", 4900, "limonada"],
];
const settings = {
  restaurant_name: "Sabor Norteño",
  is_open: "1",
  delivery_cents: "3500",
  whatsapp: "5218100000000",
  hours: "Lunes a domingo, 13:00 a 23:00",
  address: "Av. Ejemplo 123, Monterrey, N.L. (dirección ficticia)",
};
const users = [["admin", "admin", "demo-admin-2026"], ["cocina", "cocina", "demo-cocina-2026"]];

let sql = "-- Datos de demostración ficticios. Generado por scripts/gen-seed.mjs\n";
for (const [id, name, pos] of categories) sql += `INSERT INTO categories (id, name, position) VALUES (${id}, ${q(name)}, ${pos});\n`;
items.forEach(([id, cat, name, desc, price, img], i) => {
  sql += `INSERT INTO items (id, category_id, name, description, price_cents, image, available, position) VALUES (${id}, ${cat}, ${q(name)}, ${q(desc)}, ${price}, ${q(img)}, 1, ${i});\n`;
});
for (const [k, v] of Object.entries(settings)) sql += `INSERT INTO settings (key, value) VALUES (${q(k)}, ${q(v)});\n`;
for (const [u, role, pw] of users) {
  const { salt, h } = hash(pw);
  sql += `INSERT INTO users (username, role, pass_hash, salt, iterations) VALUES (${q(u)}, ${q(role)}, ${q(h)}, ${q(salt)}, ${ITER});\n`;
}
writeFileSync(new URL("../schema/0002_seed.sql", import.meta.url), sql);
console.log("seed ok");
