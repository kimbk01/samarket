import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 묶음3-A S-01·S-03 — 「메뉴 공개」와 「판매 가능(canSell)」 분리.
 *
 * - 메뉴 공개 SSOT = DB `public.store_public_menu_open(p_store_id)` (판매 승인 OR 샘플 매장).
 *   마이그레이션 `20270707130100_store_public_menu_open_sample.sql`. TS 는 이 RPC 1개만 쓴다.
 * - 판매 가능(canSell) = `store_sales_permissions` 승인 — **주문(CTA·결제)에만** 사용.
 *   샘플 매장은 메뉴 공개 · 주문 불가 (DB `create_store_order_atomic` / TS `store_not_selling` 유지).
 */
export const STORE_KIND_SAMPLE = "sample" as const;

/** `stores.store_kind` → 샘플 매장 여부 (공개 응답에는 boolean `isSampleStore` 만 싣는다). */
export function isSampleStoreKind(storeKind: unknown): boolean {
  return typeof storeKind === "string" && storeKind.trim() === STORE_KIND_SAMPLE;
}

/** 메뉴 공개 여부 — RPC 오류 시 fail-closed(false: 메뉴 비공개, 기존 판매 미승인과 같은 화면). */
export async function loadStorePublicMenuOpen(
  sb: SupabaseClient,
  storeId: string
): Promise<boolean> {
  const id = String(storeId ?? "").trim();
  if (!id) return false;
  const { data, error } = await sb.rpc("store_public_menu_open", { p_store_id: id });
  if (error) {
    console.error("[store_public_menu_open]", error.message);
    return false;
  }
  return data === true;
}
