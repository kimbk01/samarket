import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminNotificationCampaignOccurrenceRow } from "@/lib/admin/notification-campaigns/campaign-occurrence-types";
import {
  claimDueOccurrence,
  claimOccurrenceSend,
  type ClaimOccurrenceSendResult,
} from "@/lib/admin/notification-campaigns/campaign-occurrence-service";
import type { CustomerCenterContentSendRow } from "@/lib/admin/notification-campaigns/campaign-source-authority";
import { randomUUID } from "node:crypto";

export function newCampaignSendClaimToken(): string {
  return randomUUID();
}

/** @deprecated use claimDueOccurrence */
export async function claimDueScheduledCampaign(
  svc: SupabaseClient,
  opts?: { claimToken?: string; now?: string }
) {
  const occurrence = await claimDueOccurrence(svc, opts);
  if (!occurrence) return null;
  const { data } = await svc
    .from("admin_notification_campaigns")
    .select("*")
    .eq("id", occurrence.campaign_id)
    .maybeSingle();
  return data ?? null;
}

export type ClaimManualSendResult = ClaimOccurrenceSendResult & {
  occurrenceId: string | null;
};

/**
 * Claim occurrence for manual/immediate send.
 */
export async function claimAdminCampaignManualSend(
  svc: SupabaseClient,
  occurrenceId: string,
  opts: { idempotencyKey?: string | null; claimToken?: string }
): Promise<ClaimManualSendResult> {
  const result = await claimOccurrenceSend(svc, occurrenceId, opts);
  return { ...result, occurrenceId: result.occurrence?.id ?? occurrenceId };
}

/**
 * Run batch SSOT until done or wall-clock budget exhausted.
 * Revalidates official campaign source (incl. live Event publication) before any batch —
 * same gate as manual send. Scheduled cron must not bypass this.
 */
export async function drainNotificationCampaignSendBatches(
  svc: SupabaseClient,
  occurrenceId: string,
  opts?: { maxBatches?: number; maxWallMs?: number }
): Promise<{
  ok: boolean;
  done: boolean;
  batches: number;
  sent: number;
  skipped: number;
  failed: number;
  error?: string;
  slowestBatchMs?: number;
  /** ADM-03: stopped by admin (stop sending / stop recurring / occurrence cancelled). */
  stopped?: boolean;
  /** ADM-08: scheduled source re-verification skip reason recorded on the occurrence. */
  skippedReason?: string;
}> {
  const { getCampaignOccurrence } = await import(
    "@/lib/admin/notification-campaigns/campaign-occurrence-service"
  );
  const { evaluateOfficialCampaignSendEligibility } = await import(
    "@/lib/admin/notification-campaigns/campaign-source-authority"
  );

  const occurrence = await getCampaignOccurrence(svc, occurrenceId);
  if (!occurrence) {
    return {
      ok: false,
      done: true,
      batches: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      error: "occurrence_not_found",
    };
  }

  const { data: campaignRow, error: campaignErr } = await svc
    .from("admin_notification_campaigns")
    .select("id, type, title, body, target_payload, deeplink_url, web_url, target_url")
    .eq("id", occurrence.campaign_id)
    .maybeSingle();
  if (campaignErr || !campaignRow) {
    const nowMiss = new Date().toISOString();
    await svc
      .from("admin_notification_campaign_occurrences")
      .update({
        status: "failed",
        last_error: "campaign_not_found",
        completed_at: nowMiss,
        updated_at: nowMiss,
      })
      .eq("id", occurrenceId);
    return {
      ok: false,
      done: true,
      batches: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      error: "campaign_not_found",
    };
  }

  const sourceEligibility = await evaluateOfficialCampaignSendEligibility(
    {
      type: (campaignRow as { type?: string }).type,
      target_payload: (campaignRow as { target_payload?: unknown }).target_payload,
      deeplink_url: (campaignRow as { deeplink_url?: string | null }).deeplink_url,
      web_url: (campaignRow as { web_url?: string | null }).web_url,
      target_url: (campaignRow as { target_url?: string | null }).target_url,
      title: (campaignRow as { title?: string | null }).title,
      body: (campaignRow as { body?: string | null }).body,
    },
    async (eventId) => {
      const { data } = await svc
        .from("platform_events")
        .select("status, starts_at, ends_at")
        .eq("id", eventId)
        .maybeSingle();
      if (!data) return null;
      const row = data as {
        status?: string | null;
        starts_at?: string | null;
        ends_at?: string | null;
      };
      return { status: row.status, startsAt: row.starts_at, endsAt: row.ends_at };
    },
    async (contentId) => {
      const { data, error } = await svc
        .from("app_notices")
        .select("is_active, starts_at, ends_at, archived_at, deleted_at")
        .eq("id", contentId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CustomerCenterContentSendRow | null) ?? null;
    }
  );
  if (!sourceEligibility.ok && CAMPAIGN_CONTINUABLE_ERRORS.has(sourceEligibility.error)) {
    // Transient lookup failure — leave the occurrence for the caller to release (no terminal write).
    return {
      ok: false,
      done: false,
      batches: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      error: sourceEligibility.error,
    };
  }
  if (!sourceEligibility.ok) {
    const now = new Date().toISOString();
    const err = sourceEligibility.error;
    const triggerType = String((occurrence as { trigger_type?: string }).trigger_type ?? "");
    if (isCronOwnedTrigger(triggerType)) {
      // ADM-08: a cron-claimed scheduled/recurring occurrence whose source is no longer public
      // (notice archived/hidden, event unpublished) is SKIPPED with a recorded reason — not sent.
      await recordScheduledSourceSkip(svc, {
        occurrenceId,
        campaignId: occurrence.campaign_id,
        triggerType,
        reason: err,
        now,
      });
      return {
        ok: false,
        done: true,
        batches: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
        error: err,
        skippedReason: campaignSourceSkipReason(err),
      };
    }
    await svc
      .from("admin_notification_campaign_occurrences")
      .update({
        status: "failed",
        last_error: err,
        completed_at: now,
        updated_at: now,
      })
      .eq("id", occurrenceId);
    await svc
      .from("admin_notification_campaigns")
      .update({ status: "failed", updated_at: now })
      .eq("id", occurrence.campaign_id)
      .in("status", ["scheduled", "sending"]);
    return {
      ok: false,
      done: true,
      batches: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      error: err,
    };
  }

  const { runNotificationCampaignSendBatch } = await import(
    "@/lib/admin/notification-campaigns/run-campaign-send-batch"
  );

  const maxBatches = Math.max(1, Math.min(opts?.maxBatches ?? 40, 200));
  const maxWallMs = Math.max(5_000, Math.min(opts?.maxWallMs ?? 50_000, 120_000));
  const started = Date.now();

  let batches = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let done = false;
  let slowestBatchMs = 0;

  // U1-B: never start a batch that is not expected to finish inside the wall budget
  // (a batch killed by the platform timeout loses its offset and re-runs).
  while (batches < maxBatches && (batches === 0 || Date.now() - started + slowestBatchMs <= maxWallMs)) {
    const batchStarted = Date.now();
    const result = await runNotificationCampaignSendBatch(svc, occurrenceId);
    slowestBatchMs = Math.max(slowestBatchMs, Date.now() - batchStarted);
    batches += 1;
    if (!result.ok && CAMPAIGN_STOP_ERRORS.has(String(result.error ?? ""))) {
      // ADM-03: admin stopped the campaign/occurrence — clean stop, keep the recorded stop reason.
      return { ok: true, done: true, batches, sent, skipped, failed, stopped: true, slowestBatchMs };
    }
    if (!result.ok) {
      await svc
        .from("admin_notification_campaign_occurrences")
        .update({
          last_error: result.error ?? "batch_failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", occurrenceId);
      return {
        ok: false,
        done: result.done,
        batches,
        sent,
        skipped,
        failed,
        error: result.error,
      };
    }
    sent += result.sent;
    skipped += result.skipped;
    failed += result.failed;
    done = result.done;
    if (done) break;
  }

  return { ok: true, done, batches, sent, skipped, failed, slowestBatchMs };
}

/** Batch results that mean "an admin stopped this" (ADM-03), never a send failure. */
export const CAMPAIGN_STOP_ERRORS = new Set<string>(["occurrence_cancelled", "campaign_stopped"]);

/** Triggers the scheduled dispatcher (cron) owns; manual immediate sends are not skipped silently. */
export function isCronOwnedTrigger(triggerType: string): boolean {
  return triggerType === "scheduled" || triggerType === "recurring";
}

export function campaignSourceSkipReason(sourceError: string): string {
  return `source_skipped:${sourceError}`;
}

/**
 * ADM-08: occurrence → `cancelled` with `last_error = source_skipped:<reason>`.
 * One-shot scheduled campaign → `cancelled` (transition table: scheduled/sending → cancelled).
 * Recurring campaign keeps its lifecycle status; the next slot re-verifies the source again.
 */
export async function recordScheduledSourceSkip(
  svc: SupabaseClient,
  input: { occurrenceId: string; campaignId: string; triggerType: string; reason: string; now: string }
): Promise<void> {
  const reason = campaignSourceSkipReason(input.reason);
  await svc
    .from("admin_notification_campaign_occurrences")
    .update({
      status: "cancelled",
      last_error: reason,
      cancelled_at: input.now,
      completed_at: input.now,
      send_claim_token: null,
      send_lease_expires_at: null,
      updated_at: input.now,
    })
    .eq("id", input.occurrenceId);
  let fromStatus: string | null = null;
  let toStatus: string | null = null;
  if (input.triggerType !== "recurring") {
    const { data: before } = await svc
      .from("admin_notification_campaigns")
      .select("status")
      .eq("id", input.campaignId)
      .maybeSingle();
    const beforeStatus = String((before as { status?: string } | null)?.status ?? "");
    const { data } = await svc
      .from("admin_notification_campaigns")
      .update({ status: "cancelled", last_error: reason, updated_at: input.now })
      .eq("id", input.campaignId)
      .in("status", ["scheduled", "sending"])
      .select("id");
    if (Array.isArray(data) && data.length > 0) {
      fromStatus = beforeStatus || null;
      toStatus = "cancelled";
    }
  }
  const { writeCampaignAuditLog } = await import("@/lib/admin/notification-campaigns/campaign-audit-log");
  await writeCampaignAuditLog(svc, {
    actorId: null,
    campaignId: input.campaignId,
    action: "source_skip",
    fromStatus,
    toStatus,
    after: { occurrence_id: input.occurrenceId, reason },
  });
}

/** Transient batch errors that a later continuation may succeed on. */
export const CAMPAIGN_CONTINUABLE_ERRORS = new Set<string>([
  "target_scan_failed",
  "targets_query_failed",
  "content_source_lookup_failed",
]);

/**
 * U1-B: hand an unfinished occurrence back to the scheduled dispatcher (existing cron + claim RPC).
 * Only the holder of `claimToken` can release; `scheduled_for` keeps its value or becomes now.
 */
export async function releaseOccurrenceForContinuation(
  svc: SupabaseClient,
  occurrenceId: string,
  claimToken: string,
  lastError?: string | null
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data: occ } = await svc
    .from("admin_notification_campaign_occurrences")
    .select("scheduled_for")
    .eq("id", occurrenceId)
    .maybeSingle();
  const { data, error } = await svc
    .from("admin_notification_campaign_occurrences")
    .update({
      status: "queued",
      scheduled_for: (occ as { scheduled_for?: string | null } | null)?.scheduled_for ?? now,
      send_claim_token: null,
      send_claimed_at: null,
      send_lease_expires_at: null,
      ...(lastError ? { last_error: lastError } : {}),
      updated_at: now,
    })
    .eq("id", occurrenceId)
    .eq("status", "sending")
    .eq("send_claim_token", claimToken)
    .select("id");
  return !error && Array.isArray(data) && data.length > 0;
}

/**
 * U1-B: an immediate occurrence claimed by a manual send gets a due time so that, if the
 * request dies, the existing lease reclaim + scheduled cron resume it instead of stranding it.
 */
export async function stampOccurrenceDueForRecovery(svc: SupabaseClient, occurrenceId: string): Promise<void> {
  await svc
    .from("admin_notification_campaign_occurrences")
    .update({ scheduled_for: new Date().toISOString() })
    .eq("id", occurrenceId)
    .is("scheduled_for", null);
}

export async function scheduleNextRecurringOccurrence(
  svc: SupabaseClient,
  campaignId: string
): Promise<AdminNotificationCampaignOccurrenceRow | null> {
  const { data: campaign } = await svc
    .from("admin_notification_campaigns")
    .select(
      // target_payload — 다음 회차 내용 사본(목적지 content_id·platform_event_id)과 회원 지정 반복의 selected_user_ids
      // 가 여기서 온다. 빠지면 2회차부터 목적지·지정 회원이 사라진다(재감사 2026-11-02 A2).
      "id, title, body, type, channel, target_type, target_payload, deeplink_url, web_url, push_image_url, in_app_image_url, send_mode, recurrence_kind, recurrence_time, recurrence_timezone, recurrence_start_at, recurrence_end_at, recurrence_max_count, recurrence_weekday, status"
    )
    .eq("id", campaignId)
    .maybeSingle();

  if (!campaign) return null;
  const row = campaign as Record<string, unknown>;
  if (String(row.send_mode) !== "recurring" || String(row.status) !== "active") return null;
  if (String(row.recurrence_kind) === "none") return null;

  const { loadRecurringOccurrenceProgress, ensureCampaignOccurrence } = await import(
    "@/lib/admin/notification-campaigns/campaign-occurrence-service"
  );
  const { computeNextRecurrenceScheduledFor } = await import(
    "@/lib/admin/notification-campaigns/campaign-recurrence"
  );
  const { buildCampaignContentSnapshot } = await import(
    "@/lib/admin/notification-campaigns/campaign-content-snapshot"
  );
  const { ensureCampaignTargetsForSelectedUsers } = await import(
    "@/lib/admin/notification-campaigns/run-campaign-send-batch"
  );
  const { normalizeSelectedUserIds } = await import("@/lib/admin/notification-campaigns/selected-user-ids");

  // 확정 설계 B-12 — 반복 횟수·직전 시각은 반복 회차만으로(테스트·즉시 회차가 끼면 횟수가 틀렸다).
  const { nextIndex: seq, last: lastOcc } = await loadRecurringOccurrenceProgress(svc, campaignId);

  const after = new Date(
    String((lastOcc as { completed_at?: string; scheduled_for?: string } | null)?.completed_at ??
      (lastOcc as { scheduled_for?: string } | null)?.scheduled_for ??
      row.recurrence_start_at ??
      Date.now())
  );

  const timeLocal = String(row.recurrence_time ?? "09:00").slice(0, 5);
  const next = computeNextRecurrenceScheduledFor(
    {
      kind: String(row.recurrence_kind) as "daily" | "weekly" | "monthly",
      timeLocal,
      // 운영 시간 기준 PHT (AGENTS 규정 9) — 값이 없을 때만. 화면·다시 보내기는 Asia/Manila 를 저장한다.
      timezone: String(row.recurrence_timezone ?? "Asia/Manila"),
      startAt: String(row.recurrence_start_at ?? new Date().toISOString()),
      endAt: (row.recurrence_end_at as string | null) ?? null,
      maxCount: (row.recurrence_max_count as number | null) ?? null,
      weekday: (row.recurrence_weekday as number | null) ?? null,
    },
    after,
    seq
  );

  if (!next) {
    await svc
      .from("admin_notification_campaigns")
      .update({ status: "ended", updated_at: new Date().toISOString() })
      .eq("id", campaignId);
    return null;
  }

  const snapshot = buildCampaignContentSnapshot({
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    type: row.type as "notice" | "marketing" | "system",
    channel: row.channel as "push_only" | "in_app_only" | "push_and_in_app",
    target_type: String(row.target_type ?? "all"),
    deeplink_url: (row.deeplink_url as string | null) ?? null,
    web_url: (row.web_url as string | null) ?? null,
    push_image_url: (row.push_image_url as string | null) ?? null,
    in_app_image_url: (row.in_app_image_url as string | null) ?? null,
    target_payload:
      row.target_payload && typeof row.target_payload === "object"
        ? (row.target_payload as Record<string, unknown>)
        : null,
  });

  // 확정 설계 B-13 — 반복 2회차부터도 대상 스냅샷을 넣는다(없으면 목록·상세가 「대상 0」으로 보였다).
  // 최종 감사 병목 정정: 미리보기 전체(회원별 기기 조회)를 다시 돌리지 않는다 — 대상 수는 count 1번,
  // 푸시·기기 숫자는 직전 반복 회차 스냅샷을 그대로 쓴다(실제 결과는 발송 집계가 채운다).
  const { countCampaignTargetMembers } = await import("@/lib/admin/notification-campaigns/campaign-target-scan");
  const recurringPayload =
    row.target_payload && typeof row.target_payload === "object"
      ? (row.target_payload as { selected_user_ids?: string[] })
      : null;
  const targetCount = await countCampaignTargetMembers(
    svc,
    {
      target_type: String(row.target_type ?? "all"),
      segment_region_code: (row.segment_region_code as string | null) ?? null,
    },
    normalizeSelectedUserIds(recurringPayload?.selected_user_ids)
  ).catch(() => null);
  const prevSnap =
    lastOcc?.audience_snapshot && typeof lastOcc.audience_snapshot === "object"
      ? (lastOcc.audience_snapshot as Record<string, unknown>)
      : {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const audienceSnapshot =
    targetCount == null
      ? undefined
      : {
          target_member_count: targetCount,
          push_eligible_member_count: num(prevSnap.push_eligible_member_count),
          push_device_count: num(prevSnap.push_device_count),
          in_app_member_count: String(row.channel ?? "") === "push_only" ? 0 : targetCount,
          resolved_at: new Date().toISOString(),
        };

  const ensured = await ensureCampaignOccurrence(svc, {
    campaignId,
    ...(audienceSnapshot ? { audienceSnapshot } : {}),
    triggerType: "recurring",
    scheduledFor: next.toISOString(),
    // 같은 반복 시각 = 같은 회차(번호는 DB 배정 · 테스트 회차가 끼어도 겹치지 않음)
    idempotencyKey: `recurring:${campaignId}:${next.toISOString()}`,
    campaign: snapshot,
  });

  // Only a freshly created (queued) occurrence re-arms targets; an existing row returned by the
  // idempotent RPC must not touch target state.
  if (ensured.ok && ensured.occurrence.status === "queued" && String(row.target_type) === "selected_users") {
    // ADM-02: each recurring occurrence gets its own pending rows from the campaign's
    // selected_user_ids, so earlier occurrences keep their sent/skipped history.
    const payload =
      row.target_payload && typeof row.target_payload === "object"
        ? (row.target_payload as { selected_user_ids?: string[] })
        : null;
    const selectedUserIds = normalizeSelectedUserIds(payload?.selected_user_ids);
    // 확정 설계 B-20 — 예전 캠페인 단위 키가 없어졌다(단계 C-2). 이전 회차 행을 새 회차로 **옮기지 않고 복사**한다
    // (예전엔 옮겨서 1회차 기록이 사라졌다). 저장된 선택이 없으면 이전 회차의 받는 사람으로 새 행을 만든다.
    let ids = selectedUserIds;
    if (!ids.length) {
      const { data: prevRows } = await svc
        .from("admin_notification_campaign_targets")
        .select("user_id")
        .eq("campaign_id", campaignId)
        .neq("occurrence_id", ensured.occurrence.id);
      ids = normalizeSelectedUserIds(
        [...new Set(((prevRows ?? []) as Array<{ user_id?: string }>).map((r) => String(r.user_id ?? "")))].filter(Boolean)
      );
    }
    if (ids.length) {
      await ensureCampaignTargetsForSelectedUsers(svc, campaignId, ensured.occurrence.id, ids);
    }
  }

  return ensured.ok ? ensured.occurrence : null;
}
