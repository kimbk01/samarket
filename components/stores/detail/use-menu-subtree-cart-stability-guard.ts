"use client";

import { useLayoutEffect, useRef } from "react";
import { msSinceDeliveryCartPatch } from "@/lib/dibay/delivery-cart-patch-bus";
import { deliveryTraceCartSubtreeImpact } from "@/lib/dibay/delivery-render-trace";
import { deliveryPerfTraceEnabled } from "@/lib/dibay/delivery-perf-trace";

const MENU_SUBTREE_IMPACT_WINDOW_MS = 120;

/**
 * cart patch 직후 메뉴 subtree render 가 발생하면 trace (목표: 0).
 */
export function useMenuSubtreeCartStabilityGuard(storeId: string | null | undefined): void {
  const storeIdRef = useRef(storeId);
  storeIdRef.current = storeId;

  useLayoutEffect(() => {
    if (!deliveryPerfTraceEnabled()) return;
    const sid = String(storeIdRef.current ?? "").trim();
    if (!sid || sid.startsWith("seed:")) return;
    const since = msSinceDeliveryCartPatch(sid);
    if (since == null || since > MENU_SUBTREE_IMPACT_WINDOW_MS) return;
    deliveryTraceCartSubtreeImpact("menu-section", sid, since);
  });
}
