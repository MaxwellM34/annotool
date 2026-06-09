const BASE = (import.meta.env.VITE_API_URL as string | undefined) || "";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    ...init,
  });
  if (res.status === 401) throw new ApiError(401, "unauthorized");
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {}
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.blob()) as unknown as T;
}

export class ApiError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

export const api = {
  base: BASE,
  me: () => request<Me>("/auth/me"),
  loginUrl: () => `${BASE}/auth/google/login`,
  logout: () => request("/auth/logout", { method: "POST" }),

  images: () => request<ImageRow[]>("/api/images"),
  imageMeta: (id: number) => request<ImageRow>(`/api/images/${id}`),
  imagePngUrl: (id: number) => `${BASE}/api/images/${id}/png`,

  annotationsFor: (imageId: number) =>
    request<AnnotationSet[]>(`/api/annotations/by-image/${imageId}`),
  saveAnnotation: (body: { image_id: number; round?: number; payload: AnnotationPayload }) =>
    request<AnnotationSet>("/api/annotations", { method: "POST", body: JSON.stringify(body) }),
  annotatedPngUrl: (annId: number) => `${BASE}/api/annotations/${annId}/annotated.png`,

  heartbeat: (image_id: number | null) =>
    request<{ interval_id: number }>("/api/tracking/heartbeat", {
      method: "POST",
      body: JSON.stringify({ image_id }),
    }),
  summary: () => request<TrackingSummary>("/api/tracking/summary"),

  invoices: () => request<InvoiceRow[]>("/api/invoices"),
  invoicePdfUrl: (id: number) => `${BASE}/api/invoices/${id}/pdf`,
  generatePreviousWeek: (user_id?: number) =>
    request<{ id: number; total_cents: number; total_seconds: number }>(
      "/api/invoices/generate-previous-week",
      { method: "POST", body: JSON.stringify({ user_id }) },
    ),
  runWeeklyCron: () => request("/api/invoices/run-weekly-cron", { method: "POST" }),

  adminUsers: () => request<AdminUser[]>("/api/admin/users"),
  setRate: (user_id: number, hourly_rate_cents: number) =>
    request(`/api/admin/users/${user_id}/rate`, {
      method: "PATCH",
      body: JSON.stringify({ hourly_rate_cents }),
    }),

  storage: () => request<StorageStatus>("/api/system/storage"),
  systemInfo: () => request<SystemInfo>("/api/system/info"),
};

export type StorageStatus = {
  used_bytes: number;
  limit_bytes: number;
  percent_used: number;
  locked: boolean;
  lock_at_percent: number;
};

export type SystemInfo = {
  currency_code: string;
  currency_symbol: string;
  idle_threshold_seconds: number;
};

export type Me = {
  id: number;
  email: string;
  name: string;
  picture_url: string;
  is_admin: boolean;
  hourly_rate_cents: number;
};

export type ImageRow = {
  id: number;
  slug: string;
  iter: number;
  filename: string;
  width: number;
  height: number;
  uploaded_at: string;
  your_latest_round?: number;
  your_latest_passed?: boolean;
  your_latest_annotation_count?: number;
};

export type Annotation = {
  id: string;
  shape: "rect";
  coords: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
  note: string;
};

export type AnnotationPayload = { annotations: Annotation[] };

export type AnnotationSet = {
  id: number;
  image_id: number;
  round: number;
  saved_at: string;
  payload: AnnotationPayload;
};

export type TrackingSummary = {
  today_seconds: number;
  this_week_seconds: number;
  last_week_seconds: number;
  this_week_days: { date: string; seconds: number }[];
  hourly_rate_cents: number;
};

export type InvoiceRow = {
  id: number;
  user_id: number;
  user_email: string | null;
  user_name: string | null;
  period_start: string;
  period_end: string;
  total_seconds: number;
  total_cents: number;
  hourly_rate_cents: number;
  generated_at: string;
};

export type AdminUser = {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
  hourly_rate_cents: number;
  last_week_seconds: number;
};

export function fmtHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

let currencySymbol = "CA$";
let currencyCode = "CAD";
export function setCurrency(symbol: string, code: string) {
  currencySymbol = symbol;
  currencyCode = code;
}
export function fmtMoney(cents: number): string {
  return `${currencySymbol}${(cents / 100).toFixed(2)}`;
}
export function getCurrencyCode(): string {
  return currencyCode;
}
