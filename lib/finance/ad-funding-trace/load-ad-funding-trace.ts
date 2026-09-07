/**
 * Load AdFundingTrace from canonical ad + funding tables. No fake ADMIN_DIRECT amounts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminAdDetailHref,
  adminFinanceLedgerHref,
  ownerFinanceLedgerHref,
} from "@/lib/finance/deep-links";
import { TRADE_POST_ADS_LEGACY_LABEL } from "@/lib/finance/product-decision-lock";
import type { AdFundingTrace, AdFundingTraceListQuery } from "@/lib/finance/ad-funding-trace/types";
import { DELIVERY_AD_CANONICAL_BC_FUNDINGS_TABLE } from "@/lib/stores/advertising/canonical-business-cash-contract";

function moneyMajorFromMinor(minor: number): number {
  return Math.trunc(minor) / 100;
}

export async function loadAdFundingTraces(
  sb: SupabaseClient,
  query: AdFundingTraceListQuery = {}
): Promise<AdFundingTrace[]> {
  const limit = Math.min(Math.max(query.limit ?? 40, 1), 100);
  const out: AdFundingTrace[] = [];

  const storeFilter = query.storeId?.trim() || null;
  const memberFilter = query.memberId?.trim() || null;
  const railFilter = query.fundingRail ?? null;

  // ── STORE_CASH: Delivery campaigns via canonical BC fundings ──
  if (!railFilter || railFilter === "STORE_CASH") {
    let fundQ = sb
      .from(DELIVERY_AD_CANONICAL_BC_FUNDINGS_TABLE)
      .select(
        "id, application_id, store_id, owner_user_id, product_kind, status, amount_minor, spend_ledger_id, refund_ledger_id, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (storeFilter) fundQ = fundQ.eq("store_id", storeFilter);
    const { data: fundings } = await fundQ;
    for (const row of (fundings ?? []) as Array<Record<string, unknown>>) {
      const appId = String(row.application_id ?? "").trim();
      const storeId = String(row.store_id ?? "").trim() || null;
      const productKind = String(row.product_kind ?? "").trim();
      const isPopup = productKind === "platform_popup";
      const isPartner = productKind === "partner";
      const family = isPartner
        ? ("partner" as const)
        : isPopup
          ? ("platform_popup_owner_request" as const)
          : ("delivery_campaign" as const);
      const spendId = row.spend_ledger_id == null ? null : String(row.spend_ledger_id);
      const refundId = row.refund_ledger_id == null ? null : String(row.refund_ledger_id);
      const amountMinor = Math.trunc(Number(row.amount_minor) || 0);
      out.push({
        adId: appId,
        adProduct: productKind || "delivery_ad",
        domain: isPopup ? "platform_popup" : isPartner ? "partner" : "delivery",
        applicantType: "owner",
        memberId: null,
        ownerId: row.owner_user_id == null ? null : String(row.owner_user_id),
        storeId,
        fundingRail: "STORE_CASH",
        walletType: "CASH",
        price: moneyMajorFromMinor(amountMinor),
        priceMinor: amountMinor,
        currency: "PHP",
        fundingTransactionId: spendId,
        holdId: null,
        captureTransactionId: spendId,
        refundTransactionId: refundId,
        status: String(row.status ?? ""),
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
          ? adminFinanceLedgerHref({
              wallet: "cash",
              storeId,
              ledgerId: spendId,
              adId: appId,
            })
          : adminFinanceLedgerHref({ wallet: "cash", ledgerId: spendId, adId: appId }),
      });
    }
  }

  // ── MEMBER_POINT: Feed banner holds/requests ──
  if ((!railFilter || railFilter === "MEMBER_POINT") && !storeFilter) {
    let reqQ = sb
      .from("feed_ad_requests")
      .select(
        "id, user_id, status, point_cost, domain, product_id, created_at, reviewed_at, reviewed_by, campaign_id"
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (memberFilter) reqQ = reqQ.eq("user_id", memberFilter);
    const { data: requests } = await reqQ;
    const requestIds = ((requests ?? []) as Array<{ id?: string }>)
      .map((r) => String(r.id ?? "").trim())
      .filter(Boolean);

    const holdByRequest = new Map<string, { id: string; status: string; ledgerId: string | null }>();
    if (requestIds.length > 0) {
      const { data: holds } = await sb
        .from("feed_ad_point_holds")
        .select("id, request_id, status, spend_ledger_id, release_ledger_id")
        .in("request_id", requestIds);
      for (const h of (holds ?? []) as Array<Record<string, unknown>>) {
        const rid = String(h.request_id ?? "").trim();
        if (!rid) continue;
        holdByRequest.set(rid, {
          id: String(h.id ?? ""),
          status: String(h.status ?? ""),
          ledgerId: h.spend_ledger_id == null ? null : String(h.spend_ledger_id),
        });
      }
    }

    for (const row of (requests ?? []) as Array<Record<string, unknown>>) {
      const id = String(row.id ?? "").trim();
      if (!id) continue;
      const hold = holdByRequest.get(id);
      const pointCost = Math.trunc(Number(row.point_cost) || 0);
      const domain = String(row.domain ?? "community");
      out.push({
        adId: id,
        adProduct: domain.includes("trade") ? "trade_banner" : "community_banner",
        domain,
        applicantType: "member",
        memberId: row.user_id == null ? null : String(row.user_id),
        ownerId: null,
        storeId: null,
        fundingRail: "MEMBER_POINT",
        walletType: "POINT",
        price: pointCost,
        priceMinor: null,
        currency: "POINT",
        fundingTransactionId: hold?.ledgerId ?? null,
        holdId: hold?.id ?? null,
        captureTransactionId: hold?.status === "captured" ? hold.ledgerId : null,
        refundTransactionId: null,
        status: String(row.status ?? ""),
        approvedBy: row.reviewed_by == null ? null : String(row.reviewed_by),
        approvedAt: row.reviewed_at == null ? null : String(row.reviewed_at),
        activeAt: null,
        expiredAt: null,
        source: "feed_ad_requests",
        legacy: false,
        legacyLabel: null,
        family: "feed_request",
        adDetailHref: adminAdDetailHref({ family: "feed_request", id }),
        financeHref: adminFinanceLedgerHref({
          wallet: "point",
          ledgerId: hold?.ledgerId,
          adId: id,
        }),
      });
    }

    // Boost orders
    let boostQ = sb
      .from("point_promotion_orders")
      .select(
        "id, user_id, product_id, domain, status, point_cost, created_at, start_at, end_at, post_id"
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (memberFilter) boostQ = boostQ.eq("user_id", memberFilter);
    const { data: boosts } = await boostQ;
    for (const row of (boosts ?? []) as Array<Record<string, unknown>>) {
      const id = String(row.id ?? "").trim();
      if (!id) continue;
      const domain = String(row.domain ?? "community");
      const pointCost = Math.trunc(Number(row.point_cost) || 0);
      out.push({
        adId: id,
        adProduct: domain.includes("trade") ? "trade_boost" : "community_boost",
        domain,
        applicantType: "member",
        memberId: row.user_id == null ? null : String(row.user_id),
        ownerId: null,
        storeId: null,
        fundingRail: "MEMBER_POINT",
        walletType: "POINT",
        price: pointCost,
        priceMinor: null,
        currency: "POINT",
        fundingTransactionId: null,
        holdId: null,
        captureTransactionId: null,
        refundTransactionId: null,
        status: String(row.status ?? ""),
        approvedBy: null,
        approvedAt: null,
        activeAt: row.start_at == null ? null : String(row.start_at),
        expiredAt: row.end_at == null ? null : String(row.end_at),
        source: "point_promotion_orders",
        legacy: false,
        legacyLabel: null,
        family: "boost_order",
        adDetailHref: adminAdDetailHref({ family: "boost_order", id }),
        financeHref: adminFinanceLedgerHref({ wallet: "point", adId: id }),
      });
    }
  }

  // ── ADMIN_DIRECT: platform popup campaigns (no funding TX) ──
  if (!railFilter || railFilter === "ADMIN_DIRECT") {
    if (!storeFilter && !memberFilter) {
      const { data: popups } = await sb
        .from("platform_popup_campaigns")
        .select("id, status, source_kind, created_at, activated_at, ended_at, created_by")
        .order("created_at", { ascending: false })
        .limit(Math.min(limit, 40));
      for (const row of (popups ?? []) as Array<Record<string, unknown>>) {
        const sourceKind = String(row.source_kind ?? "").toLowerCase();
        if (sourceKind && !sourceKind.includes("admin") && sourceKind !== "dibay_first_party") {
          continue;
        }
        const id = String(row.id ?? "").trim();
        if (!id) continue;
        out.push({
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
          status: String(row.status ?? ""),
          approvedBy: row.created_by == null ? null : String(row.created_by),
          approvedAt: null,
          activeAt: row.activated_at == null ? null : String(row.activated_at),
          expiredAt: row.ended_at == null ? null : String(row.ended_at),
          source: "platform_popup_campaigns",
          legacy: false,
          legacyLabel: null,
          family: "platform_popup_campaign",
          adDetailHref: adminAdDetailHref({ family: "platform_popup_campaign", id }),
          financeHref: null,
        });
      }
    }
  }

  // Sort newest first
  out.sort((a, b) => {
    const ta = a.activeAt || a.approvedAt || "";
    const tb = b.activeAt || b.approvedAt || "";
    return tb.localeCompare(ta);
  });

  return out.slice(0, limit);
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
