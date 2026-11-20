import { api, ApiError, setCsrf } from "./api";
import { h } from "./dom";

export interface Me {
  username: string;
  role: "admin" | "cocina";
  csrf: string;
}

const DEMO_HINT: Record<string, string> = {
  admin: "Demo: usuario admin · contraseña demo-admin-2026",
  cocina: "Demo: usuario cocina · contraseña demo-cocina-2026 (o la de admin)",
};

export async function currentUser(): Promise<Me | null> {
  try {
    const me = await api<Me>("/auth/me");
    setCsrf(me.csrf);
    return me;
  } catch {
    return null;
  }
}

export function loginView(root: HTMLElement, area: "admin" | "cocina", onDone: (me: Me) => void): void {
  const err = h("div", { class: "alert", role: "alert", hidden: true });
  const user = h("input", { id: "u", name: "username", autocomplete: "username", required: true, maxlength: 40 });
  const pass = h("input", { id: "p", name: "password", type: "password", autocomplete: "current-password", required: true, maxlength: 200 });
  const btn = h("button", { class: "btn btn-primary", type: "submit" }, "Entrar");
  const form = h(
    "form",
    { class: "card login", novalidate: true },
    h("h1", {}, area === "admin" ? "Panel del restaurante" : "Pantalla de cocina"),
    h("p", { class: "demo-note" }, DEMO_HINT[area] ?? ""),
    err,
    h("div", { class: "field" }, h("label", { for: "u" }, "Usuario"), user),
    h("div", { class: "field" }, h("label", { for: "p" }, "Contraseña"), pass),
    btn,
  );
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    btn.disabled = true;
    err.hidden = true;
    try {
      const me = await api<Me>("/auth/login", { method: "POST", body: { username: user.value.trim(), password: pass.value } });
      setCsrf(me.csrf);
      onDone(me);
    } catch (e) {
      err.hidden = false;
      err.textContent = e instanceof ApiError ? e.message : "No se pudo iniciar sesión.";
      pass.value = "";
      pass.focus();
      btn.disabled = false;
    }
  });
  root.replaceChildren(form);
  user.focus();
}

export async function logout(): Promise<void> {
  await api("/auth/logout", { method: "POST" }).catch(() => undefined);
  location.reload();
}
