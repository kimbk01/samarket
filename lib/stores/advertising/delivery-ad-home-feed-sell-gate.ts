/**
 * 배달 홈 매장 홍보(STORES_HOME_FEED) 판매 판정 단일 정의 (광고 감사 SA-01 · 2026-11-26).
 *
 * 노출 판정 = 「더 많은 매장」 선반(`rest_stores`)의 광고 연동(`ad_integration`) 하나
 * (`resolveHomeRestPaidSurfaceAllowed` — 고객 화면 삽입과 같은 함수). 꺼져 있으면 돈을 받아도 0회 노출이므로 팔지 않는다.
 * 2026-11-26 운영 DB: `rest_stores.ad_integration = 'off'` 인데 홈 홍보 가격 3개가 판매 중이었다.
 *
 * 쓰는 곳: 사장님 판매 목록 API · 홍보 신청서 만들기 · 제출(요금 기록 직전). 조회 실패 = 팔지 않음(fail-closed).
 * 업종 목록(STORES_CATEGORY_FEED)은 `delivery-ad-category-policy-sell-gate.ts` 가 같은 역할을 한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  homeShelfDbRowsToOverrides,
  listHomeShelfProductDbRows,
} from "@/lib/stores/product/stores-home-shelf-product-db";
import { resolveHomeShelfProductCatalog } from "@/lib/stores/product/stores-home-shelf-product-resolve";
import { resolveHomeRestPaidSurfaceAllowed } from "@/lib/stores/store-paid-ad-exposure";

export const STORES_HOME_FEED_INVENTORY_KEY = "STORES_HOME_FEED" as const;

/**
 * R-22: 판정 본체 — 조회 오류는 던진다. 광고 요금 안내는 이것을 써서 「확인 실패」를 「판매 안 함」과 나눈다.
 * 판매·제출 쪽은 아래 `isStoresHomeFeedSellable`(실패 = 팔지 않음)을 쓴다.
 */
export async function evaluateStoresHomeFeedSellable(sb: SupabaseClient): Promise<boolean> {
  const rows = await listHomeShelfProductDbRows(sb);
  /**
   * R-14 (2026-11-26): 고객 화면과 같은 선반 해석(`resolveHomeShelfProductCatalog`)으로 본다 —
   * ① 「더 많은 매장」 선반이 고객에게 보임(켜짐·일정 안 · `stores-composition-home-section-order.ts` 가 안 보이면 구역째 안 그림)
   * ② 그 선반의 광고 연동(`resolveHomeRestPaidSurfaceAllowed` — 고객 삽입과 같은 함수)
   * ③ 홈 광고 끼우기 최대 수가 0 이 아님(`capItems` 0 이면 끼우지 않음)
   */
  const rest = resolveHomeShelfProductCatalog(homeShelfDbRowsToOverrides(rows)).find((s) => s.shelfId === "rest_stores");
  if (!rest || !rest.customerVisible) return false;
  if (!resolveHomeRestPaidSurfaceAllowed({ restShelfAdIntegration: rest.adIntegration })) return false;
  const maxRow = rows.find((r) => r.slot === "homePaidAdInsertion");
  if (maxRow && maxRow.max_items != null && Number(maxRow.max_items) <= 0) return false;
  return true;
}

export async function isStoresHomeFeedSellable(sb: SupabaseClient): Promise<boolean> {
  try {
    return await evaluateStoresHomeFeedSellable(sb);
  } catch {
    return false;
  }
}

export async function assertHomeFeedSellableByPolicy(
  sb: SupabaseClient
): Promise<{ ok: true } | { ok: false; error: "home_ads_disabled" }> {
  return (await isStoresHomeFeedSellable(sb)) ? { ok: true } : { ok: false, error: "home_ads_disabled" };
}
