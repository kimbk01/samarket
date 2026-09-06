/**
 * Admin pause / resume Feed Banner campaign — canonical writer.
 * pause ⇒ status=paused (not feed-eligible). resume ⇒ status=active when still in window.
 * No Point refund / no period change.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type PauseResumeFeedAdCampaignResult =
  | { ok: true; status: "paused" | "active"; campaignId: string; requestId: string | null }
  | { ok: false; error: string; httpStatus: number };

async function resolveCampaign(
  sb: SupabaseClient,
  input: { campaignId?: string | null; requestId?: string | null }
): Promise<
  | { ok: true; campaignId: string; requestId: string | null; status: string; endAt: string | null }
  | { ok: false; error: string; httpStatus: number }
> {
  let campaignId = (input.campaignId ?? "").trim();
  const requestId = (input.requestId ?? "").trim() || null;

  if (!campaignId && requestId) {
    const { data: req } = await sb
      .from("feed_ad_requests")
      .select("id, campaign_id")
      .eq("id", requestId)
      .maybeSingle();
    if (!req?.id) return { ok: false, error: "not_found", httpStatus: 404 };
    campaignId = String((req as { campaign_id?: string | null }).campaign_id ?? "").trim();
    if (!campaignId) return { ok: false, error: "no_campaign", httpStatus: 409 };
  }
  if (!campaignId) return { ok: false, error: "missing_campaign", httpStatus: 400 };

  const { data: camp, error } = await sb
    .from("feed_ad_campaigns")
    .select("id, status, request_id, end_at")
    .eq("id", campaignId)
    .maybeSingle();
  if (error || !camp?.id) return { ok: false, error: "not_found", httpStatus: 404 };

  const linked =
    requestId ||
    ((camp as { request_id?: string | null }).request_id != null
      ? String((camp as { request_id: string }).request_id)
      : null);

  return {
    ok: true,
    campaignId,
    requestId: linked,
    status: String((camp as { status?: string }).status ?? "").toLowerCase(),
    endAt:
      (camp as { end_at?: string | null }).end_at != null
        ? String((camp as { end_at: string }).end_at)
        : null,
  };
}

export async function pauseFeedAdCampaign(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    campaignId?: string | null;
    requestId?: string | null;
    reason?: string | null;
  }
): Promise<PauseResumeFeedAdCampaignResult> {
  if (!input.adminUserId.trim()) {
    return { ok: false, error: "missing_admin", httpStatus: 400 };
  }
  const resolved = await resolveCampaign(sb, input);
  if (!resolved.ok) return resolved;

  if (resolved.status === "paused") {
    return {
      ok: true,
      status: "paused",
      campaignId: resolved.campaignId,
      requestId: resolved.requestId,
    };
  }
  if (resolved.status !== "active" && resolved.status !== "scheduled") {
    return { ok: false, error: "not_pausable", httpStatus: 409 };
  }

  const now = new Date().toISOString();
  const reason = (input.reason ?? "").trim() || "admin_paused";
  const { data: updated, error } = await sb
    .from("feed_ad_campaigns")
    .update({
      status: "paused",
      updated_at: now,
      admin_memo: reason.slice(0, 500),
    })
    .eq("id", resolved.campaignId)
    .in("status", ["active", "scheduled"])
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message, httpStatus: 500 };
  if (!updated?.id) return { ok: false, error: "not_pausable", httpStatus: 409 };

  return {
    ok: true,
    status: "paused",
    campaignId: resolved.campaignId,
    requestId: resolved.requestId,
  };
}

export async function resumeFeedAdCampaign(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    campaignId?: string | null;
    requestId?: string | null;
    reason?: string | null;
  }
): Promise<PauseResumeFeedAdCampaignResult> {
  if (!input.adminUserId.trim()) {
    return { ok: false, error: "missing_admin", httpStatus: 400 };
  }
  const resolved = await resolveCampaign(sb, input);
  if (!resolved.ok) return resolved;

  if (resolved.status === "active") {
    return {
      ok: true,
      status: "active",
      campaignId: resolved.campaignId,
      requestId: resolved.requestId,
    };
  }
  if (resolved.status !== "paused") {
    return { ok: false, error: "not_resumable", httpStatus: 409 };
  }
  if (resolved.endAt) {
    const endMs = new Date(resolved.endAt).getTime();
    if (Number.isFinite(endMs) && endMs <= Date.now()) {
      return { ok: false, error: "window_ended", httpStatus: 409 };
    }
  }

  const now = new Date().toISOString();
  const reason = (input.reason ?? "").trim() || "admin_resumed";
  const { data: updated, error } = await sb
    .from("feed_ad_campaigns")
    .update({
      status: "active",
      updated_at: now,
      admin_memo: reason.slice(0, 500),
    })
    .eq("id", resolved.campaignId)
    .eq("status", "paused")
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message, httpStatus: 500 };
  if (!updated?.id) return { ok: false, error: "not_resumable", httpStatus: 409 };

  return {
    ok: true,
    status: "active",
    campaignId: resolved.campaignId,
    requestId: resolved.requestId,
  };
}
