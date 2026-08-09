/**
 * Admin end Feed Banner campaign — ops writer.
 *
 * CONTRACT:
 * - campaign → ended (end_at = now)
 * - linked request → ended
 * - Feed eligibility drops immediately (status !== active)
 * - NO automatic D-Point refund (CAPTURE already settled)
 *
 * ADMIN_END_REFUND_POLICY_REQUIRED: refund is intentionally NOT implemented.
 * Product must reopen financial LOCK before any credit-on-end path.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type EndFeedAdCampaignResult =
  | { ok: true; status: "ended"; campaignId: string; requestId: string | null }
  | { ok: false; error: string; httpStatus: number };

export async function endFeedAdCampaign(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    /** Prefer campaign id; requestId used to resolve campaign when needed. */
    campaignId?: string | null;
    requestId?: string | null;
    reason?: string | null;
  }
): Promise<EndFeedAdCampaignResult> {
  const adminUserId = input.adminUserId.trim();
  if (!adminUserId) {
    return { ok: false, error: "missing_admin", httpStatus: 400 };
  }

  let campaignId = (input.campaignId ?? "").trim();
  const requestId = (input.requestId ?? "").trim() || null;

  if (!campaignId && requestId) {
    const { data: req } = await sb
      .from("feed_ad_requests")
      .select("id, campaign_id, status")
      .eq("id", requestId)
      .maybeSingle();
    if (!req?.id) {
      return { ok: false, error: "not_found", httpStatus: 404 };
    }
    campaignId = String((req as { campaign_id?: string | null }).campaign_id ?? "").trim();
    if (!campaignId) {
      return { ok: false, error: "no_campaign", httpStatus: 409 };
    }
  }

  if (!campaignId) {
    return { ok: false, error: "missing_campaign", httpStatus: 400 };
  }

  const { data: camp, error: campFetchErr } = await sb
    .from("feed_ad_campaigns")
    .select("id, status, request_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (campFetchErr || !camp?.id) {
    return { ok: false, error: "not_found", httpStatus: 404 };
  }

  const st = String((camp as { status?: string }).status ?? "").toLowerCase();
  if (st === "ended") {
    return {
      ok: true,
      status: "ended",
      campaignId,
      requestId:
        requestId ||
        ((camp as { request_id?: string | null }).request_id != null
          ? String((camp as { request_id: string }).request_id)
          : null),
    };
  }
  if (st !== "active" && st !== "scheduled" && st !== "paused" && st !== "draft") {
    return { ok: false, error: "not_endable", httpStatus: 409 };
  }

  const now = new Date().toISOString();
  const reason = (input.reason ?? "").trim() || "admin_ended";

  const { data: endedCamp, error: endErr } = await sb
    .from("feed_ad_campaigns")
    .update({
      status: "ended",
      end_at: now,
      updated_at: now,
      admin_memo: reason.slice(0, 500),
    })
    .eq("id", campaignId)
    .in("status", ["active", "scheduled", "paused", "draft"])
    .select("id, request_id")
    .maybeSingle();

  if (endErr) {
    return { ok: false, error: endErr.message, httpStatus: 500 };
  }
  if (!endedCamp?.id) {
    return { ok: false, error: "not_endable", httpStatus: 409 };
  }

  const linkedRequestId =
    requestId ||
    ((endedCamp as { request_id?: string | null }).request_id != null
      ? String((endedCamp as { request_id: string }).request_id)
      : null);

  if (linkedRequestId) {
    await sb
      .from("feed_ad_requests")
      .update({
        status: "ended",
        review_reason: reason.slice(0, 500),
        reviewed_by: adminUserId,
        reviewed_at: now,
        updated_at: now,
        end_at: now,
      })
      .eq("id", linkedRequestId)
      .in("status", ["active", "approved", "pending_review"]);
  }

  return {
    ok: true,
    status: "ended",
    campaignId,
    requestId: linkedRequestId,
  };
}
