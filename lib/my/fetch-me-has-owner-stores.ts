/**
 * `/api/me/stores` 기준 — 내 계정 소유 매장이 1건 이상이면 매장 관리자(오너)로 간주.
 * 플랫폼 관리자(`isAdminUser`)와 별개.
 */
export async function fetchMeHasOwnerStores(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const res = await fetch("/api/me/stores", { credentials: "include" });
    if (res.status === 401) return false;
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; stores?: unknown[] };
    return !!(j?.ok && Array.isArray(j.stores) && j.stores.length > 0);
  } catch {
    return false;
  }
}
