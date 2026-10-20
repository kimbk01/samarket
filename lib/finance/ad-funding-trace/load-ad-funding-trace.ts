/**
 * 광고 자금 추적(AdFundingTrace) 목록 — 단일 정의.
 *
 * R7 후속(funding): 예전 이 로더는 출처별 테이블을 직접 조회했는데 운영에 없는 열을 골랐다
 * (`delivery_ad_canonical_bc_fundings.owner_user_id` · `feed_ad_point_holds.spend_ledger_id/release_ledger_id` ·
 * `point_promotion_orders.status/post_id` · `platform_popup_campaigns.source_kind/activated_at/ended_at`).
 * PostgREST 오류가 무시되어 사장님 재무 「광고 자금」(`/api/me/stores/[storeId]/finance/transparent?kind=ad-funding`)이
 * 항상 빈 목록이었다.
 * 지금: 관리자 화면과 같은 운영 열 기준 정의 RPC `admin_finance_ad_funding_page`
 * (supabase/migrations/20270601120100_r7_admin_finance_pages.sql — 매장 사장 = stores.owner_user_id ·
 * 홍보 주문 상태 = order_status · 관리자 직접 팝업 = owner_request_id IS NULL · 노출 = start_at/end_at)
 * 와 같은 행 변환(`mapAdFundingRpcRow`)을 그대로 쓴다. storeId 를 주면 RPC 가 STORE_CASH(그 매장 행)만 돌려준다.
 * 조회 실패는 빈 목록으로 덮지 않고 예외로 올린다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ownerFinanceLedgerHref } from "@/lib/finance/deep-links";
import { TRADE_POST_ADS_LEGACY_LABEL } from "@/lib/finance/product-decision-lock";
import type { AdFundingTrace, AdFundingTraceListQuery } from "@/lib/finance/ad-funding-trace/types";
import { loadAdFundingTracePage } from "@/lib/finance/ad-funding-trace/load-ad-funding-trace-page";

/** 최신 순 첫 페이지(limit 1..100, 기본 40). 실패는 예외. */
export async function loadAdFundingTraces(
  sb: SupabaseClient,
  query: AdFundingTraceListQuery = {}
): Promise<AdFundingTrace[]> {
  const { traces } = await loadAdFundingTracePage(sb, {
    storeId: query.storeId ?? null,
    memberId: query.memberId ?? null,
    fundingRail: query.fundingRail ?? null,
    limit: query.limit ?? 40,
    offset: 0,
  });
  return traces;
}

export async function loadAdFundingTraceByAdId(
  sb: SupabaseClient,
  adId: string
): Promise<AdFundingTrace | null> {
  const id = adId.trim();
  if (!id) return null;
  const all = await loadAdFundingTraces(sb, { limit: 100 });
  return all.find((t) => t.adId === id) ?? null;
}

export function ownerScopedFinanceHrefForTrace(
  trace: AdFundingTrace,
  storeId: string
): string | null {
  if (trace.fundingRail !== "STORE_CASH") return null;
  return ownerFinanceLedgerHref({
    storeId,
    wallet: "cash",
    ledgerId: trace.fundingTransactionId,
    adId: trace.adId,
  });
}

export { TRADE_POST_ADS_LEGACY_LABEL };
