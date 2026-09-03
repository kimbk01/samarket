/**
 * Admin point-charge exact deeplinks — P0-B awareness CTA SSOT.
 *
 * Member Point → detail route.
 * Legacy store-point charge focus → Finance hub archive path (NO_NEW_WRITE).
 * Canonical Cash top-ups → `/admin/delivery-ads/cash-charges`.
 */

export function adminMemberPointChargeDetailHref(requestId: string): string {
  const id = String(requestId ?? "").trim();
  if (!id) return "/admin/point-charges";
  return `/admin/point-charges/${encodeURIComponent(id)}`;
}

/** @deprecated Historical AST-002 store credit requests — mutations disabled (410). */
export function adminStorePointChargeFocusHref(requestId: string): string {
  const id = String(requestId ?? "").trim();
  if (!id) return "/admin/store-point-ledger";
  return `/admin/store-point-ledger?request=${encodeURIComponent(id)}`;
}

/** Canonical Cash top-up queue (AST-005). */
export function adminCashTopUpQueueHref(): string {
  return "/admin/delivery-ads/cash-charges";
}

export function parseAdminStorePointChargeFocusRequestId(
  searchParams: URLSearchParams | { get(name: string): string | null }
): string {
  return String(searchParams.get("request") ?? "").trim();
}
