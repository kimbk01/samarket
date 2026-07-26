import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { pickPreferredOwnerStore } from "@/lib/delivery/owner/pick-preferred-owner-store";

/**
 * `GET /api/me/stores` 목록에서 URL `storeId` 와 일치하는 매장을 고른다.
 * 없으면 승인·노출 우선 규칙(`pickPreferredOwnerStore`) → 첫 매장.
 */
export function pickOwnerStoreFromMeList<T extends { id: string }>(
  stores: T[],
  preferredStoreId: string | null | undefined
): T | null {
  if (stores.length === 0) return null;
  const preferred = (preferredStoreId ?? "").trim();
  if (preferred) {
    const hit = stores.find((s) => s.id === preferred);
    if (hit) return hit;
  }
  const fallback = pickPreferredOwnerStore(stores as unknown as StoreRow[]);
  return (fallback as T | null) ?? stores[0] ?? null;
}
