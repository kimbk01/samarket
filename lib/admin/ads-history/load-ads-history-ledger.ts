/**
 * CUT R7 — Load Ads history ledger (read-only composition).
 * No writers. Historical amounts from snapshots only.
 *
 * R7 서버 페이지 — 원천 합치기·영역/상태/검색 필터·정렬·페이지·전체 건수는 DB RPC 한 번
 * (`admin_ads_history_page`). 화면에는 페이지 행만 원천별 id 로 읽어 기존 projector 로 그린다
 * (원천별 고정 상한·audit 800·노출 5000 상한 없음). 상태 필터 규칙 원천 = `filterAdsHistoryRows`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { DELIVERY_AD_AUDIT_LOG_TABLE } from "@/lib/stores/advertising/delivery-ad-audit";
import { DELIVERY_AD_CAMPAIGN_COMMERCIAL_SNAPSHOT_TABLE } from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import { loadAdminDeliveryAdCampaignsByIds } from "@/lib/stores/advertising/admin-delivery-ad-loader";
import { ADS_CANONICAL_PRODUCTS } from "@/lib/ads/ads-canonical-product-ssot";
import {
  projectBoostHistoryRow,
  projectDeliveryHistoryRow,
  projectFeedBannerHistoryRow,
  projectPopupAdminHistoryRow,
} from "@/lib/admin/ads-history/project-history-timeline";
import type {
  AdsHistoryDomainFilter,
  AdsHistoryLedgerModel,
  AdsHistoryLedgerRow,
  AdsHistoryStatusFilter,
} from "@/lib/admin/ads-history/types";
import { ADS_HISTORY_EXPORT_AVAILABLE } from "@/lib/admin/ads-history/event-authority-matrix";

export const ADS_HISTORY_PAGE_RPC = "admin_ads_history_page";

function isMissing(err: { message?: string } | null | undefined, re: RegExp): boolean {
  return !!err && re.test(String(err.message ?? ""));
}

export function filterAdsHistoryRows(
  rows: AdsHistoryLedgerRow[],
  opts: {
    domain?: AdsHistoryDomainFilter;
    status?: AdsHistoryStatusFilter;
    q?: string;
  }
): AdsHistoryLedgerRow[] {
  const domain = opts.domain ?? "all";
  const status = opts.status ?? "all";
  const q = (opts.q ?? "").trim().toLowerCase();

  return rows.filter((r) => {
    if (domain !== "all" && r.domain !== domain) return false;
    if (status !== "all") {
      const blob = `${r.finalStatusKo} ${r.finalStatusEn} ${r.lifecycleSummaryKo} ${r.paymentState}`.toLowerCase();
      if (status === "refunded" && r.paymentState !== "refunded") return false;
      if (status === "ended" && !/ended|종료|archiv|terminat|cancelled|취소/.test(blob)) {
        return false;
      }
      if (status === "rejected" && !/reject|반려|denied/.test(blob)) return false;
      if (status === "approved" && !/approv|승인|active|live|노출/.test(blob)) return false;
      if (status === "paused" && !/pause|제재|일시중지|sanction/.test(blob)) return false;
    }
    if (!q) return true;
    const hay = [
      r.campaignTitle,
      r.productLabelKo,
      r.productLabelEn,
      r.applicantLabel,
      r.id,
      r.placementLabelKo,
      r.placementLabelEn,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

/** RPC 에 넘기는 상품 표시 이름 (검색 대상) — `ADS_CANONICAL_PRODUCTS` 그대로. */
export function adsHistoryProductLabelsForRpc(): Record<string, { ko: string; en: string }> {
  const out: Record<string, { ko: string; en: string }> = {};
  for (const [key, row] of Object.entries(ADS_CANONICAL_PRODUCTS)) {
    out[key] = { ko: row.publicNameKo, en: row.publicNameEn };
  }
  return out;
}

type HistoryRef = { family: string; sourceId: string; impressionCount: number | null };

export type AdsHistoryLedgerPage = AdsHistoryLedgerModel & {
  total: number;
  limit: number;
  offset: number;
};

/**
 * 광고 이력 한 페이지 — `admin_ads_history_page` RPC(필터·정렬·페이지·total) → 페이지 행만 원천별로 읽어 projector.
 * 레거시 팝업 오너 신청은 기존 동작대로 포함하지 않는다 (기존 조회 열 title 이 운영 스키마에 없어 항상 빠져 있었음).
 */
export async function loadAdsHistoryLedgerPage(
  sb: SupabaseClient,
  input: {
    domain?: AdsHistoryDomainFilter;
    status?: AdsHistoryStatusFilter;
    q?: string;
    limit: number;
    offset: number;
  }
): Promise<AdsHistoryLedgerPage> {
  const sectionErrors: string[] = [];
  const base = {
    exportAvailable: ADS_HISTORY_EXPORT_AVAILABLE,
    exportGapKo: "내보내기 API 없음 — R7에서 export 백엔드 신설 금지",
    exportGapEn: "No export API — R7 must not invent export backend",
    loadedAt: new Date().toISOString(),
    limit: input.limit,
    offset: input.offset,
  } as const;

  const { data, error } = await sb.rpc(ADS_HISTORY_PAGE_RPC, {
    p_domain: input.domain && input.domain !== "all" ? input.domain : null,
    p_status: input.status && input.status !== "all" ? input.status : null,
    p_q: (input.q ?? "").trim() || null,
    p_product_labels: adsHistoryProductLabelsForRpc(),
    p_limit: input.limit,
    p_offset: input.offset,
  });
  if (error) throw new Error(error.message);
  const payload = (data ?? {}) as { total?: unknown; rows?: unknown };
  const refs: HistoryRef[] = (Array.isArray(payload.rows) ? (payload.rows as Record<string, unknown>[]) : []).map(
    (r) => ({
      family: String(r.family ?? ""),
      sourceId: String(r.source_id ?? ""),
      impressionCount: r.impression_count == null ? null : Number(r.impression_count),
    })
  );
  const idsOf = (family: string) => refs.filter((r) => r.family === family).map((r) => r.sourceId);
  const totalRaw = Number(payload.total);
  const total = Number.isFinite(totalRaw) && totalRaw >= 0 ? totalRaw : refs.length;

  const byKey = new Map<string, AdsHistoryLedgerRow>();
  const key = (family: string, id: string) => `${family}:${id}`;

  const boostIds = idsOf("boost");
  const feedReqIds = idsOf("feed_request");
  const feedCampIds = idsOf("feed_campaign");
  const deliveryIds = idsOf("delivery");
  const popupIds = idsOf("popup_campaign");

  const [boostRes, feedReqRes, feedCampRes, popupRes] = await Promise.all([
    boostIds.length
      ? sb
          .from("point_promotion_orders")
          .select("id, user_id, domain, order_status, created_at, target_id, target_title, product_id, point_cost, start_at, end_at")
          .in("id", boostIds)
      : Promise.resolve({ data: [], error: null }),
    feedReqIds.length
      ? sb
          .from("feed_ad_requests")
          .select(
            "id, user_id, status, start_at, end_at, created_at, placement, domain, product_id, point_cost, reviewed_by, reviewed_at, review_reason, destination_id"
          )
          .in("id", feedReqIds)
      : Promise.resolve({ data: [], error: null }),
    feedCampIds.length
      ? sb
          .from("feed_ad_campaigns")
          .select("id, name, domain, placement, status, start_at, end_at, source")
          .in("id", feedCampIds)
      : Promise.resolve({ data: [], error: null }),
    popupIds.length
      ? sb
          .from("platform_popup_campaigns")
          .select("id, name, status, approval_status, start_at, end_at, owner_request_id, created_at, created_by, approved_by, approved_at, updated_at")
          .in("id", popupIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (boostRes.error) sectionErrors.push(`boost:${boostRes.error.message}`);
  for (const raw of (boostRes.data ?? []) as Record<string, unknown>[]) {
    const domainRaw = String(raw.domain ?? "").toLowerCase();
    if (domainRaw !== "community" && domainRaw !== "trade") continue;
    const id = String(raw.id ?? "");
    byKey.set(
      key("boost", id),
      projectBoostHistoryRow({
        id,
        domain: domainRaw,
        orderStatus: String(raw.order_status ?? ""),
        createdAt: raw.created_at == null ? null : String(raw.created_at),
        endAt: raw.end_at == null ? null : String(raw.end_at),
        startAt: raw.start_at == null ? null : String(raw.start_at),
        targetTitle: raw.target_title == null ? null : String(raw.target_title),
        userId: raw.user_id == null ? null : String(raw.user_id),
        pointCost: raw.point_cost,
      })
    );
  }

  if (feedReqRes.error) sectionErrors.push(`feed_requests:${feedReqRes.error.message}`);
  for (const raw of (feedReqRes.data ?? []) as Record<string, unknown>[]) {
    const id = String(raw.id ?? "");
    const domain = String(raw.domain ?? "trade").toLowerCase() === "community" ? "community" : "trade";
    byKey.set(
      key("feed_request", id),
      projectFeedBannerHistoryRow({
        id,
        domain,
        kind: "request",
        status: String(raw.status ?? ""),
        createdAt: raw.created_at == null ? null : String(raw.created_at),
        startAt: raw.start_at == null ? null : String(raw.start_at),
        endAt: raw.end_at == null ? null : String(raw.end_at),
        title: raw.destination_id == null ? null : String(raw.destination_id),
        placement: raw.placement == null ? null : String(raw.placement),
        source: "request",
        userId: raw.user_id == null ? null : String(raw.user_id),
        createdBy: null,
        pointCost: raw.point_cost,
        reviewedBy: raw.reviewed_by == null ? null : String(raw.reviewed_by),
        reviewedAt: raw.reviewed_at == null ? null : String(raw.reviewed_at),
        reviewReason: raw.review_reason == null ? null : String(raw.review_reason),
      })
    );
  }

  if (feedCampRes.error) sectionErrors.push(`feed_campaigns:${feedCampRes.error.message}`);
  for (const raw of (feedCampRes.data ?? []) as Record<string, unknown>[]) {
    const id = String(raw.id ?? "");
    const startAt = raw.start_at != null ? String(raw.start_at) : null;
    byKey.set(
      key("feed_campaign", id),
      projectFeedBannerHistoryRow({
        id,
        domain: String(raw.domain ?? "trade") === "community" ? "community" : "trade",
        kind: "campaign",
        status: String(raw.status ?? "draft"),
        createdAt: startAt,
        startAt,
        endAt: raw.end_at != null ? String(raw.end_at) : null,
        title: String(raw.name ?? ""),
        placement: String(raw.placement ?? "TRADE_HOME"),
        source: "ADMIN_DIRECT",
        userId: null,
        createdBy: null,
        pointCost: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewReason: null,
      })
    );
  }

  if (deliveryIds.length > 0) {
    const kindById = new Map<string, "store_sponsored" | "banner">();
    // 배달 행은 매장 홍보·배너 두 표에서 id 로 찾는다 (RPC 가 상품을 정했다 — 두 표를 같은 id 목록으로 조회).
    const deliveryRefs = deliveryIds.flatMap((id) => [
      { productKind: "store_sponsored" as const, id },
      { productKind: "banner" as const, id },
    ]);
    const [list, snapRes, auditRes, fundingRes] = await Promise.all([
      loadAdminDeliveryAdCampaignsByIds(sb, deliveryRefs),
      sb
        .from(DELIVERY_AD_CAMPAIGN_COMMERCIAL_SNAPSHOT_TABLE)
        .select("campaign_id, final_payable_minor, currency, created_at")
        .in("campaign_id", deliveryIds)
        .order("created_at", { ascending: true }),
      sb
        .from(DELIVERY_AD_AUDIT_LOG_TABLE)
        .select("campaign_id, action, actor_type, actor_user_id, reason, created_at")
        .in("campaign_id", deliveryIds)
        .order("created_at", { ascending: true }),
      sb
        .from("delivery_ad_canonical_bc_fundings")
        .select("application_id, refund_ledger_id, amount_minor")
        .in("application_id", deliveryIds),
    ]);
    if (list.error) sectionErrors.push(`delivery:${list.error}`);
    const snapshotByCampaign = new Map<string, { finalPayableMinor: number | null; currency: string | null }>();
    if (snapRes.error && !isMissing(snapRes.error, /commercial_snapshots|schema cache|does not exist/i)) {
      sectionErrors.push(`delivery_snapshot:${snapRes.error.message}`);
    } else {
      // created_at 오름차순 — 마지막(최신) 스냅샷이 남는다 (RPC 결제 상태와 같은 기준).
      for (const r of (snapRes.data ?? []) as Record<string, unknown>[]) {
        const cid = String(r.campaign_id ?? "");
        if (!cid) continue;
        snapshotByCampaign.set(cid, {
          finalPayableMinor: r.final_payable_minor == null ? null : Number(r.final_payable_minor),
          currency: r.currency == null ? null : String(r.currency),
        });
      }
    }
    const auditsByCampaign = new Map<
      string,
      Array<{ action: string; actorType: string; actorUserId: string | null; reason: string | null; createdAt: string }>
    >();
    if (auditRes.error && !isMissing(auditRes.error, /delivery_ad_audit_logs|schema cache|does not exist/i)) {
      sectionErrors.push(`delivery_audit:${auditRes.error.message}`);
    } else {
      for (const r of (auditRes.data ?? []) as Record<string, unknown>[]) {
        const cid = String(r.campaign_id ?? "");
        if (!cid) continue;
        const listFor = auditsByCampaign.get(cid) ?? [];
        listFor.push({
          action: String(r.action ?? ""),
          actorType: String(r.actor_type ?? ""),
          actorUserId: r.actor_user_id == null ? null : String(r.actor_user_id),
          reason: r.reason == null ? null : String(r.reason),
          createdAt: String(r.created_at ?? ""),
        });
        auditsByCampaign.set(cid, listFor);
      }
    }
    const refundByCampaign = new Map<string, { proven: boolean; label: string | null }>();
    if (
      fundingRes.error &&
      !isMissing(fundingRes.error, /delivery_ad_canonical_bc_fundings|schema cache|does not exist/i)
    ) {
      sectionErrors.push(`delivery_funding:${fundingRes.error.message}`);
    } else {
      for (const r of (fundingRes.data ?? []) as Record<string, unknown>[]) {
        const cid = String(r.application_id ?? "");
        const refundId = r.refund_ledger_id == null ? null : String(r.refund_ledger_id);
        if (!cid || !refundId) continue;
        refundByCampaign.set(cid, {
          proven: true,
          label: r.amount_minor != null ? `refund ledger ${refundId.slice(0, 8)}` : null,
        });
      }
    }
    const impressionsById = new Map(
      refs.filter((r) => r.family === "delivery").map((r) => [r.sourceId, r.impressionCount] as const)
    );
    for (const item of list.items) {
      if (kindById.has(item.id)) continue;
      kindById.set(item.id, item.productKind);
      const snap = snapshotByCampaign.get(item.id);
      const refund = refundByCampaign.get(item.id);
      byKey.set(
        key("delivery", item.id),
        projectDeliveryHistoryRow({
          id: item.id,
          product: item.productKind === "banner" ? "banner" : "store_sponsored",
          title: item.title || item.headline,
          campaignSource: item.campaignSource,
          ownerUserId: item.ownerUserId,
          lifecycleStatus: item.lifecycleStatus,
          reviewStatus: item.reviewStatus,
          createdAt: item.createdAt,
          submittedAt: item.submittedAt,
          startAt: item.startAt,
          endAt: item.endAt,
          inventoryKeys: item.inventoryKeys,
          sortOrder: item.sortOrder,
          finalPayableMinor: snap?.finalPayableMinor ?? null,
          currency: snap?.currency ?? null,
          audits: auditsByCampaign.get(item.id) ?? [],
          refundProven: Boolean(refund?.proven),
          refundAmountLabel: refund?.label ?? null,
          impressionCount: impressionsById.get(item.id) ?? null,
        })
      );
    }
  }

  if (popupRes.error) sectionErrors.push(`popup_campaigns:${popupRes.error.message}`);
  for (const raw of (popupRes.data ?? []) as Record<string, unknown>[]) {
    const id = String(raw.id ?? "");
    const str = (v: unknown) => (v == null ? null : String(v));
    byKey.set(
      key("popup_campaign", id),
      projectPopupAdminHistoryRow({
        id,
        name: str(raw.name),
        status: String(raw.status ?? ""),
        approvalStatus: str(raw.approval_status),
        createdAt: str(raw.created_at) ?? str(raw.updated_at),
        createdBy: str(raw.created_by),
        approvedBy: str(raw.approved_by),
        approvedAt: str(raw.approved_at),
        startAt: str(raw.start_at),
        endAt: str(raw.end_at),
        ownerRequestId: str(raw.owner_request_id),
      })
    );
  }

  // RPC 순서 유지 (정렬 = DB). 읽는 사이 지워진 행은 건너뛴다.
  const rows = refs
    .map((r) => byKey.get(key(r.family, r.sourceId)))
    .filter((r): r is AdsHistoryLedgerRow => r != null);

  return { ...base, rows, total, sectionErrors };
}
