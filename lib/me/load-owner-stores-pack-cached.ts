import { cache } from "react";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadMeStoresListForUser } from "@/lib/me/load-me-stores-for-user";
import type { StoreRow } from "@/lib/stores/db-store-mapper";

export type OwnerStoresPackResult =
  | { ok: true; stores: StoreRow[] }
  | { ok: false; error: string }
  | { ok: false; kind: "unauth" }
  | { ok: false; kind: "config" };

/**
 * 매장 오너 세그먼트 RSC·레이아웃·`loadMyBusinessServer` 가 **동일 요청 내** 공유하는 단일 비행.
 * (`loadMeStoresListForUser` 내부 서버 캐시와 별개 — React `cache` 로 RSC 중복 호출 제거)
 */
export const loadOwnerStoresPackCached = cache(async (): Promise<OwnerStoresPackResult> => {
  const userId = await getRouteUserId();
  if (!userId) return { ok: false, kind: "unauth" };
  const supabase = tryGetSupabaseForStores();
  if (!supabase) return { ok: false, kind: "config" };
  const pack = await loadMeStoresListForUser(supabase, userId);
  if (!pack.ok) return { ok: false, error: pack.error };
  return { ok: true, stores: pack.stores };
});
