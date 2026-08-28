/**
 * P0-D — Admin ops awareness exact deeplinks (report + store apply).
 */

export function resolveAdminTradeReportHref(reportId: string): string {
  const id = String(reportId ?? "").trim();
  if (!id) return "/admin/reports";
  return `/admin/reports/${encodeURIComponent(id)}`;
}

export function resolveAdminCommunityReportHref(reportId: string): string {
  const id = String(reportId ?? "").trim();
  if (!id) return "/admin/community/reports";
  return `/admin/community/reports?rid=${encodeURIComponent(id)}`;
}

export function resolveAdminStoreReportHref(reportId: string): string {
  const id = String(reportId ?? "").trim();
  if (!id) return "/admin/store-reports";
  return `/admin/store-reports?request=${encodeURIComponent(id)}`;
}

export function parseAdminStoreReportFocusRequestId(
  searchParams: URLSearchParams | { get(name: string): string | null }
): string {
  return String(searchParams.get("request") ?? "").trim();
}

export function resolveAdminStoreApplicationHref(storeId: string): string {
  const id = String(storeId ?? "").trim();
  if (!id) return "/admin/stores";
  return `/admin/business/${encodeURIComponent(id)}`;
}
