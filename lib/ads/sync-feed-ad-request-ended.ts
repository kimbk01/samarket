/**
 * Keep feed_ad_requests terminal when its campaign is ended.
 *
 * CONTRACT:
 * - Campaign end writers MUST call this (or endFeedAdCampaign which does).
 * - Idempotent: already-ended request is a no-op success.
 * - Does NOT refund (CAPTURE settled). ADMIN_END_REFUND_POLICY_REQUIRED untouched.
 * - Does NOT invent feed eligibility — feed reads campaign status/window/creatives.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type SyncFeedAdRequestEndedResult =
  | { ok: true; requestId: string; updated: boolean }
  | { ok: false; error: string };

export async function syncFeedAdRequestEndedWithCampaign(
  sb: SupabaseClient,
  input: {
    requestId: string;
    reason?: string | null;
    actorUserId?: string | null;
    endAt?: string | null;
    nowIso?: string;
  }
): Promise<SyncFeedAdRequestEndedResult> {
  const requestId = input.requestId.trim();
  if (!requestId) {
    return { ok: false, error: "missing_request" };
  }
  const now = input.nowIso ?? new Date().toISOString();
  const reason = (input.reason ?? "").trim() || "campaign_ended";
  const endAt = input.endAt ?? now;

  const { data: existing, error: fetchErr } = await sb
    .from("feed_ad_requests")
    .select("id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (fetchErr) {
    return { ok: false, error: fetchErr.message };
  }
  if (!existing?.id) {
    return { ok: false, error: "not_found" };
  }
  const st = String((existing as { status?: string }).status ?? "").toLowerCase();
  if (st === "ended" || st === "rejected" || st === "cancelled") {
    return { ok: true, requestId, updated: false };
  }

  const patch: Record<string, unknown> = {
    status: "ended",
    end_at: endAt,
    review_reason: reason.slice(0, 500),
    updated_at: now,
  };
  if (input.actorUserId) {
    patch.reviewed_by = input.actorUserId;
    patch.reviewed_at = now;
  }

  const { data: updated, error: updErr } = await sb
    .from("feed_ad_requests")
    .update(patch)
    .eq("id", requestId)
    .in("status", ["active", "approved", "pending_review"])
    .select("id")
    .maybeSingle();

  if (updErr) {
    return { ok: false, error: updErr.message };
  }
  return { ok: true, requestId, updated: Boolean(updated?.id) };
}
