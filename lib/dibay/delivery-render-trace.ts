"use client";

import { traceDeliveryCartOptimisticMs as traceCartOptimisticMs } from "@/lib/dibay/delivery-cart-trace";
import {
  DELIVERY_PERF_TAG_CART_RERENDER,
  DELIVERY_PERF_TAG_CART_SUBTREE_IMPACT,
  DELIVERY_PERF_TAG_DETAIL_RERENDER,
  DELIVERY_PERF_TAG_MENU_SUBTREE_STABILITY,
  DELIVERY_PERF_TAG_SHEET_HYDRATE_MS,
  DELIVERY_PERF_TAG_SHEET_OPEN_MS,
  DELIVERY_PERF_TAG_SHEET_RERENDER,
  DELIVERY_PERF_TAG_TOAST_RERENDER,
  DELIVERY_PERF_TAG_TOAST_OPEN_MS,
  DELIVERY_PERF_TAG_CART_PREVIEW_OPEN_MS,
  DELIVERY_PERF_TAG_CART_PREVIEW_RERENDER,
  DELIVERY_PERF_TAG_CHECKOUT,
  deliveryPerfTraceEnabled,
  deliveryPerfTraceLog,
} from "@/lib/dibay/delivery-perf-trace";

const renderCounts = new Map<string, number>();

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** dev-only — Profiler 대용 경량 render 카운트 */
export function deliveryRenderTraceBump(surface: string, extra?: Record<string, unknown>): void {
  if (!deliveryPerfTraceEnabled()) return;
  const key = surface.trim();
  if (!key) return;
  const n = (renderCounts.get(key) ?? 0) + 1;
  renderCounts.set(key, n);
  if (n <= 3 || n % 20 === 0) {
    const tag =
      key.startsWith("toast")
        ? DELIVERY_PERF_TAG_TOAST_RERENDER
        : key.startsWith("cart-preview")
          ? DELIVERY_PERF_TAG_CART_PREVIEW_RERENDER
        : key.startsWith("sheet")
          ? DELIVERY_PERF_TAG_SHEET_RERENDER
          : key.startsWith("cart")
            ? DELIVERY_PERF_TAG_CART_RERENDER
            : key.startsWith("menu")
              ? DELIVERY_PERF_TAG_MENU_SUBTREE_STABILITY
              : DELIVERY_PERF_TAG_DETAIL_RERENDER;
    deliveryPerfTraceLog(tag, {
      event: "render",
      surface: key,
      count: n,
      ...extra,
    });
  }
}

export function deliveryTraceSheetOpenMs(productId: string, ms: number): void {
  if (!deliveryPerfTraceEnabled()) return;
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_SHEET_OPEN_MS, {
    event: "sheet_frame_visible",
    product_id: productId,
    value_ms: Math.round(ms),
  });
}

export function deliveryTraceSheetHydrateMs(productId: string, ms: number): void {
  if (!deliveryPerfTraceEnabled()) return;
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_SHEET_HYDRATE_MS, {
    event: "option_full_hydrate",
    product_id: productId,
    value_ms: Math.round(ms),
  });
}

export function deliveryTraceCartOptimisticMs(
  storeId: string,
  ms: number,
  extra?: Record<string, unknown>
): void {
  if (!deliveryPerfTraceEnabled()) return;
  traceCartOptimisticMs(ms, { store_id: storeId }, extra);
}

export function deliveryTraceCartSubtreeImpact(
  surface: string,
  storeId: string,
  msSincePatch: number
): void {
  if (!deliveryPerfTraceEnabled()) return;
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_CART_SUBTREE_IMPACT, {
    event: "subtree_touched_after_cart",
    surface,
    store_id: storeId,
    value_ms: Math.round(msSincePatch),
  });
}

export function markDeliveryCartPatchAnchor(): number {
  return perfNow();
}

export function deliveryTraceToastOpenMs(storeId: string, ms: number): void {
  if (!deliveryPerfTraceEnabled()) return;
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_TOAST_OPEN_MS, {
    event: "toast_visible",
    store_id: storeId,
    value_ms: Math.round(ms),
  });
}

export function deliveryTraceCartPreviewOpenMs(storeId: string, ms: number): void {
  if (!deliveryPerfTraceEnabled()) return;
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_CART_PREVIEW_OPEN_MS, {
    event: "cart_preview_visible",
    store_id: storeId,
    value_ms: Math.round(ms),
  });
}

export function deliveryTraceCheckoutShellMs(storeSlug: string, ms: number): void {
  if (!deliveryPerfTraceEnabled()) return;
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_CHECKOUT, {
    event: "checkout_shell_visible_ms",
    slug: storeSlug,
    value_ms: Math.round(ms),
  });
}

export function resetDeliveryRenderTraceForTests(): void {
  renderCounts.clear();
}
