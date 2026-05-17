/** 매장 오너 대시보드 API — `[owner-dashboard-perf]` 세분화·임계값 warn */

export type OwnerDashboardPerfLog = {
  route: string;
  store_id?: string | null;
  total_ms: number;
  auth_ms?: number;
  ownership_ms?: number;
  db_ms?: number;
  count_ms?: number;
  list_ms?: number;
  transform_ms?: number;
  cache_hit?: 0 | 1;
  result_count?: number;
  payload_bytes?: number;
  [key: string]: unknown;
};

const WARN = {
  order_counts_total_ms: 150,
  orders_total_ms: 400,
  inquiries_total_ms: 300,
  notifications_total_ms: 200,
  auth_ms: 80,
  payload_bytes: 400_000,
} as const;

export function jsonPayloadBytes(body: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(body), "utf8");
  } catch {
    return 0;
  }
}

export function logOwnerDashboardPerf(input: OwnerDashboardPerfLog): void {
  console.log("[owner-dashboard-perf]", input);

  const route = input.route;
  const total = input.total_ms;
  const auth = input.auth_ms ?? 0;
  const bytes = input.payload_bytes ?? 0;

  if (auth > WARN.auth_ms) {
    console.warn("[owner-dashboard-perf] warn auth_ms", { route, auth_ms: auth, threshold: WARN.auth_ms });
  }
  if (bytes > WARN.payload_bytes) {
    console.warn("[owner-dashboard-perf] warn payload_bytes", { route, payload_bytes: bytes, threshold: WARN.payload_bytes });
  }

  if (route.includes("order-counts") && total > WARN.order_counts_total_ms && input.cache_hit !== 1) {
    console.warn("[owner-dashboard-perf] warn order-counts slow", { route, total_ms: total, threshold: WARN.order_counts_total_ms });
  }
  if (route.includes("/orders") && !route.includes("order-counts") && total > WARN.orders_total_ms) {
    console.warn("[owner-dashboard-perf] warn orders slow", { route, total_ms: total, threshold: WARN.orders_total_ms });
  }
  if (route.includes("inquiries") && total > WARN.inquiries_total_ms) {
    console.warn("[owner-dashboard-perf] warn inquiries slow", { route, total_ms: total, threshold: WARN.inquiries_total_ms });
  }
  if (route.includes("notifications") && total > WARN.notifications_total_ms) {
    console.warn("[owner-dashboard-perf] warn notifications slow", { route, total_ms: total, threshold: WARN.notifications_total_ms });
  }
}

export function perfNowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
