/**
 * Feed Banner renewal — Point spend ↔ period extension (PHASE 3).
 *
 * Financial invariant (same class as PHASE 1):
 *   SPENT Point + period NOT extended = forbidden (refund on failure)
 *   Period extended + Point NOT spent = forbidden
 *
 * Reuses point_ledger (relatedType feed_ad_request) + existing campaign/request rows.
 * NO new renewals table.
 *
 * Unchanged creative/destination → auto extend (no re-review).
 * Changed creative/destination → reject here; member must new PHASE 2 request.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getFeedAdProduct } from "@/lib/ads/feed-ad-products";
import { computeFeedAdRenewalEndAt } from "@/lib/ads/feed-ad-member-presentation";
import {
  creditUserPoints,
  spendUserPoints,
} from "@/lib/points/user-point-ledger";

export type RenewFeedAdCampaignResult =
  | {
      ok: true;
      campaignId: string;
      endAt: string;
      pointCost: number;
      idempotentReplay?: boolean;
    }
  | { ok: false; error: string; httpStatus: number };

function renewLedgerId(campaignId: string, idempotencyKey: string): string {
  return `renew:${campaignId}:${idempotencyKey}`.slice(0, 200);
}

function renewRefundLedgerId(campaignId: string, idempotencyKey: string): string {
  return `renew-refund:${campaignId}:${idempotencyKey}`.slice(0, 200);
}

async function hasLedgerEntry(
  sb: SupabaseClient,
  userId: string,
  relatedId: string
): Promise<boolean> {
  const { data } = await sb
    .from("point_ledger")
    .select("id")
    .eq("user_id", userId)
    .eq("related_type", "feed_ad_request")
    .eq("related_id", relatedId)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

export async function renewFeedAdCampaign(
  sb: SupabaseClient,
  params: {
    userId: string;
    campaignId: string;
    productId: string;
    idempotencyKey: string;
    /** If true, reject — caller must open new review request instead. */
    creativeOrDestinationChanged?: boolean;
    nowMs?: number;
  }
): Promise<RenewFeedAdCampaignResult> {
  const campaignId = params.campaignId.trim();
  const idem = params.idempotencyKey.trim().slice(0, 128);
  const nowMs = params.nowMs ?? Date.now();

  if (!campaignId || !idem) {
    return { ok: false, error: "missing_id", httpStatus: 400 };
  }
  if (params.creativeOrDestinationChanged) {
    return { ok: false, error: "re_review_required", httpStatus: 409 };
  }

  const product = await getFeedAdProduct(sb, params.productId);
  if (!product) {
    return { ok: false, error: "product_not_found", httpStatus: 400 };
  }

  const { data: camp, error: campErr } = await sb
    .from("feed_ad_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (campErr || !camp) {
    return { ok: false, error: "not_found", httpStatus: 404 };
  }

  const row = camp as Record<string, unknown>;
  const source = String(row.source ?? "");
  if (source !== "MEMBER_REQUESTED") {
    return { ok: false, error: "not_member_campaign", httpStatus: 403 };
  }

  const requestId = row.request_id != null ? String(row.request_id) : "";
  if (!requestId) {
    return { ok: false, error: "request_missing", httpStatus: 409 };
  }

  const { data: reqRow, error: reqErr } = await sb
    .from("feed_ad_requests")
    .select("id, user_id, status, domain")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr || !reqRow) {
    return { ok: false, error: "request_missing", httpStatus: 404 };
  }
  if (String((reqRow as { user_id?: string }).user_id) !== params.userId) {
    return { ok: false, error: "forbidden", httpStatus: 403 };
  }

  const reqStatus = String((reqRow as { status?: string }).status ?? "");
  if (reqStatus === "pending_review" || reqStatus === "rejected" || reqStatus === "cancelled") {
    return { ok: false, error: "not_renewable", httpStatus: 409 };
  }

  const campDomain = String(row.domain ?? "");
  if (product.domain !== campDomain) {
    return { ok: false, error: "domain_mismatch", httpStatus: 400 };
  }

  const campStatus = String(row.status ?? "");
  if (campStatus !== "active" && campStatus !== "ended" && campStatus !== "paused") {
    return { ok: false, error: "not_renewable", httpStatus: 409 };
  }

  const currentEndAt = row.end_at != null ? String(row.end_at) : null;
  const newEndAt = computeFeedAdRenewalEndAt({
    currentEndAt,
    durationDays: product.durationDays,
    nowMs,
  });

  const relatedId = renewLedgerId(campaignId, idem);
  const refundId = renewRefundLedgerId(campaignId, idem);

  const alreadySpent = await hasLedgerEntry(sb, params.userId, relatedId);
  const alreadyRefunded = await hasLedgerEntry(sb, params.userId, refundId);

  if (alreadySpent && alreadyRefunded) {
    return { ok: false, error: "idempotency_consumed", httpStatus: 409 };
  }

  async function applyExtension(): Promise<RenewFeedAdCampaignResult> {
    const nowIso = new Date(nowMs).toISOString();
    const { data: updated, error: updErr } = await sb
      .from("feed_ad_campaigns")
      .update({
        end_at: newEndAt,
        status: "active",
        updated_at: nowIso,
      })
      .eq("id", campaignId)
      .select("id, end_at")
      .maybeSingle();
    if (updErr || !updated?.id) {
      return { ok: false, error: updErr?.message ?? "extension_failed", httpStatus: 500 };
    }
    await sb
      .from("feed_ad_requests")
      .update({
        status: "active",
        end_at: newEndAt,
        duration_days: product!.durationDays,
        point_cost: product!.pointCost,
        product_id: product!.id,
        updated_at: nowIso,
      })
      .eq("id", requestId)
      .eq("user_id", params.userId);
    return {
      ok: true,
      campaignId,
      endAt: String((updated as { end_at?: string }).end_at ?? newEndAt),
      pointCost: product!.pointCost,
    };
  }

  if (alreadySpent && !alreadyRefunded) {
    if (currentEndAt) {
      const t = Date.parse(currentEndAt);
      const target = Date.parse(newEndAt);
      if (Number.isFinite(t) && Number.isFinite(target) && t >= target - 1000) {
        return {
          ok: true,
          campaignId,
          endAt: currentEndAt,
          pointCost: product.pointCost,
          idempotentReplay: true,
        };
      }
    }
    const recovered = await applyExtension();
    if (recovered.ok) return { ...recovered, idempotentReplay: true };
    return recovered;
  }

  const spent = await spendUserPoints(sb, {
    userId: params.userId,
    amount: product.pointCost,
    entryType: "ad_purchase",
    relatedType: "feed_ad_request",
    relatedId,
    description: `피드 배너 연장 — ${product.durationDays}일 (${product.pointCost}P)`,
    actorType: "user",
  });
  if (!spent.ok) {
    return {
      ok: false,
      error: spent.code === "insufficient_balance" ? "insufficient_balance" : spent.error,
      httpStatus: spent.code === "insufficient_balance" ? 402 : 500,
    };
  }

  const extended = await applyExtension();
  if (!extended.ok) {
    await creditUserPoints(sb, {
      userId: params.userId,
      amount: product.pointCost,
      entryType: "ad_refund",
      relatedType: "feed_ad_request",
      relatedId: refundId,
      description: "피드 배너 연장 실패 — 포인트 환급",
      actorType: "system",
    });
    return extended;
  }
  return extended;
}
