/**
 * Admin pause / resume Feed Banner campaign — canonical writer.
 * pause ⇒ status=paused (not feed-eligible). resume ⇒ status=active when still in window.
 * No Point refund / no period change.
 *
 * FB-M11 · D-5 (2026-11-04): 새 경로는 `lib/ads/admin-feed-ad-lifecycle.ts`(DB 함수 `admin_feed_ad_pause`·`_resume` —
 * 정지 기간 보전 · paused_by · 공개 사유). 이 파일은 옛 호출처가 옮겨 갈 때까지 남는다.
 * 빈 사유를 코드값(`admin_paused`/`admin_resumed`)으로 저장하던 것은 지웠다 — 사유가 없으면 메모를 덮어쓰지 않는다.
 * 정지하면 `paused_by='admin'`·`paused_at` 을 남겨 회원 화면이 「운영자가 멈췄습니다」를 추정 없이 보인다.
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
  const reason = (input.reason ?? "").trim();
  const { data: updated, error } = await sb
    .from("feed_ad_campaigns")
    .update({
      status: "paused",
      paused_by: "admin",
      paused_at: now,
      updated_at: now,
      ...(reason ? { admin_memo: reason.slice(0, 500) } : {}),
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
  const reason = (input.reason ?? "").trim();
  const { data: updated, error } = await sb
    .from("feed_ad_campaigns")
    .update({
      status: "active",
      paused_by: null,
      paused_at: null,
      updated_at: now,
      ...(reason ? { admin_memo: reason.slice(0, 500) } : {}),
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
