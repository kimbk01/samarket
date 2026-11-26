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
import { listHomeShelfProductDbRows } from "@/lib/stores/product/stores-home-shelf-product-db";
import { resolveHomeRestPaidSurfaceAllowed } from "@/lib/stores/store-paid-ad-exposure";

export const STORES_HOME_FEED_INVENTORY_KEY = "STORES_HOME_FEED" as const;

export async function isStoresHomeFeedSellable(sb: SupabaseClient): Promise<boolean> {
  try {
    const rows = await listHomeShelfProductDbRows(sb);
    const rest = rows.find((r) => r.shelf_id === "rest_stores" || r.slot === "slot6RestStores");
    return resolveHomeRestPaidSurfaceAllowed({ restShelfAdIntegration: rest?.ad_integration ?? null });
  } catch {
    return false;
  }
}

export async function assertHomeFeedSellableByPolicy(
  sb: SupabaseClient
): Promise<{ ok: true } | { ok: false; error: "home_ads_disabled" }> {
  return (await isStoresHomeFeedSellable(sb)) ? { ok: true } : { ok: false, error: "home_ads_disabled" };
}
