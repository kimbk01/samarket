/**
 * 클라이언트 목록 캐시 무효화 — 동일 storeId 연속 호출 합류(알림·RT INSERT 겹침).
 */
import { invalidateOwnerStoreOrdersListCache } from "@/lib/stores/owner-store-orders-list-cache";

const pendingByStore = new Map<string, ReturnType<typeof setTimeout>>();

const COALESCE_MS = 80;

export function invalidateOwnerStoreOrdersListCacheCoalesced(
  storeId: string,
  logOpts?: Parameters<typeof invalidateOwnerStoreOrdersListCache>[2]
): void {
  const sid = storeId.trim();
  if (!sid) return;
  const prev = pendingByStore.get(sid);
  if (prev != null) clearTimeout(prev);
  pendingByStore.set(
    sid,
    setTimeout(() => {
      pendingByStore.delete(sid);
      invalidateOwnerStoreOrdersListCache(sid, undefined, logOpts);
    }, COALESCE_MS)
  );
}
