/**
 * Admin point-charge exact deeplinks — P0-B awareness CTA SSOT.
 *
 * DO NOT deep-link to list hubs without request identity.
 * Member detail route already exists; store charges use list + ?request= focus.
 */

export function adminMemberPointChargeDetailHref(requestId: string): string {
  const id = String(requestId ?? "").trim();
  if (!id) return "/admin/point-charges";
  return `/admin/point-charges/${encodeURIComponent(id)}`;
}

export function adminStorePointChargeFocusHref(requestId: string): string {
  const id = String(requestId ?? "").trim();
  if (!id) return "/admin/store-point-charges";
  return `/admin/store-point-charges?request=${encodeURIComponent(id)}`;
}

export function parseAdminStorePointChargeFocusRequestId(
  searchParams: URLSearchParams | { get(name: string): string | null }
): string {
  return String(searchParams.get("request") ?? "").trim();
}
