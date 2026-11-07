/**
 * Feed Banner renewal — Point spend ↔ period extension.
 *
 * D-01 (광고 3차 재감사 · 2026-11-07): 차감·연장·같은 키 판정을 DB 함수 `member_feed_ad_renew` 한 트랜잭션에서 한다.
 *   - 같은 요청 키(`renew:<캠페인>:<키>` 원장 행)가 이미 있으면 지금 종료일만 돌려주고 **연장하지 않는다**.
 *   - 자리 없음(트리거)·잔액 부족이면 전체 롤백 → TS 의 환급(renew-refund) 경로가 없다.
 *   - 화면이 본 가격(p_expected_cost)이 지금 가격과 다르면 `price_changed` (차감 없음).
 * TS 는 입력 확인·응답 모양만 맡는다 (옛 TS 판정·환급 삭제 — 이중 판정 금지).
 *
 * Unchanged creative/destination → auto extend (no re-review).
 * Changed creative/destination → reject here; member must new PHASE 2 request.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getFeedAdProduct } from "@/lib/ads/feed-ad-products";

export type RenewFeedAdCampaignResult =
  | {
      ok: true;
      campaignId: string;
      endAt: string;
      pointCost: number;
      idempotentReplay?: boolean;
    }
  | {
      ok: false;
      error: string;
      httpStatus: number;
      /** price_changed 일 때만 — 지금 가격·기간 */
      pointCost?: number;
      durationDays?: number;
    };

/** DB 함수 error 코드 → HTTP 상태 (그 밖의 코드·rpc 오류는 500 = 결과 모름 → 같은 키 재시도) */
const RENEW_ERROR_HTTP: Record<string, number> = {
  not_found: 404,
  admin_paused: 409,
  admin_ended: 409,
  not_renewable: 409,
  price_changed: 409,
  capacity_full: 409,
  insufficient_balance: 402,
  domain_mismatch: 400,
  product_not_found: 400,
};

function toInt(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : undefined;
}

export async function renewFeedAdCampaign(
  sb: SupabaseClient,
  params: {
    userId: string;
    campaignId: string;
    productId: string;
    idempotencyKey: string;
    /** 화면이 보여 준 선택 상품 가격 — DB 가 지금 가격과 다르면 price_changed */
    expectedCost?: number | null;
    /** If true, reject — caller must open new review request instead. */
    creativeOrDestinationChanged?: boolean;
  }
): Promise<RenewFeedAdCampaignResult> {
  const campaignId = params.campaignId.trim();
  const productId = params.productId.trim();
  const idem = params.idempotencyKey.trim().slice(0, 128);

  if (!campaignId || !idem || !productId) {
    return { ok: false, error: "missing_id", httpStatus: 400 };
  }
  if (params.creativeOrDestinationChanged) {
    return { ok: false, error: "re_review_required", httpStatus: 409 };
  }

  let expectedCost = toInt(params.expectedCost) ?? null;
  if (expectedCost == null) {
    // 가격 확인값을 보내지 않는 옛 화면(배포 직후 열려 있던 창) — 지금 가격을 기준으로 한다 (옛 동작과 같음).
    const product = await getFeedAdProduct(sb, productId);
    if (!product) return { ok: false, error: "product_not_found", httpStatus: 400 };
    expectedCost = product.pointCost;
  }

  const { data, error } = await sb.rpc("member_feed_ad_renew", {
    p_user: params.userId,
    p_campaign: campaignId,
    p_product: productId,
    p_key: idem,
    p_expected_cost: expectedCost,
  });
  if (error || !data || typeof data !== "object") {
    return { ok: false, error: "renew_failed", httpStatus: 500 };
  }

  const r = data as Record<string, unknown>;
  if (r.ok !== true) {
    const code = String(r.error ?? "");
    const httpStatus = RENEW_ERROR_HTTP[code] ?? 500;
    if (code === "price_changed") {
      return {
        ok: false,
        error: code,
        httpStatus,
        pointCost: toInt(r.point_cost),
        durationDays: toInt(r.duration_days),
      };
    }
    return { ok: false, error: httpStatus === 500 ? "renew_failed" : code, httpStatus };
  }

  return {
    ok: true,
    campaignId,
    endAt: String(r.end_at ?? ""),
    pointCost: toInt(r.point_cost) ?? expectedCost,
    idempotentReplay: r.idempotent === true,
  };
}
