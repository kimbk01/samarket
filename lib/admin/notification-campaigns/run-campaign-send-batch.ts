import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertCampaignTargetRows } from "@/lib/admin/notification-campaigns/campaign-target-rows";
import { campaignRowFromContentSnapshot } from "@/lib/admin/notification-campaigns/campaign-content-snapshot";
import { refreshOccurrenceMetrics } from "@/lib/admin/notification-campaigns/campaign-delivery-recorder";
import { getCampaignOccurrence } from "@/lib/admin/notification-campaigns/campaign-occurrence-service";
import type { AdminNotificationCampaignOccurrenceRow, CampaignContentSnapshot } from "@/lib/admin/notification-campaigns/campaign-occurrence-types";
import { sendCampaignToUser } from "@/lib/admin/notification-campaigns/campaign-send-user";
import {
  campaignActiveUsersSince,
  fetchCampaignProfileScanSlice,
} from "@/lib/admin/notification-campaigns/campaign-target-scan";
import type { AdminNotificationCampaignRow, CampaignStatus } from "@/lib/admin/notification-campaigns/campaign-types";
import {
  canTransitionCampaignStatus,
  isCampaignHaltedStatus,
} from "@/lib/admin/notification-campaigns/campaign-status-machine";

export const NOTIFICATION_CAMPAIGN_BATCH_SIZE = 120;

const TERMINAL_OCCURRENCE = new Set(["sent", "partially_failed", "failed", "cancelled"]);

export async function ensureCampaignTargetsForSelectedUsers(
  svc: SupabaseClient,
  campaignId: string,
  occurrenceId: string,
  userIds: string[]
): Promise<void> {
  const rows = userIds.map((user_id) => ({
    campaign_id: campaignId,
    occurrence_id: occurrenceId,
    user_id,
    status: "pending" as const,
  }));
  const { error } = await upsertCampaignTargetRows(svc, rows, { ignoreDuplicates: true });
  if (error && !error.message?.includes("does not exist")) {
    console.warn("[campaign targets upsert]", error.message);
  }
}

export function assertOccurrenceSendAllowed(status: string): { ok: true } | { ok: false; error: string } {
  if (status === "sending") return { ok: true };
  if (status === "queued" || status === "failed") return { ok: true };
  // ADM-03: admin stop/cancel — the drain treats this as a clean stop, not a failure.
  if (status === "cancelled") return { ok: false, error: "occurrence_cancelled" };
  if (TERMINAL_OCCURRENCE.has(status)) {
    return { ok: false, error: "occurrence_already_completed" };
  }
  return { ok: false, error: "occurrence_not_sendable" };
}

/** @deprecated legacy campaign send guard */
export function assertCampaignSendAllowed(status: string): { ok: true } | { ok: false; error: string } {
  if (status === "sending") return { ok: true };
  if (status === "draft" || status === "scheduled") return { ok: true };
  if (["sent", "partially_failed", "failed", "cancelled"].includes(status)) {
    return { ok: false, error: "campaign_already_sent" };
  }
  return { ok: true };
}

/**
 * Process one batch for an occurrence. Occurrence is execution SSOT.
 */
export async function runNotificationCampaignSendBatch(
  svc: SupabaseClient,
  occurrenceId: string
): Promise<{
  ok: boolean;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  done: boolean;
  error?: string;
}> {
  const occurrence = await getCampaignOccurrence(svc, occurrenceId);
  if (!occurrence) {
    return { ok: false, processed: 0, sent: 0, skipped: 0, failed: 0, done: false, error: "occurrence_not_found" };
  }

  const allowed = assertOccurrenceSendAllowed(String(occurrence.status));
  if (!allowed.ok) {
    return { ok: false, processed: 0, sent: 0, skipped: 0, failed: 0, done: true, error: allowed.error };
  }

  const { data: camp, error: cErr } = await svc
    .from("admin_notification_campaigns")
    .select(
      "id, status, type, target_type, title, body, channel, target_url, image_url, deeplink_url, web_url, push_image_url, in_app_image_url, priority, visibility_policy, target_payload, segment_region_code"
    )
    .eq("id", occurrence.campaign_id)
    .maybeSingle();

  if (cErr || !camp) {
    return { ok: false, processed: 0, sent: 0, skipped: 0, failed: 0, done: false, error: cErr?.message ?? "not_found" };
  }

  const campRow = camp as AdminNotificationCampaignRow;
  const campaignStatus = String(campRow.status ?? "");
  // ADM-03: 발송 중지 / 반복 중지 halts an in-flight occurrence at the next batch boundary.
  if (isCampaignHaltedStatus(campaignStatus) && String(occurrence.trigger_type ?? "") !== "test") {
    return { ok: false, processed: 0, sent: 0, skipped: 0, failed: 0, done: true, error: "campaign_stopped" };
  }
  const snap = occurrence.content_snapshot as CampaignContentSnapshot;
  const campaignFromSnapshot = campaignRowFromContentSnapshot(occurrence.campaign_id, {
    title: String(snap?.title ?? campRow.title),
    body: String(snap?.body ?? campRow.body),
    type: (snap?.type ?? campRow.type) as AdminNotificationCampaignRow["type"],
    channel: (snap?.channel ?? campRow.channel) as AdminNotificationCampaignRow["channel"],
    target_type: String(snap?.target_type ?? campRow.target_type),
    deeplink_url: snap?.deeplink_url ?? campRow.deeplink_url,
    web_url: snap?.web_url ?? campRow.web_url,
    push_image_url: snap?.push_image_url ?? campRow.push_image_url,
    in_app_image_url: snap?.in_app_image_url ?? campRow.in_app_image_url,
  });
  const campaign: AdminNotificationCampaignRow = {
    ...campaignFromSnapshot,
    ...campRow,
    title: campaignFromSnapshot.title,
    body: campaignFromSnapshot.body,
    type: campaignFromSnapshot.type,
    channel: campaignFromSnapshot.channel,
    target_type: campaignFromSnapshot.target_type,
    deeplink_url: campaignFromSnapshot.deeplink_url,
    web_url: campaignFromSnapshot.web_url,
    push_image_url: campaignFromSnapshot.push_image_url,
    in_app_image_url: campaignFromSnapshot.in_app_image_url,
  };

  if (String(campaign.target_type) === "segment") {
    const nowSeg = new Date().toISOString();
    await svc
      .from("admin_notification_campaign_occurrences")
      .update({ status: "failed", last_error: "segment_unsupported", updated_at: nowSeg, completed_at: nowSeg })
      .eq("id", occurrenceId);
    return {
      ok: false,
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      done: true,
      error: "segment_unsupported",
    };
  }

  if (campaign.channel === "test_only") {
    return {
      ok: false,
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      done: false,
      error: "test_only_use_test_send_endpoint",
    };
  }

  const now = new Date().toISOString();

  // 확정 설계 B-11 — `active_users` 기준 시각은 회차 시작 때 1회 고정(배치마다 다시 계산하지 않음).
  const activeSince =
    campaign.target_type === "active_users"
      ? occurrence.active_since ?? campaignActiveUsersSince(new Date(now))
      : null;
  if (occurrence.status !== "sending" || (activeSince && !occurrence.active_since)) {
    await svc
      .from("admin_notification_campaign_occurrences")
      .update({
        status: "sending",
        started_at: occurrence.started_at ?? now,
        ...(activeSince && !occurrence.active_since ? { active_since: activeSince } : {}),
        updated_at: now,
      })
      .eq("id", occurrenceId);
  }
  // ADM-09: only statuses whose transition table allows `sending` (recurring stays active).
  // 수동 발송은 claim 이 회차를 먼저 `sending` 으로 바꾸므로 회차 상태와 무관하게 캠페인을 맞춘다
  // (2026-10-30 운영: 발송 중 캠페인이 `draft` 로 남아 목록 「작성 중」에 표시됨).
  if (String(occurrence.trigger_type ?? "") !== "test" && canTransitionCampaignStatus(campaignStatus, "sending")) {
    await svc
      .from("admin_notification_campaigns")
      .update({ status: "sending", updated_at: now })
      .eq("id", occurrence.campaign_id);
  }

  let scannedRaw: string[] = [];
  let nextCursor: string | null = occurrence.send_progress_cursor ?? null;

  if (campaign.target_type === "selected_users") {
    const { data: pending, error: pErr } = await svc
      .from("admin_notification_campaign_targets")
      .select("user_id")
      .eq("occurrence_id", occurrenceId)
      .eq("status", "pending")
      .limit(NOTIFICATION_CAMPAIGN_BATCH_SIZE);

    if (pErr) {
      return { ok: false, processed: 0, sent: 0, skipped: 0, failed: 0, done: false, error: pErr.message };
    }
    scannedRaw = (pending ?? []).map((r) => String((r as { user_id: string }).user_id)).filter(Boolean);
  } else {
    // U1-B: a failed scan is an error, never "no more targets".
    try {
      scannedRaw = await fetchCampaignProfileScanSlice(svc, campaign, nextCursor, NOTIFICATION_CAMPAIGN_BATCH_SIZE, {
        throwOnError: true,
        activeSince,
      });
    } catch {
      return { ok: false, processed: 0, sent: 0, skipped: 0, failed: 0, done: false, error: "target_scan_failed" };
    }
    if (scannedRaw.length === 0) {
      await refreshOccurrenceMetrics(svc, occurrenceId, { terminal: true });
      return { ok: true, processed: 0, sent: 0, skipped: 0, failed: 0, done: true };
    }
    nextCursor = scannedRaw[scannedRaw.length - 1] ?? nextCursor;
  }

  // U1-B: per-user idempotency for scan re-runs (lease expiry / killed process). Users already
  // recorded for THIS occurrence in admin_notification_campaign_targets are not sent again.
  // selected_users needs no extra query: it only ever reads `pending` rows.
  const alreadyProcessed = new Set<string>();
  if (campaign.target_type !== "selected_users" && scannedRaw.length) {
    const { data: doneRows, error: doneErr } = await svc
      .from("admin_notification_campaign_targets")
      .select("user_id")
      .eq("campaign_id", campaign.id)
      .eq("occurrence_id", occurrenceId)
      .in("status", ["sent", "skipped", "failed"])
      .in("user_id", scannedRaw);
    if (doneErr) {
      return { ok: false, processed: 0, sent: 0, skipped: 0, failed: 0, done: false, error: "targets_query_failed" };
    }
    for (const r of doneRows ?? []) alreadyProcessed.add(String((r as { user_id: string }).user_id));
  }
  const dedupeScope = String(occurrence.trigger_type ?? "") === "recurring" ? "occurrence" : "campaign";

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  // 알림함은 대상 전원(Owner 2026-11-03) — 회원별 수신 판정은 `sendCampaignToUser` 의 푸시 게이트 1곳.
  for (const userId of scannedRaw) {
    if (alreadyProcessed.has(userId)) continue;
    try {
      const result =
        dedupeScope === "occurrence"
          ? await sendCampaignToUser(svc, campaign, occurrenceId, userId, { dedupeScope })
          : await sendCampaignToUser(svc, campaign, occurrenceId, userId);
      if (result.sent) sent += 1;
      else if (result.skipped) skipped += 1;
      else if (result.failed) failed += 1;
    } catch (e) {
      // 확정 설계 B-9 — 한 회원의 오류가 배치 전체를 멈추지 않는다: 그 회원을 「실패」로 기록해 받은 사람 창에 보인다.
      // 실패 기록마저 못 쓰면 배치를 멈춘다(위치를 저장하지 않으므로 다음 실행이 이 회원부터 다시 처리).
      console.error("[campaign send batch] user failed", userId, e instanceof Error ? e.message : e);
      const { error: markErr } = await upsertCampaignTargetRows(svc, [
        {
          campaign_id: campaign.id,
          occurrence_id: occurrenceId,
          user_id: userId,
          status: "failed",
          failure_reason: "send_exception",
          skip_reason: "send_exception",
        },
      ]);
      if (markErr) throw e;
      failed += 1;
    }
  }

  const processed = scannedRaw.length;

  let done = false;
  if (campaign.target_type === "selected_users") {
    const { count, error: countErr } = await svc
      .from("admin_notification_campaign_targets")
      .select("id", { count: "exact", head: true })
      .eq("occurrence_id", occurrenceId)
      .eq("status", "pending");
    // U1-B: count failure must not be read as "done".
    if (countErr) {
      return { ok: false, processed: scannedRaw.length, sent, skipped, failed, done: false, error: "targets_query_failed" };
    }
    done = (count ?? 0) === 0;
  } else {
    let peek: string[] = [];
    try {
      peek = await fetchCampaignProfileScanSlice(svc, campaign, nextCursor, 1, { throwOnError: true, activeSince });
    } catch {
      // progress so far is persisted below via cursor; next run resumes
      await svc
        .from("admin_notification_campaign_occurrences")
        .update({ send_progress_cursor: nextCursor, updated_at: now })
        .eq("id", occurrenceId);
      return { ok: false, processed: scannedRaw.length, sent, skipped, failed, done: false, error: "target_scan_failed" };
    }
    done = peek.length === 0;
  }

  // U1: terminal status is decided only by refreshOccurrenceMetrics (failure-aware + campaign sync).
  await svc
    .from("admin_notification_campaign_occurrences")
    .update({
      send_progress_cursor: nextCursor,
      updated_at: now,
    })
    .eq("id", occurrenceId);

  await refreshOccurrenceMetrics(svc, occurrenceId, { terminal: done });

  return { ok: true, processed, sent, skipped, failed, done };
}

/**
 * Test send to explicit user IDs.
 * DEF-01: honor the campaign's stored channel. Only `test_only` forces push+in-app
 * (normal send skips that channel entirely).
 */
export async function runNotificationCampaignTestSend(
  svc: SupabaseClient,
  campaignId: string,
  occurrenceId: string,
  userIds: string[]
): Promise<{ ok: boolean; sent: number; skipped: number; failed: number; error?: string }> {
  const occurrence = await getCampaignOccurrence(svc, occurrenceId);
  if (!occurrence) {
    return { ok: false, sent: 0, skipped: 0, failed: 0, error: "occurrence_not_found" };
  }

  const campaign = campaignRowFromContentSnapshot(
    campaignId,
    occurrence.content_snapshot as Parameters<typeof campaignRowFromContentSnapshot>[1]
  );

  // U1/EVENT-13: test occurrence enters `sending` so the shared terminal path can close it.
  if (occurrence.status === "queued") {
    const startedAt = new Date().toISOString();
    await svc
      .from("admin_notification_campaign_occurrences")
      .update({ status: "sending", started_at: occurrence.started_at ?? startedAt, updated_at: startedAt })
      .eq("id", occurrenceId);
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  const forceChannel =
    campaign.channel === "test_only" ? ("push_and_in_app" as const) : undefined;

  // 확정 설계 B-7 — 한 회원에서 예외가 나도 그 회원만 실패로 남기고 계속 · 회차는 **항상** 마무리(`sending` 고착 방지).
  try {
    for (const userId of userIds) {
      try {
        const result = await sendCampaignToUser(svc, campaign, occurrenceId, userId, {
          ...(forceChannel ? { forceChannel } : {}),
          skipDuplicateCheck: true,
        });
        if (result.sent) sent += 1;
        else if (result.skipped) skipped += 1;
        else if (result.failed) failed += 1;
      } catch (e) {
        failed += 1;
        console.error("[campaign test send] user failed", e instanceof Error ? e.message : e);
        await upsertCampaignTargetRows(svc, [
          {
            campaign_id: campaign.id,
            occurrence_id: occurrenceId,
            user_id: userId,
            status: "failed",
            failure_reason: "send_exception",
            skip_reason: "send_exception",
          },
        ]).catch(() => undefined);
      }
    }
  } finally {
    await refreshOccurrenceMetrics(svc, occurrenceId, { terminal: true });
  }
  return { ok: true, sent, skipped, failed };
}
