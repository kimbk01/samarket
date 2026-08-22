"use client";

/**
 * 배달 목록 → 매장 상세 → 뒤로가기 시 스크롤 위치 복원.
 * - 저장: 목록에서 매장 카드 탭 직전
 * - 복원: popstate/back 으로 동일 routeKey 목록에 재진입할 때만
 */

import {
  deliveryPerfTraceLog,
  DELIVERY_PERF_TAG_LIST_SCROLL_RESTORE,
  DELIVERY_PERF_TAG_LIST_SCROLL_RESTORE_MS,
  DELIVERY_PERF_TAG_LIST_SCROLL_SAVE,
} from "@/lib/dibay/delivery-perf-trace";
import {
  getMainAppScrollRoot,
  getMainAppScrollTop,
  setMainAppScrollTop,
} from "@/lib/layout/main-app-scroll-root";

const KEY_PREFIX_SCROLL = "dibay:delivery-list-scroll:";
const KEY_POPSTATE_PENDING = "dibay:delivery-list-scroll-popstate-pending";
const TTL_MS = 45_000;

export function buildDeliveryListScrollRouteKey(pathname: string, search?: string): string {
  const p = (pathname || "").split("?")[0] || "/";
  const q = (search ?? "").replace(/^\?/, "").trim();
  return q ? `${p}?${q}` : p;
}

export function getCurrentDeliveryListScrollRouteKey(): string {
  if (typeof window === "undefined") return "/stores";
  return buildDeliveryListScrollRouteKey(
    window.location.pathname || "/stores",
    window.location.search || ""
  );
}

export function isDeliveryListScrollRoute(routeKey: string): boolean {
  const path = (routeKey || "").split("?")[0] ?? "";
  if (path === "/stores" || path === "/stores/search") return true;
  return /^\/stores\/browse\/[^/]+$/.test(path);
}

/** 소비자 매장 상세·하위 경로(`/stores/:slug`, cart 등) — 목록 browse/search/owner 제외 */
export function isStoreConsumerDetailPath(pathname: string): boolean {
  const path = (pathname || "").split("?")[0] ?? "";
  if (!path.startsWith("/stores/")) return false;
  if (isDeliveryListScrollRoute(path)) return false;
  if (path === "/stores/search" || path.startsWith("/stores/owner")) return false;
  const parts = path.split("/").filter(Boolean);
  return parts[0] === "stores" && parts.length >= 2;
}

let manualScrollRestorationApplied = false;

/** Next·브라우저 기본 scroll restoration 과 custom 복원 충돌 방지 */
export function ensureDeliveryListManualScrollRestoration(): void {
  if (typeof window === "undefined" || manualScrollRestorationApplied) return;
  try {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    manualScrollRestorationApplied = true;
  } catch {
    /* ignore */
  }
}

function scrollStorageKey(routeKey: string): string {
  return KEY_PREFIX_SCROLL + routeKey;
}

function readSavedScrollY(routeKey: string): number | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(scrollStorageKey(routeKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { y?: number; saved_at?: number };
    if (!parsed?.saved_at || parsed.saved_at + TTL_MS < Date.now()) {
      sessionStorage.removeItem(scrollStorageKey(routeKey));
      return null;
    }
    const y = Math.max(0, Math.round(Number(parsed.y) || 0));
    return y;
  } catch {
    return null;
  }
}

export function saveDeliveryListScrollBeforeStoreNavigation(routeKey?: string): void {
  if (typeof window === "undefined") return;
  const key = (routeKey ?? getCurrentDeliveryListScrollRouteKey()).trim();
  if (!isDeliveryListScrollRoute(key)) return;

  const y = Math.max(0, Math.round(getMainAppScrollTop()));
  try {
    sessionStorage.setItem(
      scrollStorageKey(key),
      JSON.stringify({ y, saved_at: Date.now() })
    );
  } catch {
    /* quota */
  }

  deliveryPerfTraceLog(DELIVERY_PERF_TAG_LIST_SCROLL_SAVE, {
    event: "list_scroll_save",
    route_key: key,
    scroll_y: y,
  });
}

export function noteDeliveryListScrollPopstatePending(routeKey: string): void {
  if (typeof sessionStorage === "undefined") return;
  const key = routeKey.trim();
  if (!isDeliveryListScrollRoute(key)) return;
  try {
    sessionStorage.setItem(KEY_POPSTATE_PENDING, key);
  } catch {
    /* quota */
  }
}

function isBackForwardNavigation(): boolean {
  if (typeof performance === "undefined") return false;
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return nav?.type === "back_forward";
}

export function consumeDeliveryListScrollPopstatePending(routeKey: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  const key = routeKey.trim();
  try {
    const pending = sessionStorage.getItem(KEY_POPSTATE_PENDING);
    if (pending === key) {
      sessionStorage.removeItem(KEY_POPSTATE_PENDING);
      return true;
    }
    if (isBackForwardNavigation() && readSavedScrollY(key) != null) {
      if (pending) sessionStorage.removeItem(KEY_POPSTATE_PENDING);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * App Router soft back: layout 이 popstate 보다 먼저 목록을 그릴 때 pending 설정.
 * (StoresDeliveryLayoutShell render phase)
 */
export function noteDeliveryListScrollBackFromStoreDetail(routeKey?: string): void {
  const key = (routeKey ?? getCurrentDeliveryListScrollRouteKey()).trim();
  if (!isDeliveryListScrollRoute(key)) return;
  noteDeliveryListScrollPopstatePending(key);
}

export function restoreDeliveryListScrollY(
  targetY: number,
  opts?: { maxAttempts?: number }
): void {
  if (typeof window === "undefined") return;
  const maxAttempts = opts?.maxAttempts ?? 24;
  let attempts = 0;

  const tryOnce = () => {
    const root = getMainAppScrollRoot();
    const maxScroll = Math.max(0, root.scrollHeight - root.clientHeight);
    const y = Math.min(targetY, maxScroll);
    setMainAppScrollTop(y, { behavior: "auto", scrollRoot: root });
    attempts += 1;
    if (attempts < maxAttempts && y < targetY && maxScroll < targetY - 8) {
      requestAnimationFrame(tryOnce);
    }
  };

  tryOnce();
}

export type DeliveryListScrollRestoreResult = {
  restored: boolean;
  scroll_y: number;
  restore_ms: number;
};

export function tryRestoreDeliveryListScroll(routeKey: string): DeliveryListScrollRestoreResult {
  const key = routeKey.trim();
  const empty: DeliveryListScrollRestoreResult = { restored: false, scroll_y: 0, restore_ms: 0 };

  if (!isDeliveryListScrollRoute(key)) return empty;
  if (!consumeDeliveryListScrollPopstatePending(key)) return empty;

  const scrollY = readSavedScrollY(key);
  if (scrollY == null) return empty;

  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  restoreDeliveryListScrollY(scrollY);
  const restoreMs = Math.round(
    (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0
  );

  deliveryPerfTraceLog(DELIVERY_PERF_TAG_LIST_SCROLL_RESTORE, {
    event: "list_scroll_restore",
    route_key: key,
    scroll_y: scrollY,
  });
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_LIST_SCROLL_RESTORE_MS, {
    event: "list_scroll_restore_ms",
    route_key: key,
    scroll_y: scrollY,
    restore_ms: restoreMs,
  });

  return { restored: true, scroll_y: scrollY, restore_ms: restoreMs };
}

/** 테스트·세션 리셋 */
export function resetDeliveryListScrollRestoreForTests(): void {
  if (typeof sessionStorage === "undefined") return;
  manualScrollRestorationApplied = false;
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(KEY_PREFIX_SCROLL) || k === KEY_POPSTATE_PENDING) keys.push(k);
  }
  for (const k of keys) sessionStorage.removeItem(k);
}
