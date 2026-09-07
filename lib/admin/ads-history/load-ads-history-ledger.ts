/**
 * CUT R7 — Load Ads history ledger (read-only composition).
 * No writers. Historical amounts from snapshots only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { listFeedAdCampaignsForAdmin } from "@/lib/ads/feed-ad-campaigns-db";
import { listPlatformPopupAdminCampaigns } from "@/lib/platform-popup/admin-campaign-loader";
import { DELIVERY_AD_AUDIT_LOG_TABLE } from "@/lib/stores/advertising/delivery-ad-audit";
import { DELIVERY_AD_CAMPAIGN_COMMERCIAL_SNAPSHOT_TABLE } from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import { loadAdminDeliveryAdCampaignList } from "@/lib/stores/advertising/admin-delivery-ad-loader";
import {
  projectBoostHistoryRow,
  projectDeliveryHistoryRow,
  projectFeedBannerHistoryRow,
  projectPopupAdminHistoryRow,
  projectPopupOwnerLegacyHistoryRow,
} from "@/lib/admin/ads-history/project-history-timeline";
import type {
  AdsHistoryDomainFilter,
  AdsHistoryLedgerModel,
  AdsHistoryLedgerRow,
  AdsHistoryStatusFilter,
} from "@/lib/admin/ads-history/types";
import { ADS_HISTORY_EXPORT_AVAILABLE } from "@/lib/admin/ads-history/event-authority-matrix";

const FAMILY_LIMIT = 120;

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

export async function loadAdsHistoryLedger(sb: SupabaseClient): Promise<AdsHistoryLedgerModel> {
  const sectionErrors: string[] = [];
  const rows: AdsHistoryLedgerRow[] = [];

  const [
    boostRes,
    feedReqRes,
    feedCampaignsSettled,
    deliveryList,
    popupCampaignsRes,
    popupOwnerRes,
  ] = await Promise.all([
    sb
      .from("point_promotion_orders")
      .select(
        "id, user_id, domain, order_status, created_at, target_id, target_title, product_id, point_cost, start_at, end_at"
      )
      .in("domain", ["trade", "community"])
      .order("created_at", { ascending: false })
      .limit(FAMILY_LIMIT),
    sb
      .from("feed_ad_requests")
      .select(
        "id, user_id, status, start_at, end_at, created_at, placement, domain, product_id, point_cost, reviewed_by, reviewed_at, review_reason, destination_id"
      )
      .order("created_at", { ascending: false })
      .limit(FAMILY_LIMIT),
    listFeedAdCampaignsForAdmin(sb)
      .then((items) => ({ ok: true as const, items }))
      .catch((e: unknown) => ({
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      })),
    loadAdminDeliveryAdCampaignList(sb, { product: "all", limit: FAMILY_LIMIT }),
    listPlatformPopupAdminCampaigns(sb, { limit: FAMILY_LIMIT }),
    sb
      .from("platform_popup_owner_requests")
      .select(
        "id, store_id, owner_user_id, request_status, created_at, title, price_minor, currency, payment_status"
      )
      .order("created_at", { ascending: false })
      .limit(FAMILY_LIMIT),
  ]);

  if (boostRes.error && !isMissing(boostRes.error, /point_promotion_orders|schema cache|does not exist/i)) {
    sectionErrors.push(`boost:${boostRes.error.message}`);
  } else {
    for (const raw of boostRes.data ?? []) {
      const r = raw as Record<string, unknown>;
      const domainRaw = String(r.domain ?? "").toLowerCase();
      if (domainRaw !== "community" && domainRaw !== "trade") continue;
      rows.push(
        projectBoostHistoryRow({
          id: String(r.id ?? ""),
          domain: domainRaw,
          orderStatus: String(r.order_status ?? ""),
          createdAt: r.created_at == null ? null : String(r.created_at),
          endAt: r.end_at == null ? null : String(r.end_at),
          startAt: r.start_at == null ? null : String(r.start_at),
          targetTitle: r.target_title == null ? null : String(r.target_title),
          userId: r.user_id == null ? null : String(r.user_id),
          pointCost: r.point_cost,
        })
      );
    }
  }

  if (feedReqRes.error && !isMissing(feedReqRes.error, /feed_ad_requests|schema cache|does not exist/i)) {
    sectionErrors.push(`feed_requests:${feedReqRes.error.message}`);
  } else {
    for (const raw of feedReqRes.data ?? []) {
      const r = raw as Record<string, unknown>;
      const domainRaw = String(r.domain ?? "trade").toLowerCase();
      const domain = domainRaw === "community" ? "community" : "trade";
      rows.push(
        projectFeedBannerHistoryRow({
          id: String(r.id ?? ""),
          domain,
          kind: "request",
          status: String(r.status ?? ""),
          createdAt: r.created_at == null ? null : String(r.created_at),
          startAt: r.start_at == null ? null : String(r.start_at),
          endAt: r.end_at == null ? null : String(r.end_at),
          title: r.destination_id == null ? null : String(r.destination_id),
          placement: r.placement == null ? null : String(r.placement),
          source: "request",
          userId: r.user_id == null ? null : String(r.user_id),
          createdBy: null,
          pointCost: r.point_cost,
          reviewedBy: r.reviewed_by == null ? null : String(r.reviewed_by),
          reviewedAt: r.reviewed_at == null ? null : String(r.reviewed_at),
          reviewReason: r.review_reason == null ? null : String(r.review_reason),
        })
      );
    }
  }

  if (!feedCampaignsSettled.ok) {
    if (!/feed_ad_campaigns|schema cache|does not exist/i.test(feedCampaignsSettled.error)) {
      sectionErrors.push(`feed_campaigns:${feedCampaignsSettled.error}`);
    }
  } else {
    for (const c of feedCampaignsSettled.items) {
      if (c.source !== "ADMIN_DIRECT") continue;
      const domain = c.domain === "community" ? "community" : "trade";
      rows.push(
        projectFeedBannerHistoryRow({
          id: c.id,
          domain,
          kind: "campaign",
          status: c.status,
          createdAt: c.startAt,
          startAt: c.startAt,
          endAt: c.endAt,
          title: c.name,
          placement: c.placement,
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
  }

  if (deliveryList.error) {
    sectionErrors.push(`delivery:${deliveryList.error}`);
  } else {
    const deliveryIds = deliveryList.items.map((i) => i.id);
    const snapshotByCampaign = new Map<
      string,
      { finalPayableMinor: number | null; currency: string | null }
    >();
    const auditsByCampaign = new Map<
      string,
      Array<{
        action: string;
        actorType: string;
        actorUserId: string | null;
        reason: string | null;
        createdAt: string;
      }>
    >();
    const impressionCountByCampaign = new Map<string, number>();
    const refundByCampaign = new Map<string, { proven: boolean; label: string | null }>();

    if (deliveryIds.length > 0) {
      const [snapRes, auditRes, impressionRes, fundingRes] = await Promise.all([
        sb
          .from(DELIVERY_AD_CAMPAIGN_COMMERCIAL_SNAPSHOT_TABLE)
          .select("campaign_id, final_payable_minor, currency")
          .in("campaign_id", deliveryIds),
        sb
          .from(DELIVERY_AD_AUDIT_LOG_TABLE)
          .select("campaign_id, action, actor_type, actor_user_id, reason, created_at")
          .in("campaign_id", deliveryIds)
          .order("created_at", { ascending: true })
          .limit(800),
        sb
          .from("delivery_ad_impression_events")
          .select("campaign_id")
          .in("campaign_id", deliveryIds)
          .limit(5000),
        sb
          .from("delivery_ad_canonical_bc_fundings")
          .select("application_id, refund_ledger_id, amount_minor")
          .in("application_id", deliveryIds),
      ]);

      if (snapRes.error && !isMissing(snapRes.error, /commercial_snapshots|schema cache|does not exist/i)) {
        sectionErrors.push(`delivery_snapshot:${snapRes.error.message}`);
      } else {
        for (const raw of snapRes.data ?? []) {
          const r = raw as Record<string, unknown>;
          const cid = String(r.campaign_id ?? "");
          if (!cid) continue;
          snapshotByCampaign.set(cid, {
            finalPayableMinor:
              r.final_payable_minor == null ? null : Number(r.final_payable_minor),
            currency: r.currency == null ? null : String(r.currency),
          });
        }
      }

      if (auditRes.error && !isMissing(auditRes.error, /delivery_ad_audit_logs|schema cache|does not exist/i)) {
        sectionErrors.push(`delivery_audit:${auditRes.error.message}`);
      } else {
        for (const raw of auditRes.data ?? []) {
          const r = raw as Record<string, unknown>;
          const cid = String(r.campaign_id ?? "");
          if (!cid) continue;
          const list = auditsByCampaign.get(cid) ?? [];
          list.push({
            action: String(r.action ?? ""),
            actorType: String(r.actor_type ?? ""),
            actorUserId: r.actor_user_id == null ? null : String(r.actor_user_id),
            reason: r.reason == null ? null : String(r.reason),
            createdAt: String(r.created_at ?? ""),
          });
          auditsByCampaign.set(cid, list);
        }
      }

      if (
        impressionRes.error &&
        !isMissing(impressionRes.error, /delivery_ad_impression_events|schema cache|does not exist/i)
      ) {
        sectionErrors.push(`delivery_impressions:${impressionRes.error.message}`);
      } else {
        for (const raw of impressionRes.data ?? []) {
          const cid = String((raw as { campaign_id?: unknown }).campaign_id ?? "");
          if (!cid) continue;
          impressionCountByCampaign.set(cid, (impressionCountByCampaign.get(cid) ?? 0) + 1);
        }
      }

      if (
        fundingRes.error &&
        !isMissing(fundingRes.error, /delivery_ad_canonical_bc_fundings|schema cache|does not exist/i)
      ) {
        sectionErrors.push(`delivery_funding:${fundingRes.error.message}`);
      } else {
        for (const raw of fundingRes.data ?? []) {
          const r = raw as Record<string, unknown>;
          const cid = String(r.application_id ?? "");
          if (!cid) continue;
          const refundId = r.refund_ledger_id == null ? null : String(r.refund_ledger_id);
          if (refundId) {
            refundByCampaign.set(cid, {
              proven: true,
              label: r.amount_minor != null ? `refund ledger ${refundId.slice(0, 8)}` : null,
            });
          }
        }
      }
    }

    for (const item of deliveryList.items) {
      const snap = snapshotByCampaign.get(item.id);
      const refund = refundByCampaign.get(item.id);
      rows.push(
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
          impressionCount: impressionCountByCampaign.get(item.id) ?? null,
        })
      );
    }
  }

  if (!popupCampaignsRes.ok) {
    if (!/platform_popup_campaigns|schema cache|does not exist/i.test(popupCampaignsRes.error)) {
      sectionErrors.push(`popup_campaigns:${popupCampaignsRes.error}`);
    }
  } else {
    const popupIds = popupCampaignsRes.items.map((c) => c.id);
    const popupActors = new Map<
      string,
      { createdAt: string | null; createdBy: string | null; approvedBy: string | null; approvedAt: string | null }
    >();
    if (popupIds.length > 0) {
      const actorRes = await sb
        .from("platform_popup_campaigns")
        .select("id, created_at, created_by, approved_by, approved_at")
        .in("id", popupIds);
      if (actorRes.error && !isMissing(actorRes.error, /platform_popup_campaigns|schema cache|does not exist/i)) {
        sectionErrors.push(`popup_actors:${actorRes.error.message}`);
      } else {
        for (const raw of actorRes.data ?? []) {
          const r = raw as Record<string, unknown>;
          const id = String(r.id ?? "");
          if (!id) continue;
          popupActors.set(id, {
            createdAt: r.created_at == null ? null : String(r.created_at),
            createdBy: r.created_by == null ? null : String(r.created_by),
            approvedBy: r.approved_by == null ? null : String(r.approved_by),
            approvedAt: r.approved_at == null ? null : String(r.approved_at),
          });
        }
      }
    }
    for (const c of popupCampaignsRes.items) {
      const actors = popupActors.get(c.id);
      rows.push(
        projectPopupAdminHistoryRow({
          id: c.id,
          name: c.name,
          status: c.status,
          approvalStatus: c.approvalStatus,
          createdAt: actors?.createdAt ?? c.updatedAt ?? null,
          createdBy: actors?.createdBy ?? null,
          approvedBy: actors?.approvedBy ?? null,
          approvedAt: actors?.approvedAt ?? null,
          startAt: c.startAt,
          endAt: c.endAt,
          ownerRequestId: c.ownerRequestId,
        })
      );
    }
  }

  if (
    popupOwnerRes.error &&
    !isMissing(popupOwnerRes.error, /platform_popup_owner_requests|schema cache|does not exist/i)
  ) {
    sectionErrors.push(`popup_owner:${popupOwnerRes.error.message}`);
  } else {
    for (const raw of popupOwnerRes.data ?? []) {
      const r = raw as Record<string, unknown>;
      rows.push(
        projectPopupOwnerLegacyHistoryRow({
          id: String(r.id ?? ""),
          title: r.title == null ? null : String(r.title),
          requestStatus: String(r.request_status ?? ""),
          createdAt: r.created_at == null ? null : String(r.created_at),
          ownerUserId: r.owner_user_id == null ? null : String(r.owner_user_id),
          storeId: r.store_id == null ? null : String(r.store_id),
          priceMinor: r.price_minor,
          currency: r.currency == null ? null : String(r.currency),
          paymentStatus: r.payment_status == null ? null : String(r.payment_status),
        })
      );
    }
  }

  rows.sort((a, b) => {
    const at = a.lastEventAt ?? "";
    const bt = b.lastEventAt ?? "";
    return bt.localeCompare(at);
  });

  return {
    rows,
    exportAvailable: ADS_HISTORY_EXPORT_AVAILABLE,
    exportGapKo: "내보내기 API 없음 — R7에서 export 백엔드 신설 금지",
    exportGapEn: "No export API — R7 must not invent export backend",
    loadedAt: new Date().toISOString(),
    sectionErrors,
  };
}
