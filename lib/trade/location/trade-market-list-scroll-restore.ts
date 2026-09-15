/**
 * Marketplace /market list → detail → back scroll restore.
 * Mirrors delivery list scroll restore pattern; does not change URL/filter authority.
 */
import {
  getMainAppScrollTop,
  setMainAppScrollTop,
} from "@/lib/layout/main-app-scroll-root";

const KEY_PREFIX = "samarket:trade-market-list-scroll:v1:";
const KEY_PENDING = "samarket:trade-market-list-scroll-popstate:v1";
const KEY_SELECTED = "samarket:trade-market-list-selected:v1";
const TTL_MS = 120_000;

export function buildTradeMarketListScrollRouteKey(pathname: string, search?: string): string {
  const p = (pathname || "").split("?")[0] || "/market";
  const q = (search ?? "").replace(/^\?/, "").trim();
  return q ? `${p}?${q}` : p;
}

export function isTradeMarketListScrollRoute(routeKey: string): boolean {
  const path = (routeKey || "").split("?")[0] ?? "";
  if (path === "/market") return true;
  if (
    path.startsWith("/market/location") ||
    path.startsWith("/market/sell") ||
    path.startsWith("/market/trade-meet-spot")
  ) {
    return false;
  }
  return /^\/market\/[^/]+$/.test(path);
}

function scrollStorageKey(routeKey: string): string {
  return KEY_PREFIX + routeKey;
}

export function saveTradeMarketListScroll(routeKey: string, scrollY?: number): void {
  if (typeof sessionStorage === "undefined") return;
  if (!isTradeMarketListScrollRoute(routeKey)) return;
  const y =
    typeof scrollY === "number" && Number.isFinite(scrollY)
      ? Math.max(0, Math.round(scrollY))
      : Math.max(0, Math.round(getMainAppScrollTop()));
  try {
    sessionStorage.setItem(
      scrollStorageKey(routeKey),
      JSON.stringify({ y, saved_at: Date.now() })
    );
  } catch {
    /* quota */
  }
}

export function rememberTradeMarketSelectedListing(postId: string, routeKey: string): void {
  if (typeof sessionStorage === "undefined") return;
  const id = postId.trim();
  if (!id) return;
  try {
    sessionStorage.setItem(
      KEY_SELECTED,
      JSON.stringify({ id, routeKey, saved_at: Date.now() })
    );
  } catch {
    /* quota */
  }
}

export function peekTradeMarketSelectedListing(
  routeKey: string
): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY_SELECTED);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string; routeKey?: string; saved_at?: number };
    if (!parsed?.saved_at || parsed.saved_at + TTL_MS < Date.now()) {
      sessionStorage.removeItem(KEY_SELECTED);
      return null;
    }
    if ((parsed.routeKey ?? "") !== routeKey) return null;
    return typeof parsed.id === "string" && parsed.id.trim() ? parsed.id.trim() : null;
  } catch {
    return null;
  }
}

export function clearTradeMarketSelectedListing(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(KEY_SELECTED);
  } catch {
    /* ignore */
  }
}

export function noteTradeMarketListScrollPopstatePending(routeKey: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(KEY_PENDING, JSON.stringify({ routeKey, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

function consumePopstatePending(routeKey: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(KEY_PENDING);
    if (!raw) return false;
    sessionStorage.removeItem(KEY_PENDING);
    const parsed = JSON.parse(raw) as { routeKey?: string; at?: number };
    if (!parsed?.at || parsed.at + TTL_MS < Date.now()) return false;
    return (parsed.routeKey ?? "") === routeKey;
  } catch {
    return false;
  }
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
    if (typeof parsed.y !== "number" || !Number.isFinite(parsed.y)) return null;
    return Math.max(0, Math.round(parsed.y));
  } catch {
    return null;
  }
}

let manualScrollRestorationApplied = false;

export function ensureTradeMarketListManualScrollRestoration(): void {
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

/**
 * Restore scroll when returning to the same browse URL.
 * Detail back often uses remembered href (not popstate) — restore whenever saved Y exists.
 */
export function tryRestoreTradeMarketListScroll(routeKey: string): boolean {
  if (typeof window === "undefined") return false;
  if (!isTradeMarketListScrollRoute(routeKey)) return false;
  void consumePopstatePending(routeKey);
  const y = readSavedScrollY(routeKey);
  if (y == null) return false;
  ensureTradeMarketListManualScrollRestoration();
  setMainAppScrollTop(y);
  requestAnimationFrame(() => setMainAppScrollTop(y));
  return true;
}

/** Call immediately before navigating list → /post/[id]. */
export function prepareTradeMarketListToDetailNavigation(input: {
  routeKey: string;
  postId: string;
}): void {
  saveTradeMarketListScroll(input.routeKey);
  rememberTradeMarketSelectedListing(input.postId, input.routeKey);
  noteTradeMarketListScrollPopstatePending(input.routeKey);
}
