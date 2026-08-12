import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateCampaignUserEligibility,
  loadCampaignSettingsMaps,
} from "@/lib/admin/notification-campaigns/campaign-eligibility";
import { campaignRowFromContentSnapshot } from "@/lib/admin/notification-campaigns/campaign-content-snapshot";
import {
  recordCampaignDelivery,
  refreshOccurrenceMetrics,
} from "@/lib/admin/notification-campaigns/campaign-delivery-recorder";
import {
  getCampaignOccurrence,
  resolveFinalOccurrenceStatus,
} from "@/lib/admin/notification-campaigns/campaign-occurrence-service";
import type { AdminNotificationCampaignOccurrenceRow, CampaignContentSnapshot } from "@/lib/admin/notification-campaigns/campaign-occurrence-types";
import { sendCampaignToUser } from "@/lib/admin/notification-campaigns/campaign-send-user";
import { fetchCampaignProfileScanSlice } from "@/lib/admin/notification-campaigns/campaign-target-scan";
import type { AdminNotificationCampaignRow, CampaignStatus } from "@/lib/admin/notification-campaigns/campaign-types";

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
  const { error } = await svc.from("admin_notification_campaign_targets").upsert(rows, {
    onConflict: "campaign_id,user_id",
    ignoreDuplicates: true,
  });
  if (error && !error.message?.includes("does not exist")) {
    console.warn("[campaign targets upsert]", error.message);
  }
}

export function assertOccurrenceSendAllowed(status: string): { ok: true } | { ok: false; error: string } {
  if (status === "sending") return { ok: true };
  if (status === "queued" || status === "failed") return { ok: true };
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
      "id, type, target_type, title, body, channel, target_url, image_url, deeplink_url, web_url, push_image_url, in_app_image_url, priority, visibility_policy, target_payload, segment_region_code"
    )
    .eq("id", occurrence.campaign_id)
    .maybeSingle();

  if (cErr || !camp) {
    return { ok: false, processed: 0, sent: 0, skipped: 0, failed: 0, done: false, error: cErr?.message ?? "not_found" };
  }

  const campRow = camp as AdminNotificationCampaignRow;
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

  if (occurrence.status !== "sending") {
    await svc
      .from("admin_notification_campaign_occurrences")
      .update({ status: "sending", started_at: occurrence.started_at ?? now, updated_at: now })
      .eq("id", occurrenceId);
    await svc
      .from("admin_notification_campaigns")
      .update({ status: "sending", updated_at: now })
      .eq("id", occurrence.campaign_id);
  }

  let scannedRaw: string[] = [];
  let nextOffset = occurrence.send_progress_offset ?? 0;

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
    scannedRaw = await fetchCampaignProfileScanSlice(svc, campaign, nextOffset, NOTIFICATION_CAMPAIGN_BATCH_SIZE);
    if (scannedRaw.length === 0) {
      await refreshOccurrenceMetrics(svc, occurrenceId);
      return { ok: true, processed: 0, sent: 0, skipped: 0, failed: 0, done: true };
    }
    nextOffset += scannedRaw.length;
  }

  const maps = await loadCampaignSettingsMaps(svc, scannedRaw);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of scannedRaw) {
    const eligibility = evaluateCampaignUserEligibility(campaign.type, userId, maps);
    if (!eligibility.eligible) {
      skipped += 1;
      const reason = eligibility.skipReason ?? "policy_filtered";
      await recordCampaignDelivery(svc, {
        campaignId: campaign.id,
        occurrenceId,
        userId,
        channel: "in_app",
        status: "skipped",
        skipReason: reason,
      });
      await svc.from("admin_notification_campaign_targets").upsert(
        {
          campaign_id: campaign.id,
          occurrence_id: occurrenceId,
          user_id: userId,
          status: "skipped",
          failure_reason: reason,
          skip_reason: reason,
        },
        { onConflict: "campaign_id,user_id" }
      );
      continue;
    }

    const result = await sendCampaignToUser(svc, campaign, occurrenceId, userId, maps);
    if (result.sent) sent += 1;
    else if (result.skipped) skipped += 1;
    else if (result.failed) failed += 1;
  }

  const processed = scannedRaw.length;

  let done = false;
  if (campaign.target_type === "selected_users") {
    const { count } = await svc
      .from("admin_notification_campaign_targets")
      .select("id", { count: "exact", head: true })
      .eq("occurrence_id", occurrenceId)
      .eq("status", "pending");
    done = (count ?? 0) === 0;
  } else {
    const peek = await fetchCampaignProfileScanSlice(svc, campaign, nextOffset, 1);
    done = peek.length === 0;
  }

  await svc
    .from("admin_notification_campaign_occurrences")
    .update({
      send_progress_offset: nextOffset,
      updated_at: now,
      ...(done
        ? {
            status: resolveFinalOccurrenceStatus(0, sent, 0, sent),
            completed_at: now,
          }
        : {}),
    })
    .eq("id", occurrenceId);

  await refreshOccurrenceMetrics(svc, occurrenceId);

  return { ok: true, processed, sent, skipped, failed, done };
}

/** Test send to explicit user IDs (uses push_and_in_app behavior regardless of stored channel). */
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

  const maps = await loadCampaignSettingsMaps(svc, userIds);
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of userIds) {
    const result = await sendCampaignToUser(svc, campaign, occurrenceId, userId, maps, {
      forceChannel: "push_and_in_app",
      skipDuplicateCheck: true,
    });
    if (result.sent) sent += 1;
    else if (result.skipped) skipped += 1;
    else if (result.failed) failed += 1;
  }

  await refreshOccurrenceMetrics(svc, occurrenceId);
  return { ok: true, sent, skipped, failed };
}
