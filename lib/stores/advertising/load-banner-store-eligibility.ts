/**
 * ADS-06 — 배너 노출 매장 자격 (홈 히어로 · 물리 인벤토리).
 * 검색상단 배너가 오가닉 풀(approved · is_visible)로 fail-closed 하는 것과 같은 기준:
 * `stores.approval_status = 'approved' AND is_visible = true` 인 매장만 노출 대상.
 * 조회 오류 → 빈 집합(fail-closed: 매장 연결 배너 미노출, 매장 없는 플랫폼 배너는 영향 없음).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CUSTOMER_HIDDEN_STORE_KIND } from "@/lib/stores/store-customer-visibility";

export async function loadEligibleBannerStoreIds(
  sb: SupabaseClient,
  storeIds: readonly (string | null | undefined)[]
): Promise<Set<string>> {
  return (await loadEligibleBannerStoresWithKind(sb, storeIds)).eligible;
}

/**
 * 같은 1회 조회로 샘플(체험용) 매장 집합도 돌려준다 — 「샘플 광고」 라벨 (2026-10-28 §F S-6).
 * 샘플 여부는 목적지 매장 `store_kind` 에서만 파생 (광고 테이블에 별도 플래그 없음).
 */
export async function loadEligibleBannerStoresWithKind(
  sb: SupabaseClient,
  storeIds: readonly (string | null | undefined)[]
): Promise<{ eligible: Set<string>; sample: Set<string> }> {
  const ids = [...new Set(storeIds.map((s) => String(s ?? "").trim()).filter(Boolean))];
  const out = new Set<string>();
  const sample = new Set<string>();
  if (!ids.length) return { eligible: out, sample };
  try {
    const { data, error } = await sb
      .from("stores")
      .select("id, store_kind")
      .in("id", ids)
      .eq("approval_status", "approved")
      .eq("is_visible", true)
      .neq("store_kind", CUSTOMER_HIDDEN_STORE_KIND);
    if (error) {
      console.error("[loadEligibleBannerStoreIds]", error.message);
      return { eligible: out, sample };
    }
    for (const row of data ?? []) {
      const id = String((row as { id?: unknown }).id ?? "").trim();
      if (!id) continue;
      out.add(id);
      if ((row as { store_kind?: unknown }).store_kind === "sample") sample.add(id);
    }
  } catch (e) {
    console.error("[loadEligibleBannerStoreIds]", e instanceof Error ? e.message : e);
  }
  return { eligible: out, sample };
}

/**
 * 매장 연결 배너는 자격 집합에 있어야 노출. 매장 없는 배너(플랫폼·퍼스트파티)는 대상 아님.
 * `eligibleStoreIds` 미전달(순수 평가 호출)은 기존 동작 유지 — 로더는 항상 전달한다.
 */
export function isBannerStoreEligible(
  storeId: string | null | undefined,
  eligibleStoreIds: ReadonlySet<string> | null | undefined
): boolean {
  const id = String(storeId ?? "").trim();
  if (!id) return true;
  if (!eligibleStoreIds) return true;
  return eligibleStoreIds.has(id);
}
