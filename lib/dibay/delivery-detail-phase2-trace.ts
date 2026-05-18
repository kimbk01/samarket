/**
 * [dibay-delivery-detail-phase2] — 매장 상세 first-menu / API 워터폴 분해.
 * 켜짐: `delivery-flow-perf` 와 동일 (dev 기본 on, prod는 NEXT_PUBLIC_DIBAY_DELIVERY_FLOW_PERF=1).
 */

function enabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.NEXT_PUBLIC_DIBAY_DELIVERY_FLOW_PERF === "1";
}

const PREFIX = "[dibay-delivery-detail-phase2]";

export function dibayDeliveryDetailPhase2Log(
  event: string,
  payload: Record<string, unknown> & { slug?: string }
): void {
  if (!enabled()) return;
  console.info(PREFIX, {
    event,
    perf_ms: Math.round(performance.now()),
    ...payload,
  });
}

/** 네비 클릭 t0 대비 ms */
export function dibayDeliveryDetailPhase2SinceNavMs(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("dibay:perf:nav_t0");
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.round(performance.now() - n));
  } catch {
    return null;
  }
}

export function dibayDeliveryDetailPhase2SinceMountOrNav(mountT0: number | null): {
  since_mount_ms: number | null;
  since_nav_ms: number | null;
} {
  const sinceNav = dibayDeliveryDetailPhase2SinceNavMs();
  const sinceMount =
    mountT0 != null && Number.isFinite(mountT0) ? Math.max(0, Math.round(performance.now() - mountT0)) : null;
  return { since_mount_ms: sinceMount, since_nav_ms: sinceNav };
}
