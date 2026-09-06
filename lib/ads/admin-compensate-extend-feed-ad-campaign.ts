/**
 * Admin Feed Banner period extension — COMPENSATION only (no Point spend).
 * Paid renew remains Member `renewFeedAdCampaign` FULL_CHAIN.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminExtendFeedAdResult =
  | {
      ok: true;
      previousEndAt: string;
      newEndAt: string;
      daysAdded: number;
      extensionKind: "ADMIN_FREE_COMPENSATION";
    }
  | { ok: false; error: string; httpStatus: number };

export async function adminCompensateExtendFeedAdCampaign(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    campaignId?: string | null;
    requestId?: string | null;
    requestedDays: number;
    reason: string;
  }
): Promise<AdminExtendFeedAdResult> {
  const adminUserId = input.adminUserId.trim();
  const reason = input.reason.trim();
  if (!adminUserId) return { ok: false, error: "missing_admin", httpStatus: 400 };
  if (!reason) return { ok: false, error: "reason_required", httpStatus: 400 };
  if (!Number.isInteger(input.requestedDays) || input.requestedDays < 1 || input.requestedDays > 90) {
    return { ok: false, error: "days_out_of_range", httpStatus: 400 };
  }

  let campaignId = (input.campaignId ?? "").trim();
  const requestId = (input.requestId ?? "").trim() || null;
  if (!campaignId && requestId) {
    const { data: req } = await sb
      .from("feed_ad_requests")
      .select("id, campaign_id")
      .eq("id", requestId)
      .maybeSingle();
    campaignId = String((req as { campaign_id?: string | null } | null)?.campaign_id ?? "").trim();
  }
  if (!campaignId) return { ok: false, error: "missing_campaign", httpStatus: 400 };

  const { data: camp, error } = await sb
    .from("feed_ad_campaigns")
    .select("id, status, end_at, request_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (error || !camp?.id) return { ok: false, error: "not_found", httpStatus: 404 };

  const st = String((camp as { status?: string }).status ?? "").toLowerCase();
  if (st !== "active" && st !== "scheduled" && st !== "paused") {
    return { ok: false, error: "not_extendable", httpStatus: 409 };
  }
  const previousEndAt = String((camp as { end_at?: string | null }).end_at ?? "");
  if (!previousEndAt) return { ok: false, error: "invalid_end", httpStatus: 409 };
  const prevMs = Date.parse(previousEndAt);
  if (!Number.isFinite(prevMs)) return { ok: false, error: "invalid_end", httpStatus: 409 };

  const base = Math.max(prevMs, Date.now());
  const newEnd = new Date(base);
  newEnd.setUTCDate(newEnd.getUTCDate() + input.requestedDays);
  const newEndAt = newEnd.toISOString();
  const now = new Date().toISOString();

  const { error: updErr } = await sb
    .from("feed_ad_campaigns")
    .update({
      end_at: newEndAt,
      updated_at: now,
      admin_memo: `extend_compensation:${reason}`.slice(0, 500),
    })
    .eq("id", campaignId)
    .in("status", ["active", "scheduled", "paused"]);
  if (updErr) return { ok: false, error: updErr.message, httpStatus: 500 };

  const linkedRequest =
    requestId ||
    ((camp as { request_id?: string | null }).request_id != null
      ? String((camp as { request_id: string }).request_id)
      : null);
  if (linkedRequest) {
    await sb
      .from("feed_ad_requests")
      .update({
        end_at: newEndAt,
        updated_at: now,
        review_reason: `admin_extend_compensation:${reason}`.slice(0, 500),
      })
      .eq("id", linkedRequest);
  }

  return {
    ok: true,
    previousEndAt,
    newEndAt,
    daysAdded: input.requestedDays,
    extensionKind: "ADMIN_FREE_COMPENSATION",
  };
}
