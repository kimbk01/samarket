"use client";

import { useLayoutEffect, useRef } from "react";
import { DELIVERY_PERF_TAG_DETAIL_RERENDER, deliveryPerfTraceLog } from "@/lib/dibay/delivery-perf-trace";
import { deliveryPerfTraceEnabled } from "@/lib/dibay/delivery-perf-trace";

/** `StoreDetailPublic` re-render 가 허용되는 dep 키 */
const ALLOWED_RENDER_KEYS = new Set([
  "slug",
  "storeId",
  "summaryLoading",
  "menusLoading",
  "activeMenuSection",
  "menuQuery",
  "menuSearchOpen",
  "productCount",
  "recommendedCount",
  "popularCount",
  "headerSolid",
  "fulfillmentMode",
  "bannerCount",
  "noticeCount",
  "favoriteSeedKey",
  "quickCartConflictOpen",
  "dbOff",
  "canSell",
  "menuSoldOutBottom",
  "showMenusSkeleton",
  "viewerFavorited",
  "favoriteBusy",
  "openTick",
  "recentOrderCount",
]);

/**
 * dev-only — `StoreDetailPublic` render 원인 추적.
 * toast·cart preview·option sheet 는 store 격리로 deps 에 없어야 함.
 */
export function useStoreDetailRenderGuard(
  slug: string,
  deps: Record<string, string | number | boolean | null | undefined>
): void {
  const prevRef = useRef(deps);
  const countRef = useRef(0);

  useLayoutEffect(() => {
    if (!deliveryPerfTraceEnabled()) return;

    const prev = prevRef.current;
    const changed: string[] = [];
    for (const key of Object.keys(deps)) {
      if (prev[key] !== deps[key]) changed.push(key);
    }
    prevRef.current = deps;

    if (changed.length === 0) return;

    countRef.current += 1;
    const disallowed = changed.filter((k) => !ALLOWED_RENDER_KEYS.has(k));
    const allowed = disallowed.length === 0;

    deliveryPerfTraceLog(DELIVERY_PERF_TAG_DETAIL_RERENDER, {
      event: allowed ? "detail_render_allowed" : "detail_render_unexpected",
      slug,
      changed: changed.join(","),
      disallowed: disallowed.join(",") || undefined,
      render_count: countRef.current,
      allowed,
    });
  });
}
