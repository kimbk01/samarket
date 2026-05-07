/**
 * dibaY 배달 플로우 실측 로그 — dev/test 기본 on, production은 NEXT_PUBLIC_DIBAY_DELIVERY_FLOW_PERF=1 일 때만.
 */

const PREFIX = "[dibay-delivery-flow-perf]";

const K_NAV_T0 = "dibay:perf:nav_t0";
const K_NAV_SLUG = "dibay:perf:nav_slug";
const K_MENU_OPEN_T0 = "dibay:perf:menu_open_t0";
const K_ADD_CART_T0 = "dibay:perf:add_cart_t0";
const K_ORDER_CLICK_T0 = "dibay:perf:order_click_t0";

function ownerChangeKey(orderId: string): string {
  return `dibay:perf:owner_change:${orderId.trim()}`;
}

export type DibayPerfPayload = {
  metric: string;
  value_ms: number;
  order_id?: string;
  store_id?: string;
  product_id?: string;
  route: string;
  timestamp: number;
};

function enabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.NEXT_PUBLIC_DIBAY_DELIVERY_FLOW_PERF === "1";
}

function routeNow(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname || "";
}

function emit(payload: DibayPerfPayload): void {
  if (!enabled()) return;
  console.info(PREFIX, payload);
}

function readNavT0(): number | null {
  try {
    const raw = sessionStorage.getItem(K_NAV_T0);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** 매장 카드에서 상세로 들어가기 직전(클릭 시점) */
export function dibayPerfRecordStoreCardNavigationIntent(slug: string): void {
  if (!enabled() || typeof window === "undefined") return;
  const s = (slug || "").trim();
  if (!s) return;
  try {
    const t0 = performance.now();
    sessionStorage.setItem(K_NAV_T0, String(t0));
    sessionStorage.setItem(K_NAV_SLUG, s);
  } catch {
    /* ignore */
  }
  emit({
    metric: "store_click_ms",
    value_ms: performance.now(),
    store_id: s,
    route: routeNow(),
    timestamp: Date.now(),
  });
}

/** 메뉴 행 클릭 → 옵션 시트 열기 직전 */
export function dibayPerfRecordMenuItemOpenIntent(): void {
  if (!enabled() || typeof window === "undefined") return;
  const t = performance.now();
  try {
    sessionStorage.setItem(K_MENU_OPEN_T0, String(t));
  } catch {
    /* ignore */
  }
  emit({
    metric: "menu_click_ms",
    value_ms: t,
    route: routeNow(),
    timestamp: Date.now(),
  });
}

export function dibayPerfOnStoreDetailShellVisible(opts: { slug: string }): void {
  if (!enabled()) return;
  const route = routeNow();
  const t0 = readNavT0();
  const shellMs = performance.now();
  emit({
    metric: "store_shell_visible_ms",
    value_ms: t0 != null ? Math.max(0, shellMs - t0) : shellMs,
    store_id: opts.slug,
    route,
    timestamp: Date.now(),
  });
  if (t0 != null) {
    emit({
      metric: "store_click_to_shell_visible_ms",
      value_ms: Math.max(0, shellMs - t0),
      store_id: opts.slug,
      route,
      timestamp: Date.now(),
    });
  }
}

export function dibayPerfOnStoreMenuVisible(opts: { slug: string; storeId: string }): void {
  if (!enabled()) return;
  const route = routeNow();
  const t0 = readNavT0();
  const menuMs = performance.now();
  emit({
    metric: "store_menu_visible_ms",
    value_ms: t0 != null ? Math.max(0, menuMs - t0) : menuMs,
    store_id: opts.storeId,
    route,
    timestamp: Date.now(),
  });
  if (t0 != null) {
    emit({
      metric: "store_click_to_menu_visible_ms",
      value_ms: Math.max(0, menuMs - t0),
      store_id: opts.storeId,
      route,
      timestamp: Date.now(),
    });
  }
}

export function dibayPerfOnOptionSheetVisible(opts: { storeId?: string; productId?: string }): void {
  if (!enabled()) return;
  const route = routeNow();
  let menuOpenT0: number | null = null;
  try {
    const raw = sessionStorage.getItem(K_MENU_OPEN_T0);
    if (raw) menuOpenT0 = Number(raw);
  } catch {
    menuOpenT0 = null;
  }
  const sheetMs = performance.now();
  emit({
    metric: "option_sheet_visible_ms",
    value_ms:
      menuOpenT0 != null && Number.isFinite(menuOpenT0) ? Math.max(0, sheetMs - menuOpenT0) : sheetMs,
    store_id: opts.storeId,
    product_id: opts.productId,
    route,
    timestamp: Date.now(),
  });
  if (menuOpenT0 != null && Number.isFinite(menuOpenT0)) {
    emit({
      metric: "menu_click_to_option_sheet_visible_ms",
      value_ms: Math.max(0, sheetMs - menuOpenT0),
      store_id: opts.storeId,
      product_id: opts.productId,
      route,
      timestamp: Date.now(),
    });
  }
}

const K_LAST_MODIFIER_INTENT_T0 = "dibay:perf:modifier_intent_t0";

export function dibayPerfOnOptionPriceUpdated(opts: { storeId?: string; productId?: string }): void {
  if (!enabled()) return;
  const route = routeNow();
  const now = performance.now();
  emit({
    metric: "option_price_updated_ms",
    value_ms: now,
    store_id: opts.storeId,
    product_id: opts.productId,
    route,
    timestamp: Date.now(),
  });
  let t0: number | null = null;
  try {
    const raw = sessionStorage.getItem(K_LAST_MODIFIER_INTENT_T0);
    if (raw) t0 = Number(raw);
  } catch {
    t0 = null;
  }
  if (t0 != null && Number.isFinite(t0)) {
    emit({
      metric: "option_select_to_price_update_ms",
      value_ms: Math.max(0, now - t0),
      store_id: opts.storeId,
      product_id: opts.productId,
      route,
      timestamp: Date.now(),
    });
  }
}

/** 옵션 피커 변경 직전 호출 — `option_select_to_price_update_ms` 구간 앵커 */
export function dibayPerfRecordModifierIntent(productId?: string): void {
  if (!enabled() || typeof window === "undefined") return;
  try {
    sessionStorage.setItem(K_LAST_MODIFIER_INTENT_T0, String(performance.now()));
  } catch {
    /* ignore */
  }
}

/** 단건 상품 API fetch 구간 (시작 시각 반환 → done 에서 duration 계산) */
export function dibayPerfOnOptionDetailFetchStart(opts: {
  storeId?: string;
  productId?: string;
}): number {
  if (!enabled()) return performance.now();
  const route = routeNow();
  const t = performance.now();
  emit({
    metric: "option_detail_fetch_start_ms",
    value_ms: t,
    store_id: opts.storeId,
    product_id: opts.productId,
    route,
    timestamp: Date.now(),
  });
  return t;
}

export function dibayPerfOnOptionDetailFetchDone(opts: {
  storeId?: string;
  productId?: string;
  startMark: number;
}): void {
  if (!enabled()) return;
  const route = routeNow();
  const t = performance.now();
  emit({
    metric: "option_detail_fetch_done_ms",
    value_ms: t,
    store_id: opts.storeId,
    product_id: opts.productId,
    route,
    timestamp: Date.now(),
  });
  emit({
    metric: "option_detail_fetch_duration_ms",
    value_ms: Math.max(0, t - opts.startMark),
    store_id: opts.storeId,
    product_id: opts.productId,
    route,
    timestamp: Date.now(),
  });
}

export function dibayPerfRecordCartBlockedByOtherStore(opts: {
  existingStoreId?: string;
  nextStoreId?: string;
}): void {
  if (!enabled()) return;
  emit({
    metric: "cart_blocked_by_other_store_ms",
    value_ms: performance.now(),
    store_id: opts.nextStoreId,
    route: routeNow(),
    timestamp: Date.now(),
  });
}

export function dibayPerfRecordCartReplaceConfirm(opts: { storeId?: string }): void {
  if (!enabled()) return;
  emit({
    metric: "cart_replace_confirm_ms",
    value_ms: performance.now(),
    store_id: opts.storeId,
    route: routeNow(),
    timestamp: Date.now(),
  });
}

export function dibayPerfRecordCartReplaceDone(opts: { storeId?: string }): void {
  if (!enabled()) return;
  emit({
    metric: "cart_replace_done_ms",
    value_ms: performance.now(),
    store_id: opts.storeId,
    route: routeNow(),
    timestamp: Date.now(),
  });
}

export function dibayPerfRecordAddToCartClick(storeId: string): void {
  if (!enabled() || typeof window === "undefined") return;
  try {
    sessionStorage.setItem(K_ADD_CART_T0, String(performance.now()));
  } catch {
    /* ignore */
  }
  emit({
    metric: "add_to_cart_click_ms",
    value_ms: performance.now(),
    store_id: storeId,
    route: routeNow(),
    timestamp: Date.now(),
  });
}

export function dibayPerfOnCartbarUpdated(storeId: string): void {
  if (!enabled()) return;
  let t0: number | null = null;
  try {
    const raw = sessionStorage.getItem(K_ADD_CART_T0);
    if (raw) t0 = Number(raw);
  } catch {
    t0 = null;
  }
  const now = performance.now();
  emit({
    metric: "cartbar_updated_ms",
    value_ms: now,
    store_id: storeId,
    route: routeNow(),
    timestamp: Date.now(),
  });
  if (t0 != null && Number.isFinite(t0)) {
    emit({
      metric: "add_to_cart_click_to_cartbar_update_ms",
      value_ms: Math.max(0, now - t0),
      store_id: storeId,
      route: routeNow(),
      timestamp: Date.now(),
    });
  }
}

export function dibayPerfRecordOrderSubmitClick(storeId: string): void {
  if (!enabled() || typeof window === "undefined") return;
  const t0 = performance.now();
  try {
    sessionStorage.setItem(K_ORDER_CLICK_T0, String(t0));
  } catch {
    /* ignore */
  }
  emit({
    metric: "order_click_ms",
    value_ms: t0,
    store_id: storeId,
    route: routeNow(),
    timestamp: Date.now(),
  });
}

export function dibayPerfOnOrderApiStart(storeId: string): void {
  if (!enabled()) return;
  emit({
    metric: "order_api_start_ms",
    value_ms: performance.now(),
    store_id: storeId,
    route: routeNow(),
    timestamp: Date.now(),
  });
}

export function dibayPerfRecordOrderIdempotencyKeyCreated(storeId: string): void {
  if (!enabled()) return;
  emit({
    metric: "order_idempotency_key_created_ms",
    value_ms: performance.now(),
    store_id: storeId,
    route: routeNow(),
    timestamp: Date.now(),
  });
}

/** 서버가 동일 client_order_key 로 기존 주문을 즉시 반환했을 때 */
export function dibayPerfRecordOrderIdempotencyExistingHit(storeId: string): void {
  if (!enabled()) return;
  emit({
    metric: "order_idempotency_existing_hit_ms",
    value_ms: performance.now(),
    store_id: storeId,
    route: routeNow(),
    timestamp: Date.now(),
  });
}

export function dibayPerfOnOrderApiDone(storeId: string, orderId?: string): void {
  if (!enabled()) return;
  let clickT0: number | null = null;
  try {
    const raw = sessionStorage.getItem(K_ORDER_CLICK_T0);
    if (raw) clickT0 = Number(raw);
  } catch {
    clickT0 = null;
  }
  const doneMs = performance.now();
  emit({
    metric: "order_api_done_ms",
    value_ms: doneMs,
    order_id: orderId,
    store_id: storeId,
    route: routeNow(),
    timestamp: Date.now(),
  });
  if (clickT0 != null && Number.isFinite(clickT0)) {
    emit({
      metric: "order_click_to_api_done_ms",
      value_ms: Math.max(0, doneMs - clickT0),
      order_id: orderId,
      store_id: storeId,
      route: routeNow(),
      timestamp: Date.now(),
    });
  }
}

export function dibayPerfRecordOrderDetailSeedSaved(orderId: string): void {
  if (!enabled()) return;
  emit({
    metric: "order_detail_seed_saved_ms",
    value_ms: performance.now(),
    order_id: orderId.trim() || undefined,
    route: routeNow(),
    timestamp: Date.now(),
  });
}

export function dibayPerfRecordOrderDetailSeedUsed(orderId: string): void {
  if (!enabled()) return;
  emit({
    metric: "order_detail_seed_used_ms",
    value_ms: performance.now(),
    order_id: orderId.trim() || undefined,
    route: routeNow(),
    timestamp: Date.now(),
  });
}

export function dibayPerfRecordOrderDetailSeedHydrated(orderId: string): void {
  if (!enabled()) return;
  emit({
    metric: "order_detail_seed_hydrated_ms",
    value_ms: performance.now(),
    order_id: orderId.trim() || undefined,
    route: routeNow(),
    timestamp: Date.now(),
  });
}

export function dibayPerfRecordOrderDetailSeedCleared(orderId: string): void {
  if (!enabled()) return;
  emit({
    metric: "order_detail_seed_cleared_ms",
    value_ms: performance.now(),
    order_id: orderId.trim() || undefined,
    route: routeNow(),
    timestamp: Date.now(),
  });
}

export function dibayPerfOnOrderDetailVisible(orderId: string): void {
  if (!enabled()) return;
  let clickT0: number | null = null;
  try {
    const raw = sessionStorage.getItem(K_ORDER_CLICK_T0);
    if (raw) clickT0 = Number(raw);
  } catch {
    clickT0 = null;
  }
  const visMs = performance.now();
  emit({
    metric: "order_detail_visible_ms",
    value_ms: visMs,
    order_id: orderId,
    route: routeNow(),
    timestamp: Date.now(),
  });
  if (clickT0 != null && Number.isFinite(clickT0)) {
    emit({
      metric: "order_click_to_detail_visible_ms",
      value_ms: Math.max(0, visMs - clickT0),
      order_id: orderId,
      route: routeNow(),
      timestamp: Date.now(),
    });
  }
}

export function dibayPerfOnOwnerOrdersVisible(storeId: string): void {
  if (!enabled()) return;
  emit({
    metric: "owner_order_visible_ms",
    value_ms: performance.now(),
    store_id: storeId,
    route: routeNow(),
    timestamp: Date.now(),
  });
}

export function dibayPerfRecordOwnerOrderRealtimeInsertReceived(storeId: string, orderId?: string): void {
  if (!enabled()) return;
  emit({
    metric: "owner_order_realtime_insert_received_ms",
    value_ms: performance.now(),
    store_id: storeId,
    order_id: orderId?.trim() || undefined,
    route: routeNow(),
    timestamp: Date.now(),
  });
}

/** 고객 주문 생성 후 오너 화면에 행이 보일 때까지 — checkout 에서 `dibay:buyer_order_placed_wall:${orderId}` 세션 앵커 필요 */
export function dibayPerfRecordOrderCreatedToOwnerVisible(storeId: string, orderId: string): void {
  if (!enabled()) return;
  const oid = orderId.trim();
  if (!oid) return;
  let anchor: number | null = null;
  try {
    const raw = sessionStorage.getItem(`dibay:buyer_order_placed_wall:${oid}`);
    if (raw != null) {
      const n = Number(raw);
      anchor = Number.isFinite(n) ? n : null;
    }
  } catch {
    anchor = null;
  }
  if (anchor == null) return;
  const now = Date.now();
  emit({
    metric: "order_created_to_owner_visible_ms",
    value_ms: Math.max(0, now - anchor),
    store_id: storeId,
    order_id: oid,
    route: routeNow(),
    timestamp: now,
  });
}

export function dibayPerfRecordOwnerOrderRealtimeUpdateReceived(storeId: string, orderId?: string): void {
  if (!enabled()) return;
  emit({
    metric: "owner_order_realtime_update_received_ms",
    value_ms: performance.now(),
    store_id: storeId,
    order_id: orderId?.trim() || undefined,
    route: routeNow(),
    timestamp: Date.now(),
  });
}

export function dibayPerfRecordOwnerOrderRowPatched(storeId: string, orderId?: string): void {
  if (!enabled()) return;
  emit({
    metric: "owner_order_row_patched_ms",
    value_ms: performance.now(),
    store_id: storeId,
    order_id: orderId?.trim() || undefined,
    route: routeNow(),
    timestamp: Date.now(),
  });
}

export function dibayPerfRecordOwnerOrderFullReloadFallback(storeId: string): void {
  if (!enabled()) return;
  emit({
    metric: "owner_order_full_reload_fallback_ms",
    value_ms: performance.now(),
    store_id: storeId,
    route: routeNow(),
    timestamp: Date.now(),
  });
}

/** 오너가 상태 변경 API 호출 직전 — 고객 화면 지연 측정용 앵커 */
export function dibayPerfBridgeOwnerStatusChange(orderId: string): void {
  if (!enabled() || typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ownerChangeKey(orderId), String(performance.now()));
  } catch {
    /* ignore */
  }
  emit({
    metric: "owner_status_change_click_ms",
    value_ms: performance.now(),
    order_id: orderId,
    route: routeNow(),
    timestamp: Date.now(),
  });
}

export function dibayPerfMaybeEmitCustomerStatusAfterOwner(orderId: string): void {
  if (!enabled() || typeof window === "undefined") return;
  const id = orderId.trim();
  if (!id) return;
  let t0: number | null = null;
  try {
    const key = ownerChangeKey(id);
    const raw = sessionStorage.getItem(key);
    if (raw) {
      t0 = Number(raw);
      sessionStorage.removeItem(key);
    }
  } catch {
    t0 = null;
  }
  const now = performance.now();
  emit({
    metric: "customer_order_status_visible_ms",
    value_ms: now,
    order_id: id,
    route: routeNow(),
    timestamp: Date.now(),
  });
  if (t0 != null && Number.isFinite(t0)) {
    emit({
      metric: "owner_status_change_to_customer_visible_ms",
      value_ms: Math.max(0, now - t0),
      order_id: id,
      route: routeNow(),
      timestamp: Date.now(),
    });
  }
}

export function dibayPerfOnOrderChatRoomVisible(orderId: string): void {
  if (!enabled()) return;
  let clickT0: number | null = null;
  try {
    const raw = sessionStorage.getItem(K_ORDER_CLICK_T0);
    if (raw) clickT0 = Number(raw);
  } catch {
    clickT0 = null;
  }
  const vis = performance.now();
  emit({
    metric: "order_chat_room_visible_ms",
    value_ms: vis,
    order_id: orderId,
    route: routeNow(),
    timestamp: Date.now(),
  });
  if (clickT0 != null && Number.isFinite(clickT0)) {
    emit({
      metric: "order_click_to_chat_visible_ms",
      value_ms: Math.max(0, vis - clickT0),
      order_id: orderId,
      route: routeNow(),
      timestamp: Date.now(),
    });
  }
}
