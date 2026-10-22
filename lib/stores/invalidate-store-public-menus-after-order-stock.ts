import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { invalidateStoreMenusSnapshotCacheByStoreId } from "@/lib/stores/store-menus-snapshot-invalidate-by-store-id";
import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation";

/**
 * CRT-07 — 주문으로 재고 0 자동 품절 / 취소·환불로 재고 복원(→ 판매 재개) 된 뒤
 * 소비자 메뉴 캐시를 오너·관리자 상품 쓰기와 **같은 경로**로 무효화한다.
 * (`invalidateStoreMenusSnapshotCacheByStoreId` + DEF-64 인스턴스 공통 세대 bump)
 * 재고·품절 판정 자체는 RPC(SQL) 가 한다 — 여기서는 캐시만 비운다.
 */
export function invalidateStorePublicMenusAfterOrderStockChange(storeId: string, reason: string): void {
  const sid = storeId.trim();
  if (!sid) return;
  invalidateStoreMenusSnapshotCacheByStoreId(sid);
  bumpStorePublicSharedCacheGeneration(reason);
}

/** 재고 복원 RPC 는 order_id 만 받으므로 매장 id 를 조회한 뒤 무효화 (응답 경로 비차단). */
export function invalidateStorePublicMenusAfterOrderStockRestore(sb: SupabaseClient, orderId: string): void {
  void (async () => {
    const { data, error } = await sb.from("store_orders").select("store_id").eq("id", orderId).maybeSingle();
    if (error) {
      console.error("[invalidateStorePublicMenusAfterOrderStockRestore] store lookup", error.message);
      return;
    }
    const storeId = String((data as { store_id?: unknown } | null)?.store_id ?? "").trim();
    if (storeId) invalidateStorePublicMenusAfterOrderStockChange(storeId, "store_menus_stock.restore");
  })().catch((e: unknown) => {
    console.error("[invalidateStorePublicMenusAfterOrderStockRestore]", e);
  });
}
