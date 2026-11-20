import { writeFileSync } from "node:fs";

const SITE = "https://demo-restaurante-anx.pages.dev";
const NAME = "Sabor Norteño";

const logo = `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#b23a1e"/><path d="M8 19c2-6 14-6 16 0" stroke="#fbf6ef" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="12" cy="13" r="1.6" fill="#fbf6ef"/><circle cx="20" cy="13" r="1.6" fill="#fbf6ef"/></svg>`;

function header(current) {
  const link = (href, label, cls = "") =>
    `<a href="${href}"${cls ? ` class="${cls}"` : ""}${current === href ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<a class="skip" href="#main">Saltar al contenido</a>
<header class="topbar"><div class="wrap">
  <a class="logo" href="/">${logo}<span>${NAME}</span></a>
  <nav class="nav" aria-label="Principal">${link("/menu", "Menú")}${link("/#visitanos", "Visítanos", "hide-sm")}${link("/admin", "Personal", "hide-sm")}</nav>
</div></header>`;
}

const footer = `<footer class="footer"><div class="wrap">
  <div><strong>${NAME}</strong> · Restaurante ficticio de demostración.<br>Datos, precios e imágenes son de ejemplo.</div>
  <nav aria-label="Legal"><a href="/aviso-legal">Aviso legal</a><a href="/privacidad">Aviso de privacidad</a><a href="/cookies">Cookies</a><a href="/terminos">Términos</a></nav>
</div></footer>
<div id="live" class="sr-only" aria-live="polite"></div>`;

function page({ file, title, description, path, body, script, noindex = false, jsonld = "" }) {
  const html = `<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
${noindex ? '<meta name="robots" content="noindex, nofollow">' : `<link rel="canonical" href="${SITE}${path}">`}
<meta name="theme-color" content="#b23a1e">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${SITE}/img/og.jpg">
<meta property="og:locale" content="es_MX">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="stylesheet" href="./styles.css">
${jsonld}
</head>
<body>
${header(path)}
<main id="main">
${body}
</main>
${footer}
${script ? `<script type="module" src="./${script}"></script>` : ""}
</body>
</html>
`;
  writeFileSync(new URL(`../src/web/${file}`, import.meta.url), html);
}

const restaurantLd = `<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Restaurant",
  name: NAME,
  servesCuisine: "Mexicana, norteña",
  priceRange: "$$",
  url: SITE,
  menu: `${SITE}/menu`,
  acceptsReservations: false,
  address: { "@type": "PostalAddress", addressLocality: "Monterrey", addressRegion: "N.L.", addressCountry: "MX" },
  openingHours: "Mo-Su 13:00-23:00",
})}</script>`;

page({
  file: "index.html",
  title: `${NAME} · Cocina norteña en Monterrey (demo)`,
  description: "Cabrito, arrachera y antojitos norteños. Pide desde tu mesa con el código QR, para llevar o a domicilio.",
  path: "/",
  jsonld: restaurantLd,
  body: `<section class="hero">
  <picture><source srcset="/img/hero.webp" type="image/webp"><img src="/img/hero.jpg" alt="Interior cálido del restaurante con mesas de madera" width="1344" height="768" fetchpriority="high"></picture>
  <div class="wrap">
    <span class="badge">Demo interactiva</span>
    <h1>Cocina norteña,<br>pedida en un minuto.</h1>
    <p>Escanea el QR de tu mesa, elige tus platillos y sigue tu pedido en vivo. También para llevar y a domicilio.</p>
    <div class="actions"><a class="btn btn-primary" href="/menu?mesa=5">Probar la carta como mesa 5</a><a class="btn btn-ghost" href="/menu">Pedir para llevar</a></div>
  </div>
</section>
<section><div class="wrap">
  <h2>Cómo funciona este sistema</h2>
  <div class="grid-3">
    <article class="card feature"><span class="badge">1 · Cliente</span><h3>Carta QR y pedido</h3><p>Cada mesa tiene su QR. El cliente pide desde su celular, sin descargar nada, y ve el estado en tiempo real.</p></article>
    <article class="card feature"><span class="badge">2 · Cocina</span><h3>Pantalla de cocina</h3><p>Los pedidos llegan al instante a la tablet de cocina, ordenados por hora, con notas y alertas de demora.</p></article>
    <article class="card feature"><span class="badge">3 · Dueño</span><h3>Panel de control</h3><p>Cambia precios, marca platillos agotados, abre o cierra pedidos y descarga las ventas del día.</p></article>
  </div>
  <p class="demo-note mt">Prueba la cocina y el panel en <a href="/cocina">/cocina</a> y <a href="/admin">/admin</a>. Las credenciales de demostración aparecen en la pantalla de acceso.</p>
</div></section>
<section id="visitanos"><div class="wrap grid-3">
  <div><h2>Visítanos</h2><p>Av. Ejemplo 123, Monterrey, N.L.<br><small>(dirección ficticia)</small></p></div>
  <div><h3>Horario</h3><p>Lunes a domingo<br>13:00 a 23:00</p></div>
  <div><h3>Contacto</h3><p>Pedidos por la carta en línea o por WhatsApp al confirmar tu pedido.</p></div>
</div></section>`,
});

page({
  file: "menu.html",
  title: `Menú · ${NAME}`,
  description: "Carta digital con precios: entradas, platos fuertes, postres y bebidas. Pide desde tu mesa, para llevar o a domicilio.",
  path: "/menu",
  script: "menu.ts",
  body: `<div class="wrap"><h1 class="sr-only">Menú</h1><div id="status" class="demo-note" hidden></div></div>
<nav class="cat-tabs" aria-label="Categorías"><div class="wrap" id="tabs"></div></nav>
<div class="wrap" id="menu" aria-busy="true"><p>Cargando la carta…</p></div>
<div class="cartbar" id="cartbar" hidden><span id="cartsum"></span><button class="btn" id="opencart" type="button">Ver pedido</button></div>
<dialog id="cart" aria-labelledby="cart-title">
  <form id="orderform" novalidate>
    <div class="dlg-head"><h2 id="cart-title">Tu pedido</h2><button class="close" type="button" id="closecart" aria-label="Cerrar">×</button></div>
    <div class="dlg-body">
      <div class="alert" id="formerr" role="alert" hidden></div>
      <ul class="lines" id="lines"></ul>
      <fieldset class="seg"><legend>¿Cómo lo quieres?</legend>
        <label><input type="radio" name="type" value="mesa"><span>En mesa</span></label>
        <label><input type="radio" name="type" value="llevar"><span>Para llevar</span></label>
        <label><input type="radio" name="type" value="domicilio"><span>A domicilio</span></label>
      </fieldset>
      <div class="field" data-for="mesa"><label for="table_no">Número de mesa</label><input id="table_no" name="table_no" type="number" inputmode="numeric" min="1" max="99"><span class="err" data-err="table_no"></span></div>
      <div class="field"><label for="customer_name">Nombre</label><input id="customer_name" name="customer_name" autocomplete="name" maxlength="60" required><span class="err" data-err="customer_name"></span></div>
      <div class="field" data-for="llevar domicilio"><label for="phone">Teléfono</label><input id="phone" name="phone" type="tel" autocomplete="tel" maxlength="20"><span class="err" data-err="phone"></span></div>
      <div class="field" data-for="domicilio"><label for="address">Dirección de entrega</label><textarea id="address" name="address" autocomplete="street-address" maxlength="200"></textarea><span class="err" data-err="address"></span></div>
      <div class="field"><label for="notes">Notas para cocina (opcional)</label><textarea id="notes" name="notes" maxlength="300"></textarea></div>
      <div class="hp" aria-hidden="true"><label for="website">No llenar</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div>
      <div class="totals" id="totals"></div>
      <p class="demo-note">Demo: el pedido llega a la pantalla de cocina, no se cobra nada. Tus datos se usan solo para preparar el pedido; ver <a href="/privacidad">aviso de privacidad</a>.</p>
    </div>
    <div class="dlg-foot"><button class="btn btn-ghost" type="button" id="keep">Seguir viendo</button><button class="btn btn-primary" type="submit" id="send">Enviar pedido</button></div>
  </form>
</dialog>`,
});

page({
  file: "pedido.html",
  title: `Estado de tu pedido · ${NAME}`,
  description: "Sigue el estado de tu pedido en tiempo real.",
  path: "/pedido",
  noindex: true,
  script: "pedido.ts",
  body: `<div class="wrap track"><div class="card" id="track" aria-busy="true"><p>Buscando tu pedido…</p></div></div>`,
});

page({
  file: "cocina.html",
  title: `Cocina · ${NAME}`,
  description: "Pantalla de pedidos para cocina.",
  path: "/cocina",
  noindex: true,
  script: "cocina.ts",
  body: `<div class="wrap staff" id="app"><p>Cargando…</p></div>`,
});

page({
  file: "admin.html",
  title: `Panel · ${NAME}`,
  description: "Panel de administración del restaurante.",
  path: "/admin",
  noindex: true,
  script: "admin.ts",
  body: `<div class="wrap staff" id="app"><p>Cargando…</p></div>`,
});

const legal = (file, title, path, body) =>
  page({ file, title: `${title} · ${NAME}`, description: `${title} del sitio de demostración ${NAME}.`, path, body: `<article class="wrap legal"><h1>${title}</h1>${body}</article>` });

legal(
  "aviso-legal.html",
  "Aviso legal",
  "/aviso-legal",
  `<p class="demo-note">Sitio de demostración. ${NAME} es un restaurante ficticio creado para mostrar un sistema de pedidos. No vende productos reales ni procesa pagos.</p>
<h2>Titular</h2><p>En un proyecto real aquí van la razón social o nombre del titular, RFC, domicilio fiscal y un correo de contacto.</p>
<h2>Uso del sitio</h2><p>El contenido es informativo. Los precios y la disponibilidad que se muestran son de ejemplo.</p>
<h2>Propiedad intelectual</h2><p>Las imágenes de platillos y del local son ilustraciones generadas para la demostración. El código del sistema pertenece a su desarrollador.</p>`,
);

legal(
  "privacidad.html",
  "Aviso de privacidad",
  "/privacidad",
  `<p class="demo-note">Plantilla de demostración redactada conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (México). En un proyecto real debe completarse con los datos del responsable y revisarse con un abogado.</p>
<h2>Responsable</h2><p>[Nombre o razón social del restaurante], con domicilio en [domicilio], es responsable del tratamiento de tus datos personales.</p>
<h2>Datos que recabamos</h2><p>Nombre, teléfono y, solo en pedidos a domicilio, la dirección de entrega. No pedimos datos sensibles ni datos de tarjeta.</p>
<h2>Finalidades</h2><p><strong>Primarias (necesarias):</strong> preparar y entregar tu pedido y contactarte sobre él. <strong>Secundarias:</strong> ninguna; no usamos tus datos para publicidad.</p>
<h2>Conservación</h2><p>En esta demostración los pedidos se eliminan automáticamente a las 24 horas.</p>
<h2>Transferencias</h2><p>No compartimos tus datos con terceros, salvo el proveedor de alojamiento que opera el sitio (encargado) o cuando lo exija una autoridad.</p>
<h2>Derechos ARCO</h2><p>Puedes solicitar el acceso, rectificación, cancelación u oposición al tratamiento de tus datos, o revocar tu consentimiento, escribiendo a [correo de privacidad]. Responderemos en los plazos que marca la ley.</p>
<h2>Cambios</h2><p>Cualquier cambio a este aviso se publicará en esta página.</p>`,
);

legal(
  "cookies.html",
  "Política de cookies",
  "/cookies",
  `<p>Este sitio <strong>no usa cookies de publicidad ni de analítica</strong>, por eso no te pedimos consentimiento.</p>
<h2>Cookies estrictamente necesarias</h2>
<table><thead><tr><th>Nombre</th><th>Para qué</th><th>Duración</th></tr></thead>
<tbody><tr><td>__Host-sn_session</td><td>Mantener la sesión del personal en cocina y panel (solo si inicias sesión)</td><td>8 horas</td></tr></tbody></table>
<h2>Almacenamiento local</h2><p>Tu carrito se guarda en el almacenamiento local del navegador para no perderlo si recargas la página. Puedes borrarlo vaciando el carrito o los datos del sitio.</p>`,
);

legal(
  "terminos.html",
  "Términos de uso",
  "/terminos",
  `<p class="demo-note">Términos de demostración. En un proyecto real se adaptan a las políticas del restaurante y a la Ley Federal de Protección al Consumidor.</p>
<h2>Pedidos</h2><p>Un pedido queda confirmado cuando el sitio muestra su código. El restaurante puede cancelarlo si un producto se agota; te avisaremos.</p>
<h2>Precios</h2><p>Los precios incluyen IVA y se expresan en pesos mexicanos. El costo de envío se muestra antes de confirmar.</p>
<h2>Pagos</h2><p>Esta demo no cobra. En un proyecto real el pago puede ser en el local, contra entrega o en línea con un procesador certificado.</p>`,
);

page({
  file: "404.html",
  title: `Página no encontrada · ${NAME}`,
  description: "La página que buscas no existe.",
  path: "/404",
  noindex: true,
  body: `<div class="wrap notfound"><h1>Esta página no está en la carta</h1><p>Puede que el enlace esté mal escrito o que la página ya no exista.</p><p><a class="btn btn-primary" href="/menu">Ver el menú</a> <a class="btn btn-ghost" href="/">Ir al inicio</a></p></div>`,
});

console.log("páginas generadas");
