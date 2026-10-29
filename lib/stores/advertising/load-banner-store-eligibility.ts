/**
 * ADS-06 — 배너 노출 매장 자격 (홈 히어로 · 물리 인벤토리).
 * 검색상단 배너가 오가닉 풀(approved · is_visible)로 fail-closed 하는 것과 같은 기준:
 * `stores.approval_status = 'approved' AND is_visible = true` 인 매장만 노출 대상.
 * 조회 오류 → 빈 집합(fail-closed: 매장 연결 배너 미노출, 매장 없는 플랫폼 배너는 영향 없음).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadEligibleBannerStoreIds(
  sb: SupabaseClient,
  storeIds: readonly (string | null | undefined)[]
): Promise<Set<string>> {
  const ids = [...new Set(storeIds.map((s) => String(s ?? "").trim()).filter(Boolean))];
  const out = new Set<string>();
  if (!ids.length) return out;
  try {
    const { data, error } = await sb
      .from("stores")
      .select("id")
      .in("id", ids)
      .eq("approval_status", "approved")
      .eq("is_visible", true);
    if (error) {
      console.error("[loadEligibleBannerStoreIds]", error.message);
      return out;
    }
    for (const row of data ?? []) {
      const id = String((row as { id?: unknown }).id ?? "").trim();
      if (id) out.add(id);
    }
  } catch (e) {
    console.error("[loadEligibleBannerStoreIds]", e instanceof Error ? e.message : e);
  }
  return out;
}

export type BannerStoreEligibilityRow = {
  id: string;
  lat?: unknown;
  lng?: unknown;
  delivery_radius_km?: unknown;
  store_kind?: unknown;
};

/**
 * v4 PERF-14 — 배너 로더용 매장 조회 1회: ADS-06 자격(approved · is_visible) + ADC-04 OOR 판정 좌표 +
 * B-10 샘플 여부를 같은 행에서 얻는다 (기존: 자격·좌표·샘플 stores 조회 3회).
 * 조회 오류 → 빈 결과(fail-closed — `loadEligibleBannerStoreIds` 와 같음).
 */
export async function loadEligibleBannerStoreRows(
  sb: SupabaseClient,
  storeIds: readonly (string | null | undefined)[]
): Promise<{ eligibleStoreIds: Set<string>; rows: BannerStoreEligibilityRow[]; sampleStoreIds: Set<string> }> {
  const ids = [...new Set(storeIds.map((s) => String(s ?? "").trim()).filter(Boolean))];
  const eligibleStoreIds = new Set<string>();
  const sampleStoreIds = new Set<string>();
  const rows: BannerStoreEligibilityRow[] = [];
  if (!ids.length) return { eligibleStoreIds, rows, sampleStoreIds };
  try {
    const { data, error } = await sb
      .from("stores")
      .select("id, lat, lng, delivery_radius_km, store_kind")
      .in("id", ids)
      .eq("approval_status", "approved")
      .eq("is_visible", true);
    if (error) {
      console.error("[loadEligibleBannerStoreRows]", error.message);
      return { eligibleStoreIds, rows, sampleStoreIds };
    }
    for (const raw of data ?? []) {
      const row = raw as BannerStoreEligibilityRow;
      const id = String(row.id ?? "").trim();
      if (!id) continue;
      eligibleStoreIds.add(id);
      rows.push({ ...row, id });
      if (row.store_kind === "sample") sampleStoreIds.add(id);
    }
  } catch (e) {
    console.error("[loadEligibleBannerStoreRows]", e instanceof Error ? e.message : e);
  }
  return { eligibleStoreIds, rows, sampleStoreIds };
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
