/**
 * `/api/me/stores` 기준 — 내 계정 소유 매장이 1건 이상이면 매장 관리자(오너)로 간주.
 * 플랫폼 관리자(`isAdminUser`)와 별개.
 */
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";

export async function fetchMeHasOwnerStores(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { status, json: raw } = await fetchMeStoresListDeduped();
    if (status === 401) return false;
    const j = raw as { ok?: boolean; stores?: unknown[] };
    return !!(j?.ok && Array.isArray(j.stores) && j.stores.length > 0);
  } catch {
    return false;
  }
}
