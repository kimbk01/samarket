import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateCampaignUserEligibility,
  loadCampaignSettingsMaps,
} from "@/lib/admin/notification-campaigns/campaign-eligibility";
import {
  recordCampaignDelivery,
  refreshCampaignDeliveryCounts,
} from "@/lib/admin/notification-campaigns/campaign-delivery-recorder";
import { sendCampaignToUser } from "@/lib/admin/notification-campaigns/campaign-send-user";
import { fetchCampaignProfileScanSlice } from "@/lib/admin/notification-campaigns/campaign-target-scan";
import type { AdminNotificationCampaignRow, CampaignStatus } from "@/lib/admin/notification-campaigns/campaign-types";

export const NOTIFICATION_CAMPAIGN_BATCH_SIZE = 120;

const TERMINAL_STATUSES = new Set<CampaignStatus>(["sent", "partially_failed", "failed", "cancelled"]);

export async function ensureCampaignTargetsForSelectedUsers(
  svc: SupabaseClient,
  campaignId: string,
  userIds: string[]
): Promise<void> {
  const rows = userIds.map((user_id) => ({
    campaign_id: campaignId,
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

export function assertCampaignSendAllowed(status: string): { ok: true } | { ok: false; error: string } {
  if (status === "sending") return { ok: true };
  if (status === "draft" || status === "scheduled") return { ok: true };
  if (TERMINAL_STATUSES.has(status as CampaignStatus)) {
    return { ok: false, error: "campaign_already_sent" };
  }
  return { ok: true };
}

/** @deprecated use evaluateCampaignUserEligibility */
export function eligibleForCampaign(
  campaignType: AdminNotificationCampaignRow["type"],
  userId: string,
  maps: Awaited<ReturnType<typeof loadCampaignSettingsMaps>>
): boolean {
  return evaluateCampaignUserEligibility(campaignType, userId, maps).eligible;
}

function resolveFinalCampaignStatus(sent: number, skipped: number, failed: number): CampaignStatus {
  if (failed > 0 && sent > 0) return "partially_failed";
  if (failed > 0 && sent === 0) return "failed";
  return "sent";
}

/**
 * Process one batch. Sets status=sending on first batch; terminal status when done.
 */
export async function runNotificationCampaignSendBatch(
  svc: SupabaseClient,
  campaignId: string
): Promise<{
  ok: boolean;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  done: boolean;
  error?: string;
}> {
  const { data: camp, error: cErr } = await svc
    .from("admin_notification_campaigns")
    .select(
      "id, type, target_type, title, body, channel, target_url, image_url, deeplink_url, web_url, push_image_url, in_app_image_url, priority, visibility_policy, target_payload, segment_region_code, send_progress_offset, status, sent_count, skipped_count, failed_count, target_count"
    )
    .eq("id", campaignId)
    .maybeSingle();

  if (cErr || !camp) {
    return { ok: false, processed: 0, sent: 0, skipped: 0, failed: 0, done: false, error: cErr?.message ?? "not_found" };
  }

  const campaign = camp as AdminNotificationCampaignRow;

  const allowed = assertCampaignSendAllowed(String(campaign.status));
  if (!allowed.ok) {
    return { ok: false, processed: 0, sent: 0, skipped: 0, failed: 0, done: true, error: allowed.error };
  }

  if (String(campaign.target_type) === "segment") {
    const nowSeg = new Date().toISOString();
    await svc
      .from("admin_notification_campaigns")
      .update({ status: "failed", last_error: "segment_unsupported", updated_at: nowSeg })
      .eq("id", campaignId);
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

  if (campaign.status !== "sending") {
    await svc
      .from("admin_notification_campaigns")
      .update({ status: "sending", updated_at: now })
      .eq("id", campaignId);
  }

  let scannedRaw: string[] = [];
  let nextOffset = campaign.send_progress_offset ?? 0;

  if (campaign.target_type === "selected_users") {
    const { data: pending, error: pErr } = await svc
      .from("admin_notification_campaign_targets")
      .select("user_id")
      .eq("campaign_id", campaignId)
      .eq("status", "pending")
      .limit(NOTIFICATION_CAMPAIGN_BATCH_SIZE);

    if (pErr) {
      return { ok: false, processed: 0, sent: 0, skipped: 0, failed: 0, done: false, error: pErr.message };
    }
    scannedRaw = (pending ?? []).map((r) => String((r as { user_id: string }).user_id)).filter(Boolean);
    if (scannedRaw.length === 0) {
      const { count: totalTargets } = await svc
        .from("admin_notification_campaign_targets")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId);
      if ((totalTargets ?? 0) === 0) {
        await svc
          .from("admin_notification_campaigns")
          .update({ status: "failed", updated_at: now })
          .eq("id", campaignId);
        return { ok: true, processed: 0, sent: 0, skipped: 0, failed: 0, done: true };
      }
    }
  } else {
    scannedRaw = await fetchCampaignProfileScanSlice(svc, campaign, nextOffset, NOTIFICATION_CAMPAIGN_BATCH_SIZE);
    if (scannedRaw.length === 0) {
      await refreshCampaignDeliveryCounts(svc, campaignId);
      const finalStatus = resolveFinalCampaignStatus(
        campaign.sent_count ?? 0,
        campaign.skipped_count ?? 0,
        campaign.failed_count ?? 0
      );
      await svc
        .from("admin_notification_campaigns")
        .update({
          status: finalStatus,
          sent_at: now,
          updated_at: now,
          send_progress_offset: nextOffset,
        })
        .eq("id", campaignId);
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
        campaignId,
        userId,
        channel: "in_app",
        status: "skipped",
        skipReason: reason,
      });
      await svc.from("admin_notification_campaign_targets").upsert(
        {
          campaign_id: campaignId,
          user_id: userId,
          status: "skipped",
          failure_reason: reason,
          skip_reason: reason,
        },
        { onConflict: "campaign_id,user_id" }
      );
      continue;
    }

    const result = await sendCampaignToUser(svc, campaign, userId, maps);
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
      .eq("campaign_id", campaignId)
      .eq("status", "pending");
    done = (count ?? 0) === 0;
  } else {
    const peek = await fetchCampaignProfileScanSlice(svc, campaign, nextOffset, 1);
    done = peek.length === 0;
  }

  await refreshCampaignDeliveryCounts(svc, campaignId);

  const { data: refreshed } = await svc
    .from("admin_notification_campaigns")
    .select("sent_count, skipped_count, failed_count")
    .eq("id", campaignId)
    .maybeSingle();

  const counts = refreshed as { sent_count?: number; skipped_count?: number; failed_count?: number } | null;
  const statusNext: CampaignStatus = done
    ? resolveFinalCampaignStatus(counts?.sent_count ?? sent, counts?.skipped_count ?? skipped, counts?.failed_count ?? failed)
    : "sending";

  const patch: Record<string, unknown> = {
    status: statusNext,
    sent_at: done ? now : null,
    updated_at: now,
  };
  if (campaign.target_type !== "selected_users") {
    patch.send_progress_offset = nextOffset;
  }

  await svc.from("admin_notification_campaigns").update(patch).eq("id", campaignId);

  return { ok: true, processed, sent, skipped, failed, done };
}

/** Test send to explicit user IDs (uses push_and_in_app behavior regardless of stored channel). */
export async function runNotificationCampaignTestSend(
  svc: SupabaseClient,
  campaignId: string,
  userIds: string[]
): Promise<{ ok: boolean; sent: number; skipped: number; failed: number; error?: string }> {
  const { data: camp, error: cErr } = await svc
    .from("admin_notification_campaigns")
    .select(
      "id, type, target_type, title, body, channel, target_url, image_url, deeplink_url, web_url, push_image_url, in_app_image_url, priority, visibility_policy, target_payload, segment_region_code, send_progress_offset, status"
    )
    .eq("id", campaignId)
    .maybeSingle();

  if (cErr || !camp) {
    return { ok: false, sent: 0, skipped: 0, failed: 0, error: cErr?.message ?? "not_found" };
  }

  const campaign = camp as AdminNotificationCampaignRow;
  const maps = await loadCampaignSettingsMaps(svc, userIds);
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of userIds) {
    const result = await sendCampaignToUser(svc, campaign, userId, maps, {
      forceChannel: "push_and_in_app",
      skipDuplicateCheck: true,
    });
    if (result.sent) sent += 1;
    else if (result.skipped) skipped += 1;
    else if (result.failed) failed += 1;
  }

  await refreshCampaignDeliveryCounts(svc, campaignId);
  return { ok: true, sent, skipped, failed };
}
