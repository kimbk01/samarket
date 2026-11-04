import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampaignSkipReason } from "@/lib/admin/notification-campaigns/campaign-skip-reasons";
import { resolveFinalOccurrenceStatus } from "@/lib/admin/notification-campaigns/campaign-occurrence-service";
import { readCampaignDeliveries } from "@/lib/admin/notification-campaigns/campaign-list-service";
import {
  isCampaignDeliveryReceivedStatus,
  type CampaignDeliveryChannel,
  type CampaignDeliveryStatus,
} from "@/lib/admin/notification-campaigns/campaign-types";

export type RecordCampaignDeliveryInput = {
  campaignId: string;
  occurrenceId: string;
  userId: string;
  deviceId?: string | null;
  notificationEventId?: string | null;
  channel: CampaignDeliveryChannel;
  status: CampaignDeliveryStatus;
  skipReason?: CampaignSkipReason | string | null;
  providerMessageId?: string | null;
  sentAt?: string | null;
};

export async function recordCampaignDelivery(
  svc: SupabaseClient,
  input: RecordCampaignDeliveryInput
): Promise<string | null> {
  const now = new Date().toISOString();
  const row = {
    campaign_id: input.campaignId,
    occurrence_id: input.occurrenceId,
    user_id: input.userId,
    device_id: input.deviceId ?? null,
    notification_event_id: input.notificationEventId ?? null,
    channel: input.channel,
    status: input.status,
    skip_reason: input.skipReason ?? null,
    provider_message_id: input.providerMessageId ?? null,
    sent_at: input.sentAt ?? (input.status === "sent" ? now : null),
    updated_at: now,
  };

  const { data, error } = await svc.from("notification_campaign_deliveries").insert(row).select("id").maybeSingle();

  if (error) {
    if (error.message?.includes("duplicate") || error.code === "23505") {
      return null;
    }
    console.warn("[recordCampaignDelivery]", error.message);
    // 확정 설계 B-9 — 기록 실패를 숨기지 않는다: 회차에 건수를 남겨 상세 화면 「기록 실패 N건」으로 보인다.
    await bumpOccurrenceRecordErrorCount(svc, input.occurrenceId);
    return null;
  }
  return String((data as { id?: string })?.id ?? "") || null;
}

/** Channel-separated occurrence metrics — NOT combined push+in_app sent_count. */
/**
 * `opts.terminal` (U1-B): the batch runner's "no targets remain" decision. When provided it is the
 * only completion signal; legacy callers without it keep the previous pending-targets rule.
 */
async function bumpOccurrenceRecordErrorCount(svc: SupabaseClient, occurrenceId: string): Promise<void> {
  if (!occurrenceId) return;
  try {
    const { data } = await svc
      .from("admin_notification_campaign_occurrences")
      .select("record_error_count")
      .eq("id", occurrenceId)
      .maybeSingle();
    const cur = Number((data as { record_error_count?: number } | null)?.record_error_count ?? 0);
    await svc
      .from("admin_notification_campaign_occurrences")
      .update({ record_error_count: (Number.isFinite(cur) ? cur : 0) + 1 })
      .eq("id", occurrenceId);
  } catch (e) {
    console.error("[recordCampaignDelivery] record_error_count", e instanceof Error ? e.message : e);
  }
}

export async function refreshOccurrenceMetrics(
  svc: SupabaseClient,
  occurrenceId: string,
  opts?: { terminal?: boolean }
): Promise<void> {
  // 확정 설계 B-10 — 1,000행 상한 없이 끝까지 읽는다(목록과 같은 페이지 읽기).
  // B-9 — 읽기 실패면 완료로 처리하지 않고 로그만 남긴다(다음 배치·다음 호출이 다시 집계).
  let rows: Array<Record<string, unknown>>;
  try {
    rows = await readCampaignDeliveries(svc, [occurrenceId], "channel, status");
  } catch (e) {
    console.error("[refreshOccurrenceMetrics] read failed", occurrenceId, e instanceof Error ? e.message : e);
    return;
  }

  let pushSent = 0;
  let pushSkipped = 0;
  let pushFailed = 0;
  let pushAttempted = 0;
  let inAppSent = 0;
  let inAppSkipped = 0;
  let inAppFailed = 0;
  let inAppAttempted = 0;

  for (const r of rows ?? []) {
    const channel = String((r as { channel?: string }).channel ?? "");
    const s = String((r as { status?: string }).status ?? "");
    const isPush = channel === "push";
    const isInApp = channel === "in_app";

    if (isPush) pushAttempted += 1;
    if (isInApp) inAppAttempted += 1;

    if (isCampaignDeliveryReceivedStatus(s)) {
      if (isPush) pushSent += 1;
      if (isInApp) inAppSent += 1;
    } else if (s === "skipped") {
      if (isPush) pushSkipped += 1;
      if (isInApp) inAppSkipped += 1;
    } else if (s === "failed") {
      if (isPush) pushFailed += 1;
      if (isInApp) inAppFailed += 1;
    }
  }

  const now = new Date().toISOString();

  await svc
    .from("admin_notification_campaign_occurrences")
    .update({
      push_attempted: pushAttempted,
      push_sent: pushSent,
      push_skipped: pushSkipped,
      push_failed: pushFailed,
      in_app_attempted: inAppAttempted,
      in_app_sent: inAppSent,
      in_app_skipped: inAppSkipped,
      in_app_failed: inAppFailed,
      updated_at: now,
    })
    .eq("id", occurrenceId);

  const { data: occ } = await svc
    .from("admin_notification_campaign_occurrences")
    .select("campaign_id, status, trigger_type")
    .eq("id", occurrenceId)
    .maybeSingle();

  if (!occ) return;

  const campaignId = String((occ as { campaign_id?: string }).campaign_id ?? "");
  const currentStatus = String((occ as { status?: string }).status ?? "");

  const { count: pendingTargets } = await svc
    .from("admin_notification_campaign_targets")
    .select("id", { count: "exact", head: true })
    .eq("occurrence_id", occurrenceId)
    .eq("status", "pending");

  const isDone =
    currentStatus === "sending" &&
    (typeof opts?.terminal === "boolean" ? opts.terminal : (pendingTargets ?? 0) === 0);

  if (isDone) {
    const finalStatus = resolveFinalOccurrenceStatus(pushFailed, pushSent, inAppFailed, inAppSent);
    await svc
      .from("admin_notification_campaign_occurrences")
      .update({
        status: finalStatus,
        completed_at: now,
        updated_at: now,
      })
      .eq("id", occurrenceId);

    // U1: test occurrences never change campaign status/aggregates.
    const isTestOccurrence = String((occ as { trigger_type?: string }).trigger_type ?? "") === "test";
    if (campaignId && !isTestOccurrence) {
      await syncCampaignAggregateFromOccurrences(svc, campaignId, {
        status: finalStatus,
        push_sent: pushSent,
        push_skipped: pushSkipped,
        push_failed: pushFailed,
        completed_at: now,
      });
    }
  }
}

/**
 * DEF-02: campaign.sent_count must reflect successful delivery on either channel.
 * in_app_only campaigns previously left sent_count=0 because only push_sent was written.
 */
export function resolveCampaignSentCountAggregate(pushSent: number, inAppSent: number): number {
  const push = Number.isFinite(pushSent) ? Math.max(0, pushSent) : 0;
  const inApp = Number.isFinite(inAppSent) ? Math.max(0, inAppSent) : 0;
  return Math.max(push, inApp);
}

async function syncCampaignAggregateFromOccurrences(
  svc: SupabaseClient,
  campaignId: string,
  latest: {
    status: string;
    push_sent: number;
    push_skipped: number;
    push_failed: number;
    completed_at: string;
  }
): Promise<void> {
  const { data: occRow } = await svc
    .from("admin_notification_campaign_occurrences")
    .select("target_member_count, in_app_sent, in_app_skipped, in_app_failed")
    .eq("campaign_id", campaignId)
    // 확정 설계 B-13 — 캠페인 합계 = 테스트 회차를 뺀 최신 실제 회차
    .neq("trigger_type", "test")
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: campRow } = await svc
    .from("admin_notification_campaigns")
    .select("send_mode")
    .eq("id", campaignId)
    .maybeSingle();
  // U1: recurring campaigns keep their lifecycle status (active/paused/ended) — scheduler depends on it.
  const isRecurring = String((campRow as { send_mode?: string } | null)?.send_mode ?? "") === "recurring";
  const inAppSent = Number((occRow as { in_app_sent?: number } | null)?.in_app_sent ?? 0);
  const inAppSkipped = Number((occRow as { in_app_skipped?: number } | null)?.in_app_skipped ?? 0);
  const inAppFailed = Number((occRow as { in_app_failed?: number } | null)?.in_app_failed ?? 0);

  await svc
    .from("admin_notification_campaigns")
    .update({
      sent_count: resolveCampaignSentCountAggregate(latest.push_sent, inAppSent),
      skipped_count: Math.max(latest.push_skipped, inAppSkipped),
      failed_count: Math.max(latest.push_failed, inAppFailed),
      target_count: (occRow as { target_member_count?: number } | null)?.target_member_count ?? 0,
      ...(isRecurring ? {} : { status: mapOccurrenceStatusToLegacyCampaignStatus(latest.status) }),
      sent_at: latest.completed_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);
}

function mapOccurrenceStatusToLegacyCampaignStatus(status: string): string {
  if (status === "partially_failed") return "partially_failed";
  if (status === "failed") return "failed";
  if (status === "sent") return "sent";
  if (status === "sending") return "sending";
  if (status === "cancelled") return "cancelled";
  return "draft";
}

/** @deprecated use refreshOccurrenceMetrics */
export async function refreshCampaignDeliveryCounts(
  svc: SupabaseClient,
  campaignId: string,
  occurrenceId?: string
): Promise<void> {
  if (occurrenceId) {
    await refreshOccurrenceMetrics(svc, occurrenceId);
    return;
  }
  const { data } = await svc
    .from("admin_notification_campaign_occurrences")
    .select("id")
    .eq("campaign_id", campaignId)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.id) {
    await refreshOccurrenceMetrics(svc, String(data.id));
  }
}

/** 푸시 탭으로 연 경우 — 그 알림의 알림함·푸시 기록을 「열람」으로 (확정 설계 B-1). */
export async function markCampaignDeliveryOpened(
  svc: SupabaseClient,
  notificationEventId: string
): Promise<void> {
  const now = new Date().toISOString();
  await svc
    .from("notification_campaign_deliveries")
    .update({ status: "opened", opened_at: now, updated_at: now })
    .eq("notification_event_id", notificationEventId)
    .in("status", ["sent", "pending", "dismissed"]);
}

/**
 * 앱 안에서 알림을 눌러 연 경우(알림함 행·종 팝업 행·앱 안 배너·알림 상세 — `opened: true`) 그 알림의
 * **알림함 기록만** 「열람」으로 (확정 설계 B-1). 푸시 기록은 푸시를 눌렀을 때만 바뀐다.
 */
export async function markCampaignDeliveriesOpenedForEvents(
  svc: SupabaseClient,
  notificationEventIds: readonly string[]
): Promise<void> {
  const ids = [...new Set(notificationEventIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  await svc
    .from("notification_campaign_deliveries")
    .update({ status: "opened", opened_at: now, updated_at: now })
    .in("notification_event_id", ids)
    .eq("channel", "in_app")
    .in("status", ["sent", "pending"]);
}

/**
 * 푸시 전용 알림 열람 (push-only-open-tracking-design-2026-11-02 · Owner 승인) — 알림 id 가 없어 회차·본인으로 찾는다.
 * 회원 단위: 그 회원의 그 회차 푸시 기록(sent)을 모두 opened 로. 본인 행이 없으면 아무것도 쓰지 않는다.
 */
export async function markCampaignPushOpenedByOccurrence(
  svc: SupabaseClient,
  occurrenceId: string,
  userId: string
): Promise<number> {
  const now = new Date().toISOString();
  const { data, error } = await svc
    .from("notification_campaign_deliveries")
    .update({ status: "opened", opened_at: now, updated_at: now })
    .eq("occurrence_id", occurrenceId)
    .eq("user_id", userId)
    .eq("channel", "push")
    .eq("status", "sent")
    .select("id");
  if (error) throw new Error(`campaign_push_open_failed: ${error.message}`);
  return Array.isArray(data) ? data.length : 0;
}

export async function markCampaignDeliveryDismissed(
  svc: SupabaseClient,
  notificationEventId: string
): Promise<void> {
  const now = new Date().toISOString();
  await svc
    .from("notification_campaign_deliveries")
    .update({ status: "dismissed", updated_at: now })
    .eq("notification_event_id", notificationEventId)
    .eq("channel", "push")
    // 확정 설계 B-17 — 이미 연 기록(opened)은 덮지 않는다. 닫음 = 받음(집계에서 성공).
    .in("status", ["sent", "pending"]);
}
