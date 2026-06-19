import {
  adminCampaignTypeToEventType,
  buildAdminCampaignDedupeKey,
} from "@/lib/notifications/display/build-admin-ad-notification-display";
import { notifyAdminAdPipeline } from "@/lib/notifications/pipeline/notify-admin-ad-pipeline";
import type { SupabaseClient } from "@supabase/supabase-js";

export const NOTIFICATION_CAMPAIGN_BATCH_SIZE = 120;

const ACTIVE_USER_DAYS = 30;

type CampaignRow = {
  id: string;
  type: "notice" | "marketing" | "system";
  target_type: string;
  title: string;
  body: string;
  target_url: string | null;
  image_url: string | null;
  segment_region_code: string | null;
  send_progress_offset: number | null;
  status: string;
};

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

async function loadSettingsMaps(
  svc: SupabaseClient,
  userIds: string[]
): Promise<{
  notif: Map<string, { service_enabled?: boolean | null; marketing_enabled?: boolean | null }>;
  prefs: Map<string, { marketing_push_enabled?: boolean | null }>;
}> {
  const notif = new Map<string, { service_enabled?: boolean | null; marketing_enabled?: boolean | null }>();
  const prefs = new Map<string, { marketing_push_enabled?: boolean | null }>();
  if (userIds.length === 0) return { notif, prefs };

  const [{ data: nsRows }, { data: usRows }] = await Promise.all([
    svc
      .from("user_notification_settings")
      .select("user_id, service_enabled, marketing_enabled")
      .in("user_id", userIds),
    svc.from("user_settings").select("user_id, marketing_push_enabled").in("user_id", userIds),
  ]);

  for (const r of nsRows ?? []) {
    const id = String((r as { user_id?: string }).user_id ?? "");
    if (id) notif.set(id, r as { service_enabled?: boolean | null; marketing_enabled?: boolean | null });
  }
  for (const r of usRows ?? []) {
    const id = String((r as { user_id?: string }).user_id ?? "");
    if (id) prefs.set(id, r as { marketing_push_enabled?: boolean | null });
  }
  return { notif, prefs };
}

export function eligibleForCampaign(
  campaignType: CampaignRow["type"],
  userId: string,
  maps: Awaited<ReturnType<typeof loadSettingsMaps>>
): boolean {
  const n = maps.notif.get(userId);
  const u = maps.prefs.get(userId);
  const serviceOn = n?.service_enabled !== false;
  if (campaignType === "marketing") {
    return n?.marketing_enabled === true && u?.marketing_push_enabled === true;
  }
  if (campaignType === "notice") {
    return serviceOn;
  }
  return true;
}

/** 프로필 스캔 전용 (offset = 건너뛸 행 수). 정책 필터는 호출부에서 한다. */
async function fetchProfileScanSlice(
  svc: SupabaseClient,
  campaign: CampaignRow,
  offset: number,
  limit: number
): Promise<string[]> {
  const tt = campaign.target_type;

  if (tt === "marketing_opt_in") {
    const { data, error } = await svc
      .from("user_notification_settings")
      .select("user_id")
      .eq("marketing_enabled", true)
      .order("user_id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) {
      console.error("[campaign batch marketing_opt_in]", error.message);
      return [];
    }
    return (data ?? []).map((r) => String((r as { user_id: string }).user_id)).filter(Boolean);
  }

  let q = svc.from("profiles").select("id").order("id", { ascending: true }).range(offset, offset + limit - 1);

  if (tt === "region" && campaign.segment_region_code?.trim()) {
    q = svc
      .from("profiles")
      .select("id")
      .eq("region_code", campaign.segment_region_code.trim())
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
  } else if (tt === "active_users") {
    const since = new Date(Date.now() - ACTIVE_USER_DAYS * 86_400_000).toISOString();
    q = svc
      .from("profiles")
      .select("id")
      .gte("updated_at", since)
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
  }

  const { data, error } = await q;
  if (error) {
    console.error("[campaign batch profiles]", error.message);
    return [];
  }
  return (data ?? []).map((r) => String((r as { id: string }).id)).filter(Boolean);
}

/**
 * 한 번의 배치만 처리한다. 완료 시 `done: true`.
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
      "id, type, target_type, title, body, target_url, image_url, segment_region_code, send_progress_offset, status"
    )
    .eq("id", campaignId)
    .maybeSingle();

  if (cErr || !camp) {
    return { ok: false, processed: 0, sent: 0, skipped: 0, failed: 0, done: false, error: cErr?.message ?? "not_found" };
  }

  const campaign = camp as CampaignRow;
  if (campaign.status === "sent") {
    return { ok: true, processed: 0, sent: 0, skipped: 0, failed: 0, done: true };
  }

  const now = new Date().toISOString();
  const pushKind = campaign.type;

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
    scannedRaw = await fetchProfileScanSlice(svc, campaign, nextOffset, NOTIFICATION_CAMPAIGN_BATCH_SIZE);
    if (scannedRaw.length === 0) {
      await svc
        .from("admin_notification_campaigns")
        .update({
          status: "sent",
          sent_at: now,
          updated_at: now,
          send_progress_offset: nextOffset,
        })
        .eq("id", campaignId);
      return { ok: true, processed: 0, sent: 0, skipped: 0, failed: 0, done: true };
    }
    nextOffset += scannedRaw.length;
  }

  const maps = await loadSettingsMaps(svc, scannedRaw);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of scannedRaw) {
    const eligible =
      campaign.type === "marketing"
        ? eligibleForCampaign("marketing", userId, maps)
        : campaign.type === "notice"
          ? eligibleForCampaign("notice", userId, maps)
          : eligibleForCampaign("system", userId, maps);

    if (!eligible) {
      skipped += 1;
      if (campaign.target_type === "selected_users") {
        await svc
          .from("admin_notification_campaign_targets")
          .update({ status: "skipped", failure_reason: "policy_filtered" })
          .eq("campaign_id", campaignId)
          .eq("user_id", userId);
      }
      continue;
    }

    try {
      const eventType = adminCampaignTypeToEventType(campaign.type);
      const result = await notifyAdminAdPipeline(svc, {
        userId,
        eventType,
        title: campaign.title,
        body: campaign.body,
        routeUrl: campaign.target_url,
        imageUrl: campaign.image_url,
        dedupeKey: buildAdminCampaignDedupeKey(campaign.id, userId),
        pushKind: pushKind as "marketing" | "notice" | "system",
        campaignId: campaign.id,
      });
      if (!result.ok) {
        failed += 1;
        const reason = "append_failed";
        if (campaign.target_type === "selected_users") {
          await svc
            .from("admin_notification_campaign_targets")
            .update({ status: "failed", failure_reason: reason })
            .eq("campaign_id", campaignId)
            .eq("user_id", userId);
        } else {
          await svc.from("admin_notification_campaign_targets").upsert(
            {
              campaign_id: campaignId,
              user_id: userId,
              status: "failed",
              failure_reason: reason,
            },
            { onConflict: "campaign_id,user_id" }
          );
        }
        continue;
      }
      sent += 1;

      if (campaign.target_type === "selected_users") {
        await svc
          .from("admin_notification_campaign_targets")
          .update({ status: "sent", sent_at: now })
          .eq("campaign_id", campaignId)
          .eq("user_id", userId);
      } else {
        await svc.from("admin_notification_campaign_targets").upsert(
          {
            campaign_id: campaignId,
            user_id: userId,
            status: "sent",
            sent_at: now,
          },
          { onConflict: "campaign_id,user_id" }
        );
      }
    } catch (e) {
      failed += 1;
      const reason = e instanceof Error ? e.message : "append_failed";
      if (campaign.target_type === "selected_users") {
        await svc
          .from("admin_notification_campaign_targets")
          .update({ status: "failed", failure_reason: reason.slice(0, 500) })
          .eq("campaign_id", campaignId)
          .eq("user_id", userId);
      } else {
        await svc.from("admin_notification_campaign_targets").upsert(
          {
            campaign_id: campaignId,
            user_id: userId,
            status: "failed",
            failure_reason: reason.slice(0, 500),
          },
          { onConflict: "campaign_id,user_id" }
        );
      }
    }
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
  } else if (campaign.target_type === "marketing_opt_in") {
    const peek = await fetchProfileScanSlice(svc, campaign, nextOffset, 1);
    done = peek.length === 0;
  } else {
    const peek = await fetchProfileScanSlice(svc, campaign, nextOffset, 1);
    done = peek.length === 0;
  }

  const statusNext = done ? "sent" : "scheduled";
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
