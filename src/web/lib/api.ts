export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let csrfToken = "";

export function setCsrf(token: string): void {
  csrfToken = token;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = { accept: "application/json" };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET" && csrfToken) headers["x-csrf-token"] = csrfToken;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: "same-origin",
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, "Sin conexión. Revisa tu internet e intenta de nuevo.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> };
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Algo salió mal.", data.fields ?? {});
  return data as T;
}

export interface MenuItem {
  id: number;
  name: string;
  description: string;
  price_cents: number;
  image: string | null;
  available: boolean;
}

export interface MenuResponse {
  restaurant: { name: string; is_open: boolean; hours: string; delivery_cents: number; whatsapp: string };
  categories: { id: number; name: string; items: MenuItem[] }[];
}
