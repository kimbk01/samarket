import {
  DELIVERY_PERF_TAG_CART_PATCH,
  deliveryPerfTraceLog,
} from "@/lib/dibay/delivery-perf-trace";

const THROTTLE_MS = 600;
const lastAt = new Map<string, number>();

function shouldEmit(key: string): boolean {
  const now = Date.now();
  const prev = lastAt.get(key);
  if (prev != null && now - prev < THROTTLE_MS) return false;
  lastAt.set(key, now);
  return true;
}

/** 개발·운영 디버그 — `NEXT_PUBLIC_STORE_CART_TRACE=1` 또는 non-production */
export function traceCommerceCart(
  event: string,
  detail?: Record<string, string | number | boolean | null | undefined>
): void {
  const enabled =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_STORE_CART_TRACE === "1";
  if (!enabled) return;

  const key = `${event}:${JSON.stringify(detail ?? {})}`;
  if (!shouldEmit(key)) return;

  deliveryPerfTraceLog(DELIVERY_PERF_TAG_CART_PATCH, {
    event: `commerce_cart_${event}`,
    ...detail,
  });
}

export function resetCommerceCartTraceForTests(): void {
  lastAt.clear();
}
