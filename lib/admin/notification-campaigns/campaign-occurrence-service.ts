import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampaignAudiencePreview } from "@/lib/admin/notification-campaigns/campaign-audience-preview";
import { buildCampaignContentSnapshot } from "@/lib/admin/notification-campaigns/campaign-content-snapshot";
import type {
  AdminNotificationCampaignOccurrenceRow,
  CampaignAudienceSnapshot,
  OccurrenceStatus,
} from "@/lib/admin/notification-campaigns/campaign-occurrence-types";
import type { AdminNotificationCampaignRow } from "@/lib/admin/notification-campaigns/campaign-types";
import { randomUUID } from "node:crypto";

export function newOccurrenceIdempotencyKey(prefix = "occ"): string {
  return `${prefix}:${randomUUID()}`;
}

export function audiencePreviewToSnapshot(
  preview: CampaignAudiencePreview,
  resolvedAt: string
): CampaignAudienceSnapshot {
  return {
    target_member_count: preview.totalUsers,
    push_eligible_member_count: preview.pushEligibleUsers,
    push_device_count: preview.activeDevices,
    in_app_member_count: preview.inAppEligibleUsers,
    android_devices: preview.androidDevices,
    ios_devices: preview.iosDevices,
    web_devices: preview.webDevices,
    resolved_at: resolvedAt,
  };
}

export async function ensureCampaignOccurrence(
  svc: SupabaseClient,
  input: {
    campaignId: string;
    /** 비우면 DB 함수가 캠페인 행을 잠그고 다음 번호를 배정한다 (확정 설계 B-12 · 동시 생성 경쟁 방지). */
    sequenceNumber?: number | null;
    triggerType: string;
    scheduledFor?: string | null;
    idempotencyKey?: string | null;
    triggeredBy?: string | null;
    campaign: Pick<
      AdminNotificationCampaignRow,
      | "title"
      | "body"
      | "type"
      | "channel"
      | "target_type"
      | "deeplink_url"
      | "web_url"
      | "push_image_url"
      | "in_app_image_url"
    >;
    audienceSnapshot?: CampaignAudienceSnapshot;
  }
): Promise<{ ok: true; occurrence: AdminNotificationCampaignOccurrenceRow } | { ok: false; error: string }> {
  const contentSnapshot = buildCampaignContentSnapshot(input.campaign);
  const { data, error } = await svc.rpc("ensure_admin_notification_campaign_occurrence", {
    p_campaign_id: input.campaignId,
    p_sequence_number: input.sequenceNumber ?? null,
    p_trigger_type: input.triggerType,
    p_scheduled_for: input.scheduledFor ?? null,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_triggered_by: input.triggeredBy ?? null,
    p_content_snapshot: contentSnapshot,
    p_now: new Date().toISOString(),
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = (Array.isArray(data) ? data[0] : data) as AdminNotificationCampaignOccurrenceRow | null;
  if (!row?.id) {
    return { ok: false, error: "occurrence_insert_failed" };
  }

  if (input.audienceSnapshot) {
    await svc
      .from("admin_notification_campaign_occurrences")
      .update({
        audience_snapshot: input.audienceSnapshot,
        target_member_count: input.audienceSnapshot.target_member_count,
        push_eligible_member_count: input.audienceSnapshot.push_eligible_member_count,
        push_device_count: input.audienceSnapshot.push_device_count,
        in_app_member_count: input.audienceSnapshot.in_app_member_count,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  }

  return { ok: true, occurrence: row };
}

export async function getCampaignOccurrence(
  svc: SupabaseClient,
  occurrenceId: string
): Promise<AdminNotificationCampaignOccurrenceRow | null> {
  const { data } = await svc
    .from("admin_notification_campaign_occurrences")
    .select("*")
    .eq("id", occurrenceId)
    .maybeSingle();
  return (data as AdminNotificationCampaignOccurrenceRow | null) ?? null;
}

export async function listCampaignOccurrences(
  svc: SupabaseClient,
  campaignId: string,
  limit = 50
): Promise<AdminNotificationCampaignOccurrenceRow[]> {
  const { data } = await svc
    .from("admin_notification_campaign_occurrences")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("sequence_number", { ascending: false })
    .limit(limit);
  return (data ?? []) as AdminNotificationCampaignOccurrenceRow[];
}

export async function cancelQueuedOccurrence(
  svc: SupabaseClient,
  occurrenceId: string,
  cancelledBy: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { data, error } = await svc
    .from("admin_notification_campaign_occurrences")
    .update({
      status: "cancelled",
      cancelled_at: now,
      cancelled_by: cancelledBy,
      updated_at: now,
    })
    .eq("id", occurrenceId)
    .eq("status", "queued")
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "occurrence_not_cancellable" };
  return { ok: true };
}

export async function claimDueOccurrence(
  svc: SupabaseClient,
  opts?: { claimToken?: string; now?: string }
): Promise<AdminNotificationCampaignOccurrenceRow | null> {
  const claimToken = opts?.claimToken?.trim() || randomUUID();
  const { data, error } = await svc.rpc("claim_due_admin_notification_campaign_occurrence", {
    p_claim_token: claimToken,
    p_now: opts?.now ?? new Date().toISOString(),
    p_lease_seconds: 600,
  });
  if (error) {
    console.error("[claimDueOccurrence]", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  return row as AdminNotificationCampaignOccurrenceRow;
}

export type ClaimOccurrenceSendResult = {
  claimed: boolean;
  alreadyRunning: boolean;
  occurrence: AdminNotificationCampaignOccurrenceRow | null;
  error?: string;
};

export async function claimOccurrenceSend(
  svc: SupabaseClient,
  occurrenceId: string,
  opts: { idempotencyKey?: string | null; claimToken?: string }
): Promise<ClaimOccurrenceSendResult> {
  const claimToken = opts.claimToken?.trim() || randomUUID();
  const { data, error } = await svc.rpc("claim_admin_notification_campaign_occurrence_send", {
    p_occurrence_id: occurrenceId,
    p_idempotency_key: opts.idempotencyKey ?? null,
    p_claim_token: claimToken,
    p_now: new Date().toISOString(),
    p_lease_seconds: 600,
  });

  if (error) {
    return { claimed: false, alreadyRunning: false, occurrence: null, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    return { claimed: false, alreadyRunning: false, occurrence: null, error: "not_found" };
  }

  return {
    claimed: Boolean((row as { claimed?: unknown }).claimed),
    alreadyRunning: Boolean((row as { already_running?: unknown }).already_running),
    occurrence: (row as { occurrence?: AdminNotificationCampaignOccurrenceRow }).occurrence ?? null,
  };
}

export function resolveFinalOccurrenceStatus(
  pushFailed: number,
  pushSent: number,
  inAppFailed: number,
  inAppSent: number
): OccurrenceStatus {
  const failed = pushFailed + inAppFailed;
  const sent = pushSent + inAppSent;
  if (failed > 0 && sent > 0) return "partially_failed";
  if (failed > 0 && sent === 0) return "failed";
  return "sent";
}

/**
 * 반복 발송 몇 번째인지 — `trigger_type='recurring'` 회차만 센다(테스트·즉시 회차 제외 · 확정 설계 B-12).
 * 최대 횟수 판정과 직전 반복 회차(다음 시각 계산 기준)를 함께 돌려준다.
 */
export async function loadRecurringOccurrenceProgress(
  svc: SupabaseClient,
  campaignId: string
): Promise<{ nextIndex: number; last: { scheduled_for: string | null; completed_at: string | null } | null }> {
  const { data, count } = await svc
    .from("admin_notification_campaign_occurrences")
    .select("scheduled_for, completed_at", { count: "exact" })
    .eq("campaign_id", campaignId)
    .eq("trigger_type", "recurring")
    .order("sequence_number", { ascending: false })
    .limit(1);
  const last = ((data ?? [])[0] as { scheduled_for: string | null; completed_at: string | null } | undefined) ?? null;
  return { nextIndex: Math.max(0, count ?? 0) + 1, last };
}
