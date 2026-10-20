import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadCouponCampaignOpsBundle,
  type CouponCampaignDbAggregate,
  type CouponCampaignOpsView,
} from "@/lib/stores/load-coupon-campaign-ops-bundle";
import type { AdminCouponDashboardKpi, AdminCouponRecentActivity } from "@/lib/stores/admin-coupon-control-shell";

/**
 * 관리자 쿠폰 관리 — 서버 페이지 (R7).
 * 필터·정렬·limit/offset·정확한 total·KPI·매장 옵션·최근 처리는 DB 함수 `admin_store_coupon_campaign_page` 한 번,
 * 페이지 캠페인(최대 100)의 상세 표시값은 기존 `loadCouponCampaignOpsBundle` (보유 상태 수·실현 재원은 DB 집계로 덮어쓴다).
 */
export const ADMIN_COUPON_CAMPAIGN_PAGE_RPC = "admin_store_coupon_campaign_page";
export const ADMIN_COUPON_CAMPAIGN_PAGE_MAX = 100;

export type AdminCouponCampaignPageInput = {
  status?: string | null;
  funding?: string | null;
  storeId?: string | null;
  campaignId?: string | null;
  limit?: number | null;
  offset?: number | null;
};

export type AdminCouponCampaignPageResult = {
  ok: true;
  campaigns: CouponCampaignOpsView[];
  total: number;
  limit: number;
  offset: number;
  kpi: AdminCouponDashboardKpi;
  stores: { id: string; name: string }[];
  recent: AdminCouponRecentActivity[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOrNull(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim();
  return UUID_RE.test(v) ? v : null;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function parseAdminCouponCampaignPageLimit(raw: unknown, fallback = 20): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(ADMIN_COUPON_CAMPAIGN_PAGE_MAX, n);
}

export function parseAdminCouponCampaignPageOffset(raw: unknown): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function loadAdminCouponCampaignPage(
  sb: SupabaseClient,
  input: AdminCouponCampaignPageInput
): Promise<AdminCouponCampaignPageResult | { ok: false; error: string }> {
  const limit = parseAdminCouponCampaignPageLimit(input.limit);
  const offset = parseAdminCouponCampaignPageOffset(input.offset);
  const status = String(input.status ?? "").trim();
  const funding = String(input.funding ?? "").trim();
  const { data, error } = await sb.rpc(ADMIN_COUPON_CAMPAIGN_PAGE_RPC, {
    p_status: status && status !== "all" ? status : null,
    p_funding: funding && funding !== "all" ? funding : null,
    p_store_id: uuidOrNull(input.storeId),
    p_campaign_id: uuidOrNull(input.campaignId),
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    console.error("[admin coupon page]", error.message);
    return { ok: false, error: "db_error" };
  }
  const payload = (data ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(payload.rows) ? (payload.rows as Record<string, unknown>[]) : [];
  const ids: string[] = [];
  const aggregates = new Map<string, CouponCampaignDbAggregate>();
  for (const r of rows) {
    const id = String(r.id ?? "").trim();
    if (!id) continue;
    ids.push(id);
    aggregates.set(id, {
      claimed: num(r.claimed),
      redeemed: num(r.redeemed),
      active_held: num(r.active_held),
      expired: num(r.expired),
      revoked: num(r.revoked),
      customer_discount: num(r.customer_discount),
      store_funded: num(r.store_funded),
      platform_funded: num(r.platform_funded),
      order_sales_php: num(r.order_sales_php),
    });
  }
  const bundle = await loadCouponCampaignOpsBundle(sb, { campaignIds: ids, aggregates });
  if (!bundle.ok) return bundle;

  const kpiRaw = (payload.kpi ?? {}) as Record<string, unknown>;
  const stores = (Array.isArray(payload.stores) ? (payload.stores as Record<string, unknown>[]) : [])
    .map((s) => ({ id: String(s.id ?? "").trim(), name: String(s.name ?? "").trim() }))
    .filter((s) => s.id);
  const recent = (Array.isArray(payload.recent) ? (payload.recent as Record<string, unknown>[]) : []).map((a) => ({
    created_at: String(a.created_at ?? ""),
    title: String(a.title ?? "").trim(),
    actor_label: a.actor_label ? String(a.actor_label) : null,
    action: String(a.action ?? "").trim(),
  }));

  return {
    ok: true,
    campaigns: bundle.campaigns,
    total: Math.max(0, Math.floor(num(payload.total))),
    limit,
    offset,
    kpi: {
      total: num(kpiRaw.total),
      active: num(kpiRaw.active),
      waiting: num(kpiRaw.waiting),
      ended: num(kpiRaw.ended),
    },
    stores,
    recent,
  };
}
