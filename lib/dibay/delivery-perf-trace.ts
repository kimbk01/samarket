"use client";

/**
 * dibaY 배달 UX trace — dev 기본 on, prod는 `NEXT_PUBLIC_DIBAY_DELIVERY_PERF_TRACE=1` 일 때만.
 * 동일 tag+event_key 는 DEDUPE_MS 안에 1회만 출력(console spam 방지).
 */

export const DELIVERY_PERF_TAG_STORE_ENTRY = "[delivery-store-entry]" as const;
export const DELIVERY_PERF_TAG_MENU_PASS = "[delivery-menu-pass]" as const;
export const DELIVERY_PERF_TAG_OPTION_SHEET = "[delivery-option-sheet]" as const;
export const DELIVERY_PERF_TAG_OPTION_SHEET_OPEN_MS =
  "[delivery-option-sheet-open-ms]" as const;
export const DELIVERY_PERF_TAG_OPTION_SELECT_MS = "[delivery-option-select-ms]" as const;
export const DELIVERY_PERF_TAG_OPTION_PRICE_PATCH_MS =
  "[delivery-option-price-patch-ms]" as const;
export const DELIVERY_PERF_TAG_OPTION_VALIDATION_MS =
  "[delivery-option-validation-ms]" as const;
export const DELIVERY_PERF_TAG_OPTION_ADD_SUBMIT_MS =
  "[delivery-option-add-submit-ms]" as const;
export const DELIVERY_PERF_TAG_CART_PATCH = "[delivery-cart-patch]" as const;
export const DELIVERY_PERF_TAG_CHECKOUT = "[delivery-checkout]" as const;
export const DELIVERY_PERF_TAG_ROUTE_TRANSITION = "[delivery-route-transition]" as const;
export const DELIVERY_PERF_TAG_RENDER_WALL = "[delivery-render-wall]" as const;
export const DELIVERY_PERF_TAG_LONGTASK = "[delivery-longtask]" as const;
export const DELIVERY_PERF_TAG_SUBTREE_STABILITY = "[delivery-subtree-stability]" as const;
export const DELIVERY_PERF_TAG_IMAGE_PIPELINE = "[delivery-image-pipeline]" as const;
export const DELIVERY_PERF_TAG_CART_RERENDER = "[delivery-cart-rerender]" as const;
export const DELIVERY_PERF_TAG_DETAIL_RERENDER = "[delivery-detail-rerender]" as const;
export const DELIVERY_PERF_TAG_SHEET_RERENDER = "[delivery-sheet-rerender]" as const;
export const DELIVERY_PERF_TAG_SHEET_OPEN_MS = "[delivery-sheet-open-ms]" as const;
export const DELIVERY_PERF_TAG_SHEET_HYDRATE_MS = "[delivery-sheet-hydrate-ms]" as const;
export const DELIVERY_PERF_TAG_CART_OPTIMISTIC_MS = "[delivery-cart-optimistic-ms]" as const;
export const DELIVERY_PERF_TAG_CART_QTY_PATCH_MS = "[delivery-cart-qty-patch-ms]" as const;
export const DELIVERY_PERF_TAG_CART_DELETE_MS = "[delivery-cart-delete-ms]" as const;
export const DELIVERY_PERF_TAG_CART_CONFLICT_OPEN_MS = "[delivery-cart-conflict-open-ms]" as const;
export const DELIVERY_PERF_TAG_CART_SUBTREE_IMPACT = "[delivery-cart-subtree-impact]" as const;
export const DELIVERY_PERF_TAG_MENU_SUBTREE_STABILITY = "[delivery-menu-subtree-stability]" as const;
export const DELIVERY_PERF_TAG_TOAST_RERENDER = "[delivery-toast-rerender]" as const;
export const DELIVERY_PERF_TAG_TOAST_OPEN_MS = "[delivery-toast-open-ms]" as const;
export const DELIVERY_PERF_TAG_CART_PREVIEW_OPEN_MS = "[delivery-cart-preview-open-ms]" as const;
export const DELIVERY_PERF_TAG_CART_PREVIEW_RERENDER = "[delivery-cart-preview-rerender]" as const;
export const DELIVERY_PERF_TAG_LIST_SCROLL_SAVE = "[delivery-list-scroll-save]" as const;
export const DELIVERY_PERF_TAG_LIST_SCROLL_RESTORE = "[delivery-list-scroll-restore]" as const;
export const DELIVERY_PERF_TAG_LIST_SCROLL_RESTORE_MS = "[delivery-list-scroll-restore-ms]" as const;
export const DELIVERY_PERF_TAG_SEED_SUMMARY_PATCH = "[delivery-seed-summary-patch]" as const;
export const DELIVERY_PERF_TAG_SEED_SUMMARY_PATCH_MS = "[delivery-seed-summary-patch-ms]" as const;
export const DELIVERY_PERF_TAG_HERO_LAYOUT = "[delivery-hero-layout]" as const;
export const DELIVERY_PERF_TAG_MENU_DEFERRED_HYDRATE = "[delivery-menu-deferred-hydrate]" as const;
export const DELIVERY_PERF_TAG_MENU_FETCH_START = "[delivery-menu-fetch-start]" as const;
export const DELIVERY_PERF_TAG_MENU_FETCH_COMPLETE = "[delivery-menu-fetch-complete]" as const;
export const DELIVERY_PERF_TAG_MENU_NORMALIZE_MS = "[delivery-menu-normalize-ms]" as const;
export const DELIVERY_PERF_TAG_MENU_FIRST_SECTION_READY =
  "[delivery-menu-first-section-ready]" as const;
export const DELIVERY_PERF_TAG_MENU_FIRST_VISIBLE = "[delivery-menu-first-visible]" as const;
export const DELIVERY_PERF_TAG_MENU_VISIBLE_BREAKDOWN =
  "[delivery-menu-visible-breakdown]" as const;
export const DELIVERY_PERF_TAG_MENU_NORMALIZE_BREAKDOWN =
  "[delivery-menu-normalize-breakdown]" as const;
export const DELIVERY_PERF_TAG_MENU_NORMALIZE_CHUNK = "[delivery-menu-normalize-chunk]" as const;
export const DELIVERY_PERF_TAG_MENU_DEFERRED_NORMALIZE_COMPLETE =
  "[delivery-menu-deferred-normalize-complete]" as const;
export const DELIVERY_PERF_TAG_CHECKOUT_SHELL = "[delivery-checkout-shell]" as const;
export const DELIVERY_PERF_TAG_CARD_TAP = "[delivery-card-tap]" as const;
export const DELIVERY_PERF_TAG_ROUTER_PUSH_START = "[delivery-router-push-start]" as const;
export const DELIVERY_PERF_TAG_ROUTE_LAYOUT_ENTER = "[delivery-route-layout-enter]" as const;
export const DELIVERY_PERF_TAG_DETAIL_PAGE_ENTER = "[delivery-detail-page-enter]" as const;
export const DELIVERY_PERF_TAG_DETAIL_CLIENT_MOUNT_START =
  "[delivery-detail-client-mount-start]" as const;
export const DELIVERY_PERF_TAG_DETAIL_SHELL_RENDERED = "[delivery-detail-shell-rendered]" as const;
export const DELIVERY_PERF_TAG_DETAIL_SHELL_VISIBLE = "[delivery-detail-shell-visible]" as const;
export const DELIVERY_PERF_TAG_DETAIL_SHELL_PERCEIVED_VISIBLE =
  "[delivery-detail-shell-perceived-visible]" as const;
export const DELIVERY_PERF_TAG_SHELL_ENTRY_BREAKDOWN = "[delivery-shell-entry-breakdown]" as const;
export const DELIVERY_PERF_TAG_PREFETCH_REQUEST = "[delivery-prefetch-request]" as const;
export const DELIVERY_PERF_TAG_PREFETCH_HIT = "[delivery-prefetch-hit-before-tap]" as const;
export const DELIVERY_PERF_TAG_PREFETCH_MISS = "[delivery-prefetch-miss-before-tap]" as const;
export const DELIVERY_PERF_TAG_PREFETCH_COMPLETE = "[delivery-prefetch-complete]" as const;
export const DELIVERY_PERF_TAG_PREFETCH_SKIPPED = "[delivery-prefetch-skipped]" as const;
export const DELIVERY_PERF_TAG_PREFETCH_SINGLE_FLIGHT =
  "[delivery-prefetch-single-flight]" as const;
export const DELIVERY_PERF_TAG_PREFETCH_AGE_MS = "[delivery-prefetch-age-ms]" as const;
export const DELIVERY_PERF_TAG_PREFETCH_INFLIGHT =
  "[delivery-prefetch-inflight-before-tap]" as const;
export const DELIVERY_PERF_TAG_SUMMARY_PREWARM_REQUEST =
  "[delivery-summary-prewarm-request]" as const;
export const DELIVERY_PERF_TAG_SUMMARY_PREWARM_COMPLETE =
  "[delivery-summary-prewarm-complete]" as const;
export const DELIVERY_PERF_TAG_SUMMARY_PREWARM_HIT =
  "[delivery-summary-prewarm-hit-before-tap]" as const;
export const DELIVERY_PERF_TAG_SUMMARY_PREWARM_DURATION_MS =
  "[delivery-summary-prewarm-duration-ms]" as const;

export type DeliveryPerfTraceTag =
  | typeof DELIVERY_PERF_TAG_STORE_ENTRY
  | typeof DELIVERY_PERF_TAG_MENU_PASS
  | typeof DELIVERY_PERF_TAG_OPTION_SHEET
  | typeof DELIVERY_PERF_TAG_OPTION_SHEET_OPEN_MS
  | typeof DELIVERY_PERF_TAG_OPTION_SELECT_MS
  | typeof DELIVERY_PERF_TAG_OPTION_PRICE_PATCH_MS
  | typeof DELIVERY_PERF_TAG_OPTION_VALIDATION_MS
  | typeof DELIVERY_PERF_TAG_OPTION_ADD_SUBMIT_MS
  | typeof DELIVERY_PERF_TAG_CART_PATCH
  | typeof DELIVERY_PERF_TAG_CHECKOUT
  | typeof DELIVERY_PERF_TAG_ROUTE_TRANSITION
  | typeof DELIVERY_PERF_TAG_RENDER_WALL
  | typeof DELIVERY_PERF_TAG_LONGTASK
  | typeof DELIVERY_PERF_TAG_SUBTREE_STABILITY
  | typeof DELIVERY_PERF_TAG_IMAGE_PIPELINE
  | typeof DELIVERY_PERF_TAG_CART_RERENDER
  | typeof DELIVERY_PERF_TAG_DETAIL_RERENDER
  | typeof DELIVERY_PERF_TAG_SHEET_RERENDER
  | typeof DELIVERY_PERF_TAG_SHEET_OPEN_MS
  | typeof DELIVERY_PERF_TAG_SHEET_HYDRATE_MS
  | typeof DELIVERY_PERF_TAG_CART_OPTIMISTIC_MS
  | typeof DELIVERY_PERF_TAG_CART_QTY_PATCH_MS
  | typeof DELIVERY_PERF_TAG_CART_DELETE_MS
  | typeof DELIVERY_PERF_TAG_CART_CONFLICT_OPEN_MS
  | typeof DELIVERY_PERF_TAG_CART_SUBTREE_IMPACT
  | typeof DELIVERY_PERF_TAG_MENU_SUBTREE_STABILITY
  | typeof DELIVERY_PERF_TAG_TOAST_RERENDER
  | typeof DELIVERY_PERF_TAG_TOAST_OPEN_MS
  | typeof DELIVERY_PERF_TAG_CART_PREVIEW_OPEN_MS
  | typeof DELIVERY_PERF_TAG_CART_PREVIEW_RERENDER
  | typeof DELIVERY_PERF_TAG_LIST_SCROLL_SAVE
  | typeof DELIVERY_PERF_TAG_LIST_SCROLL_RESTORE
  | typeof DELIVERY_PERF_TAG_LIST_SCROLL_RESTORE_MS
  | typeof DELIVERY_PERF_TAG_SEED_SUMMARY_PATCH
  | typeof DELIVERY_PERF_TAG_SEED_SUMMARY_PATCH_MS
  | typeof DELIVERY_PERF_TAG_HERO_LAYOUT
  | typeof DELIVERY_PERF_TAG_MENU_DEFERRED_HYDRATE
  | typeof DELIVERY_PERF_TAG_MENU_FETCH_START
  | typeof DELIVERY_PERF_TAG_MENU_FETCH_COMPLETE
  | typeof DELIVERY_PERF_TAG_MENU_NORMALIZE_MS
  | typeof DELIVERY_PERF_TAG_MENU_FIRST_SECTION_READY
  | typeof DELIVERY_PERF_TAG_MENU_FIRST_VISIBLE
  | typeof DELIVERY_PERF_TAG_MENU_VISIBLE_BREAKDOWN
  | typeof DELIVERY_PERF_TAG_MENU_NORMALIZE_BREAKDOWN
  | typeof DELIVERY_PERF_TAG_MENU_NORMALIZE_CHUNK
  | typeof DELIVERY_PERF_TAG_MENU_DEFERRED_NORMALIZE_COMPLETE
  | typeof DELIVERY_PERF_TAG_CHECKOUT_SHELL
  | typeof DELIVERY_PERF_TAG_CARD_TAP
  | typeof DELIVERY_PERF_TAG_ROUTER_PUSH_START
  | typeof DELIVERY_PERF_TAG_ROUTE_LAYOUT_ENTER
  | typeof DELIVERY_PERF_TAG_DETAIL_PAGE_ENTER
  | typeof DELIVERY_PERF_TAG_DETAIL_CLIENT_MOUNT_START
  | typeof DELIVERY_PERF_TAG_DETAIL_SHELL_RENDERED
  | typeof DELIVERY_PERF_TAG_DETAIL_SHELL_VISIBLE
  | typeof DELIVERY_PERF_TAG_DETAIL_SHELL_PERCEIVED_VISIBLE
  | typeof DELIVERY_PERF_TAG_SHELL_ENTRY_BREAKDOWN
  | typeof DELIVERY_PERF_TAG_PREFETCH_REQUEST
  | typeof DELIVERY_PERF_TAG_PREFETCH_HIT
  | typeof DELIVERY_PERF_TAG_PREFETCH_MISS
  | typeof DELIVERY_PERF_TAG_PREFETCH_COMPLETE
  | typeof DELIVERY_PERF_TAG_PREFETCH_SKIPPED
  | typeof DELIVERY_PERF_TAG_PREFETCH_SINGLE_FLIGHT
  | typeof DELIVERY_PERF_TAG_PREFETCH_AGE_MS
  | typeof DELIVERY_PERF_TAG_PREFETCH_INFLIGHT
  | typeof DELIVERY_PERF_TAG_SUMMARY_PREWARM_REQUEST
  | typeof DELIVERY_PERF_TAG_SUMMARY_PREWARM_COMPLETE
  | typeof DELIVERY_PERF_TAG_SUMMARY_PREWARM_HIT
  | typeof DELIVERY_PERF_TAG_SUMMARY_PREWARM_DURATION_MS;

const DEDUPE_MS = 2_000;
const dedupeAt = new Map<string, number>();

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function deliveryPerfTraceEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.NEXT_PUBLIC_DIBAY_DELIVERY_PERF_TRACE === "1";
}

function routeNow(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname || "";
}

function dedupeKey(tag: DeliveryPerfTraceTag, eventKey: string): string {
  return `${tag}::${eventKey}`;
}

export function deliveryPerfTraceLog(
  tag: DeliveryPerfTraceTag,
  payload: Record<string, unknown> & { event: string }
): void {
  if (!deliveryPerfTraceEnabled()) return;
  if (typeof console === "undefined" || typeof console.debug !== "function") return;

  const eventKey =
    String(payload.event_key ?? "").trim() || String(payload.event ?? "").trim() || "unknown";
  const dk = dedupeKey(tag, eventKey);
  const now = perfNow();
  const last = dedupeAt.get(dk) ?? 0;
  if (now - last < DEDUPE_MS) return;
  dedupeAt.set(dk, now);

  console.debug(tag, {
    ...payload,
    route: routeNow(),
    wall_ms: Math.round(now),
    timestamp: Date.now(),
  });
}

/** 테스트·세션 리셋 */
export function resetDeliveryPerfTraceDedupeForTests(): void {
  dedupeAt.clear();
}
