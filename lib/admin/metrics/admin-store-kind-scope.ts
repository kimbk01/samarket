/**
 * 묶음 4 · S-12 / DB-2 — 관리자 매출·주문 집계의 매장 유형 범위.
 * 기본 = 실매장(`stores.store_kind = 'real'`)만. 「테스트 포함 보기」 = 전 매장(legacy_test·sample 포함, 기존 집계).
 * SQL 집계(`admin_delivery_operations_dashboard`)는 `p_include_test` 인자로, 수수료 SSOT 조회는
 * 실매장 id 목록(`p_store_ids`)으로 같은 범위를 적용한다 — SSOT 함수 자체는 바꾸지 않는다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const ADMIN_INCLUDE_TEST_STORES_PARAM = "include_test";
export const ADMIN_REAL_STORE_KIND = "real";

/** `?include_test=1|true` 만 테스트 포함. 그 외(미전송 포함) = 실매장만. */
export function parseAdminIncludeTestStores(raw: string | null | undefined): boolean {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}

/** 실매장 id 전체 (PostgREST 응답 상한과 무관하게 끝까지). 실패 = null (호출부가 「확인 불가」 처리). */
export async function loadAdminRealStoreIds(sb: SupabaseClient): Promise<string[] | null> {
  const ids: string[] = [];
  const step = 1000;
  for (let from = 0; ; from += step) {
    const { data, error } = await sb
      .from("stores")
      .select("id")
      .eq("store_kind", ADMIN_REAL_STORE_KIND)
      .order("id", { ascending: true })
      .range(from, from + step - 1);
    if (error) {
      console.error("[admin-store-kind-scope] real store ids", error.message);
      return null;
    }
    const batch = (data ?? []) as { id?: unknown }[];
    for (const r of batch) {
      const id = String(r.id ?? "").trim();
      if (id) ids.push(id);
    }
    if (batch.length < step) return ids;
  }
}
