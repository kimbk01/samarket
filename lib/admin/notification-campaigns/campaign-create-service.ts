import type { SupabaseClient } from "@supabase/supabase-js";
import { previewCampaignAudience } from "@/lib/admin/notification-campaigns/campaign-audience-preview";
import { buildCampaignContentSnapshot } from "@/lib/admin/notification-campaigns/campaign-content-snapshot";
import {
  audiencePreviewToSnapshot,
  ensureCampaignOccurrence,
  newOccurrenceIdempotencyKey,
} from "@/lib/admin/notification-campaigns/campaign-occurrence-service";
import type { CampaignSendMode } from "@/lib/admin/notification-campaigns/campaign-occurrence-types";
import { computeNextRecurrenceScheduledFor } from "@/lib/admin/notification-campaigns/campaign-recurrence";
import type { CampaignChannel } from "@/lib/admin/notification-campaigns/campaign-types";
import { ensureCampaignTargetsForSelectedUsers } from "@/lib/admin/notification-campaigns/run-campaign-send-batch";

export type CreateCampaignInput = {
  title: string;
  body: string;
  type: "notice" | "marketing" | "system";
  target_type: string;
  channel: CampaignChannel;
  deeplink_url: string | null;
  web_url: string | null;
  push_image_url: string | null;
  in_app_image_url: string | null;
  segment_region_code: string | null;
  target_payload: Record<string, unknown>;
  send_mode: CampaignSendMode;
  scheduled_at: string | null;
  is_qa?: boolean;
  recurrence_kind?: string;
  recurrence_time?: string | null;
  recurrence_timezone?: string;
  recurrence_start_at?: string | null;
  recurrence_end_at?: string | null;
  recurrence_max_count?: number | null;
  recurrence_weekday?: number | null;
  target_user_ids?: string[];
  create_request_id: string | null;
  save_as_draft?: boolean;
};

function readCreateRequestId(existing: string | null | undefined): string | null {
  const v = existing?.trim();
  return v ? v.slice(0, 128) : null;
}

export async function findCampaignByCreateRequestId(
  svc: SupabaseClient,
  createRequestId: string
): Promise<{ id: string } | null> {
  const { data } = await svc
    .from("admin_notification_campaigns")
    .select("id")
    .eq("create_request_id", createRequestId)
    .maybeSingle();
  return data?.id ? { id: String(data.id) } : null;
}

export async function createAdminNotificationCampaign(
  svc: SupabaseClient,
  adminUserId: string,
  input: CreateCampaignInput
): Promise<
  | { ok: true; campaignId: string; occurrenceId: string | null; replay: boolean }
  | { ok: false; error: string; status?: number }
> {
  if (input.send_mode === "scheduled" && input.scheduled_at) {
    const when = new Date(input.scheduled_at);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      return { ok: false, error: "scheduled_at_must_be_future", status: 400 };
    }
  }

  const createRequestId = readCreateRequestId(input.create_request_id);
  if (createRequestId) {
    const existing = await findCampaignByCreateRequestId(svc, createRequestId);
    if (existing) {
      const { data: occ } = await svc
        .from("admin_notification_campaign_occurrences")
        .select("id")
        .eq("campaign_id", existing.id)
        .order("sequence_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      return {
        ok: true,
        campaignId: existing.id,
        occurrenceId: occ?.id ? String(occ.id) : null,
        replay: true,
      };
    }
  }

  const legacyImage = input.in_app_image_url ?? input.push_image_url;
  const campaignStatus = input.save_as_draft
    ? "draft"
    : input.send_mode === "scheduled"
      ? "scheduled"
      : input.send_mode === "recurring"
        ? "active"
        : "draft";

  const insertRow = {
    title: input.title,
    body: input.body,
    type: input.type,
    target_type: input.target_type,
    channel: input.channel,
    target_url: input.deeplink_url,
    image_url: legacyImage,
    deeplink_url: input.deeplink_url,
    web_url: input.web_url,
    push_image_url: input.push_image_url,
    in_app_image_url: input.in_app_image_url,
    scheduled_at: input.send_mode === "scheduled" ? input.scheduled_at : null,
    segment_region_code: input.target_type === "region" ? input.segment_region_code : null,
    status: campaignStatus,
    send_mode: input.send_mode,
    is_qa: input.is_qa === true,
    recurrence_kind: input.send_mode === "recurring" ? input.recurrence_kind ?? "weekly" : "none",
    recurrence_time: input.recurrence_time ?? "09:00",
    recurrence_timezone: input.recurrence_timezone ?? "Asia/Seoul",
    recurrence_start_at: input.recurrence_start_at ?? input.scheduled_at ?? new Date().toISOString(),
    recurrence_end_at: input.recurrence_end_at ?? null,
    recurrence_max_count: input.recurrence_max_count ?? null,
    recurrence_weekday: input.recurrence_weekday ?? null,
    create_request_id: createRequestId,
    created_by: adminUserId,
    updated_by: adminUserId,
    scheduled_by: input.send_mode === "scheduled" ? adminUserId : null,
    send_progress_offset: 0,
    priority: "normal",
    visibility_policy: "default",
    target_payload: input.target_payload,
    updated_at: new Date().toISOString(),
  };

  const { data: row, error } = await svc
    .from("admin_notification_campaigns")
    .insert(insertRow)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505" && createRequestId) {
      const existing = await findCampaignByCreateRequestId(svc, createRequestId);
      if (existing) {
        return { ok: true, campaignId: existing.id, occurrenceId: null, replay: true };
      }
    }
    return { ok: false, error: error.message, status: 500 };
  }

  const campaignId = String((row as { id?: string })?.id ?? "");
  if (!campaignId) return { ok: false, error: "insert_failed", status: 500 };

  const campaignSnapshot = buildCampaignContentSnapshot({
    title: input.title,
    body: input.body,
    type: input.type,
    channel: input.channel,
    target_type: input.target_type,
    deeplink_url: input.deeplink_url,
    web_url: input.web_url,
    push_image_url: input.push_image_url,
    in_app_image_url: input.in_app_image_url,
    target_payload: input.target_payload,
  });

  let occurrenceId: string | null = null;

  if (!input.save_as_draft) {
    const preview = await previewCampaignAudience(svc, {
      type: input.type,
      target_type: input.target_type,
      channel: input.channel,
      segment_region_code: input.segment_region_code,
      target_user_ids: input.target_user_ids,
    });
    const audienceSnapshot = audiencePreviewToSnapshot(preview, new Date().toISOString());
    const seq = 1;

    let scheduledFor: string | null = null;
    let triggerType = "immediate";
    if (input.send_mode === "scheduled") {
      scheduledFor = input.scheduled_at;
      triggerType = "scheduled";
    } else if (input.send_mode === "recurring") {
      triggerType = "recurring";
      const next = computeNextRecurrenceScheduledFor(
        {
          kind: (input.recurrence_kind ?? "weekly") as "daily" | "weekly" | "monthly",
          timeLocal: (input.recurrence_time ?? "09:00").slice(0, 5),
          timezone: input.recurrence_timezone ?? "Asia/Seoul",
          startAt: input.recurrence_start_at ?? new Date().toISOString(),
          endAt: input.recurrence_end_at ?? null,
          maxCount: input.recurrence_max_count ?? null,
          weekday: input.recurrence_weekday ?? null,
        },
        new Date(),
        seq
      );
      scheduledFor = next?.toISOString() ?? null;
    }

    const ensured = await ensureCampaignOccurrence(svc, {
      campaignId,
      sequenceNumber: seq,
      triggerType,
      scheduledFor,
      idempotencyKey: newOccurrenceIdempotencyKey(`occ:${campaignId}:${seq}`),
      triggeredBy: adminUserId,
      campaign: campaignSnapshot,
      audienceSnapshot,
    });

    if (!ensured.ok) {
      return { ok: false, error: ensured.error, status: 500 };
    }
    occurrenceId = ensured.occurrence.id;

    if (input.target_type === "selected_users" && input.target_user_ids?.length && occurrenceId) {
      await ensureCampaignTargetsForSelectedUsers(
        svc,
        campaignId,
        occurrenceId,
        input.target_user_ids.slice(0, 5000)
      );
    }
  }

  return { ok: true, campaignId, occurrenceId, replay: false };
}

export async function resolveLatestQueuedOccurrenceId(
  svc: SupabaseClient,
  campaignId: string
): Promise<string | null> {
  const { data } = await svc
    .from("admin_notification_campaign_occurrences")
    .select("id")
    .eq("campaign_id", campaignId)
    .in("status", ["queued", "failed"])
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

export async function resolveActiveOccurrenceForSend(
  svc: SupabaseClient,
  campaignId: string,
  occurrenceId?: string | null
): Promise<string | null> {
  if (occurrenceId?.trim()) return occurrenceId.trim();
  return resolveLatestQueuedOccurrenceId(svc, campaignId);
}
