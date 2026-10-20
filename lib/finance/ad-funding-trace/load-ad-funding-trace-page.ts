/**
 * 관리자 재무 「광고 지출」 서버 페이지 (R7 — 고정 조회 상한 제거).
 * 예전: 다섯 출처를 출처별 최신 N건씩 읽어 메모리에서 합치고 80건으로 자름 (`loadAdFundingTraces`).
 * 지금: RPC `admin_finance_ad_funding_page` 한 번 — 출처 UNION ALL · 매장/회원/결제 수단 필터 ·
 * 결정적 정렬(노출 시작 → 승인 → 생성 시각 DESC, 출처, id) · limit/offset · 정확한 total
 * (supabase/migrations/20270601120100_r7_admin_finance_pages.sql). 금액은 읽기만 한다 (ADMIN_DIRECT 는 금액 없음).
 * 사장님 재무(`/api/me/stores/.../finance/transparent?kind=ad-funding`)도 `loadAdFundingTraces` → 이 RPC·변환을
 * 그대로 쓴다 (storeId 지정 시 그 매장 STORE_CASH 행만).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminAdDetailHref, adminFinanceLedgerHref } from "@/lib/finance/deep-links";
import type { AdFundingTrace } from "@/lib/finance/ad-funding-trace/types";
import type { AdsFundingRail } from "@/lib/finance/product-decision-lock";
import { DELIVERY_AD_CANONICAL_BC_FUNDINGS_TABLE } from "@/lib/stores/advertising/canonical-business-cash-contract";
import { ADMIN_LIST_MAX_OFFSET } from "@/lib/admin/pagination/parse-admin-list-page";

export const ADMIN_FINANCE_AD_FUNDING_PAGE_RPC = "admin_finance_ad_funding_page" as const;
export const AD_FUNDING_PAGE_MAX_LIMIT = 100;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_MATCH_UUID = "00000000-0000-0000-0000-000000000000";
const RAILS: readonly AdsFundingRail[] = ["STORE_CASH", "MEMBER_POINT", "ADMIN_DIRECT"];

function uuidFilter(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return UUID_RE.test(s) ? s : NO_MATCH_UUID;
}

const str = (v: unknown): string => (v == null ? "" : String(v));
const strOrNull = (v: unknown): string | null => (v == null || v === "" ? null : String(v));

export type AdFundingTracePageQuery = {
  storeId?: string | null;
  memberId?: string | null;
  fundingRail?: string | null;
  limit?: number;
  offset?: number;
};

export function adFundingPageRpcArgs(q: AdFundingTracePageQuery) {
  const limit = Math.min(Math.max(Math.trunc(Number(q.limit) || 40), 1), AD_FUNDING_PAGE_MAX_LIMIT);
  const offset = Math.min(Math.max(Math.trunc(Number(q.offset) || 0), 0), ADMIN_LIST_MAX_OFFSET);
  const rail = RAILS.includes(String(q.fundingRail ?? "") as AdsFundingRail) ? String(q.fundingRail) : null;
  return {
    args: {
      p_store_id: uuidFilter(q.storeId),
      p_member_id: uuidFilter(q.memberId),
      p_rail: rail,
      p_limit: limit,
      p_offset: offset,
    },
    limit,
    offset,
  };
}

type RpcAdRow = { source?: string; id?: string; row?: Record<string, unknown> };

export function mapAdFundingRpcRow(r: RpcAdRow): AdFundingTrace | null {
  const row = r.row ?? {};
  const source = str(r.source);

  if (source === DELIVERY_AD_CANONICAL_BC_FUNDINGS_TABLE) {
    const appId = str(row.application_id).trim();
    if (!appId) return null;
    const storeId = str(row.store_id).trim() || null;
    const productKind = str(row.product_kind).trim();
    const isPopup = productKind === "platform_popup";
    const isPartner = productKind === "partner";
    const family = isPartner
      ? ("partner" as const)
      : isPopup
        ? ("platform_popup_owner_request" as const)
        : ("delivery_campaign" as const);
    const spendId = strOrNull(row.spend_ledger_id);
    const refundId = strOrNull(row.refund_ledger_id);
    const amountMinor = Math.trunc(Number(row.amount_minor) || 0);
    return {
      adId: appId,
      adProduct: productKind || "delivery_ad",
      domain: isPopup ? "platform_popup" : isPartner ? "partner" : "delivery",
      applicantType: "owner",
      memberId: null,
      ownerId: strOrNull(row.owner_user_id),
      storeId,
      fundingRail: "STORE_CASH",
      walletType: "CASH",
      price: Math.trunc(amountMinor) / 100,
      priceMinor: amountMinor,
      currency: "PHP",
      fundingTransactionId: spendId,
      holdId: null,
      captureTransactionId: spendId,
      refundTransactionId: refundId,
      status: str(row.status),
      approvedBy: null,
      approvedAt: null,
      activeAt: null,
      expiredAt: null,
      source: DELIVERY_AD_CANONICAL_BC_FUNDINGS_TABLE,
      legacy: isPopup,
      legacyLabel: isPopup ? "LEGACY" : null,
      family,
      adDetailHref: adminAdDetailHref({ family, id: appId }),
      financeHref: storeId
        ? adminFinanceLedgerHref({ wallet: "cash", storeId, ledgerId: spendId, adId: appId })
        : adminFinanceLedgerHref({ wallet: "cash", ledgerId: spendId, adId: appId }),
    };
  }

  if (source === "feed_ad_requests") {
    const id = str(row.id).trim();
    if (!id) return null;
    const domain = str(row.domain) || "community";
    const holdId = strOrNull(row.hold_id);
    return {
      adId: id,
      adProduct: domain.includes("trade") ? "trade_banner" : "community_banner",
      domain,
      applicantType: "member",
      memberId: strOrNull(row.user_id),
      ownerId: null,
      storeId: null,
      fundingRail: "MEMBER_POINT",
      walletType: "POINT",
      price: Math.trunc(Number(row.point_cost) || 0),
      priceMinor: null,
      currency: "POINT",
      // 보류(feed_ad_point_holds)에는 원장 id 열이 없다 — 원장 연결은 포인트 내역(adId 필터)으로 연다.
      fundingTransactionId: null,
      holdId,
      captureTransactionId: null,
      refundTransactionId: null,
      status: str(row.status),
      approvedBy: strOrNull(row.reviewed_by),
      approvedAt: strOrNull(row.reviewed_at),
      activeAt: null,
      expiredAt: null,
      source: "feed_ad_requests",
      legacy: false,
      legacyLabel: null,
      family: "feed_request",
      adDetailHref: adminAdDetailHref({ family: "feed_request", id }),
      financeHref: adminFinanceLedgerHref({ wallet: "point", ledgerId: null, adId: id }),
    };
  }

  if (source === "point_promotion_orders") {
    const id = str(row.id).trim();
    if (!id) return null;
    const domain = str(row.domain) || "community";
    return {
      adId: id,
      adProduct: domain.includes("trade") ? "trade_boost" : "community_boost",
      domain,
      applicantType: "member",
      memberId: strOrNull(row.user_id),
      ownerId: null,
      storeId: null,
      fundingRail: "MEMBER_POINT",
      walletType: "POINT",
      price: Math.trunc(Number(row.point_cost) || 0),
      priceMinor: null,
      currency: "POINT",
      fundingTransactionId: null,
      holdId: null,
      captureTransactionId: null,
      refundTransactionId: null,
      status: str(row.status),
      approvedBy: null,
      approvedAt: null,
      activeAt: strOrNull(row.start_at),
      expiredAt: strOrNull(row.end_at),
      source: "point_promotion_orders",
      legacy: false,
      legacyLabel: null,
      family: "boost_order",
      adDetailHref: adminAdDetailHref({ family: "boost_order", id }),
      financeHref: adminFinanceLedgerHref({ wallet: "point", adId: id }),
    };
  }

  if (source === "platform_popup_campaigns") {
    const id = str(row.id).trim();
    if (!id) return null;
    return {
      adId: id,
      adProduct: "popup",
      domain: "platform_popup",
      applicantType: "admin",
      memberId: null,
      ownerId: null,
      storeId: null,
      fundingRail: "ADMIN_DIRECT",
      walletType: "N_A",
      price: null,
      priceMinor: null,
      currency: "N_A",
      fundingTransactionId: null,
      holdId: null,
      captureTransactionId: null,
      refundTransactionId: null,
      status: str(row.status),
      approvedBy: strOrNull(row.created_by),
      approvedAt: null,
      activeAt: strOrNull(row.start_at),
      expiredAt: strOrNull(row.end_at),
      source: "platform_popup_campaigns",
      legacy: false,
      legacyLabel: null,
      family: "platform_popup_campaign",
      adDetailHref: adminAdDetailHref({ family: "platform_popup_campaign", id }),
      financeHref: null,
    };
  }
  return null;
}

/** 광고 자금 추적 서버 페이지 — traces + 정확한 total. 실패는 예외. */
export async function loadAdFundingTracePage(
  sb: SupabaseClient,
  q: AdFundingTracePageQuery = {}
): Promise<{ traces: AdFundingTrace[]; total: number; limit: number; offset: number }> {
  const { args, limit, offset } = adFundingPageRpcArgs(q);
  const { data, error } = await sb.rpc(ADMIN_FINANCE_AD_FUNDING_PAGE_RPC, args);
  if (error) throw new Error(error.message || "ad_funding_load_failed");
  const o = (data ?? {}) as { total?: unknown; rows?: unknown };
  const traces = (Array.isArray(o.rows) ? (o.rows as RpcAdRow[]) : [])
    .map(mapAdFundingRpcRow)
    .filter((t): t is AdFundingTrace => Boolean(t));
  return { traces, total: Math.max(0, Math.trunc(Number(o.total) || 0)), limit, offset };
}
