/**
 * Platform Popup critical operation path gates — separate from advertising surfaces.
 * ADMIN / DELIVERY_OWNER may show popups on general pages; these paths defer.
 */

function normalizePath(pathname: string | null | undefined): string {
  const raw = (pathname ?? "").split("?")[0]!.trim();
  if (!raw) return "/";
  if (raw.length > 1 && raw.endsWith("/")) return raw.slice(0, -1);
  return raw;
}

/** Admin: finance / settlement / point money ops / dangerous execution. */
const ADMIN_CRITICAL_PREFIXES = [
  "/admin/finance",
  "/admin/store-settlements",
  "/admin/store-point-ledger",
  "/admin/point-charges",
  "/admin/points/ledger",
  "/admin/point-plans",
  "/admin/point-policies",
  "/admin/point-executions",
  "/admin/points/expire",
  "/admin/community/point-policies",
] as const;

/**
 * Delivery Owner transactional / money paths (canonical /stores/owner/* + legacy).
 * Order list itself is not critical; order detail / accept flows use ORDER_CRITICAL via flags or chat/order paths.
 */
const OWNER_CRITICAL_PREFIXES = [
  "/stores/owner/finance",
  "/stores/owner/settlements",
  "/stores/owner/ads",
  "/my/business/finance",
  "/my/business/settlements",
  "/my/business/ads",
  "/mypage/business/finance",
  "/mypage/business/settlements",
] as const;

function matchesPrefix(path: string, prefixes: readonly string[]): boolean {
  for (const prefix of prefixes) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

/** True when pathname is Admin money / settlement / point execution surface. */
export function isPlatformPopupAdminCriticalPath(pathname: string | null | undefined): boolean {
  const p = normalizePath(pathname);
  return matchesPrefix(p, ADMIN_CRITICAL_PREFIXES);
}

/**
 * True when Delivery Owner path is finance / settlements / ads (Business Cash) flow.
 * Order accept/reject transactional UI should also set paymentCritical / orderSubmitCritical flags.
 */
export function isPlatformPopupOwnerCriticalPath(pathname: string | null | undefined): boolean {
  const p = normalizePath(pathname);
  if (matchesPrefix(p, OWNER_CRITICAL_PREFIXES)) return true;
  // Owner order detail / order-chat: transactional
  if (p.startsWith("/stores/owner/order-chat/")) return true;
  if (/^\/stores\/[^/]+\/owner\/orders(\/|$)/.test(p) && p !== "/stores/owner/orders") {
    // slug-scoped owner order ops — treat as critical when deeper than list
    if (p.includes("/orders/")) return true;
  }
  return false;
}

/**
 * Path-level critical → map into excluded surface bucket for resolveDibaySurface.
 * Prefer PAYMENT for finance/settlement/ads cash; ORDER_CRITICAL for order transactional paths.
 */
export function resolvePlatformPopupPathCriticalSurface(
  pathname: string | null | undefined
): "PAYMENT" | "ORDER_CRITICAL" | null {
  const p = normalizePath(pathname);
  if (isPlatformPopupAdminCriticalPath(p)) return "PAYMENT";
  if (p.startsWith("/stores/owner/order-chat/") || /\/owner\/orders\//.test(p)) {
    return "ORDER_CRITICAL";
  }
  if (isPlatformPopupOwnerCriticalPath(p)) return "PAYMENT";
  return null;
}
