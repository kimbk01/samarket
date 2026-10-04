import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateCampaignInput } from "@/lib/admin/notification-campaigns/campaign-create-service";

export type DraftCampaignContent = Pick<
  CreateCampaignInput,
  | "title"
  | "body"
  | "target_type"
  | "channel"
  | "deeplink_url"
  | "web_url"
  | "push_image_url"
  | "in_app_image_url"
  | "target_payload"
>;

/**
 * EVENT-02 (Event distribution save): a replayed `create_request_id` used to keep the old
 * draft content while reporting "updated". Updates content ONLY for a draft that has never
 * had a real (non-test) occurrence — sent/queued campaigns stay immutable (existing policy).
 */
export async function updateUnsentDraftCampaignContent(
  svc: SupabaseClient,
  campaignId: string,
  adminUserId: string,
  content: DraftCampaignContent
): Promise<{ updated: boolean }> {
  try {
    return await updateUnsentDraft(svc, campaignId, adminUserId, content);
  } catch {
    return { updated: false };
  }
}

async function updateUnsentDraft(
  svc: SupabaseClient,
  campaignId: string,
  adminUserId: string,
  content: DraftCampaignContent
): Promise<{ updated: boolean }> {
  const { data: realOcc, error: occErr } = await svc
    .from("admin_notification_campaign_occurrences")
    .select("id")
    .eq("campaign_id", campaignId)
    .neq("trigger_type", "test")
    .limit(1)
    .maybeSingle();
  if (occErr || realOcc) return { updated: false };
  const now = new Date().toISOString();
  const selectedIds =
    content.target_type === "selected_users" &&
    content.target_payload &&
    typeof content.target_payload === "object" &&
    !Array.isArray(content.target_payload) &&
    Array.isArray((content.target_payload as Record<string, unknown>).selected_user_ids)
      ? [
          ...new Set(
            ((content.target_payload as Record<string, unknown>).selected_user_ids as unknown[])
              .map((x) => String(x ?? "").trim())
              .filter(Boolean)
          ),
        ].slice(0, 5000)
      : [];
  const { data, error } = await svc
    .from("admin_notification_campaigns")
    .update({
      title: content.title,
      body: content.body,
      target_type: content.target_type,
      channel: content.channel,
      target_url: content.deeplink_url,
      image_url: content.in_app_image_url ?? content.push_image_url,
      deeplink_url: content.deeplink_url,
      web_url: content.web_url,
      push_image_url: content.push_image_url,
      in_app_image_url: content.in_app_image_url,
      target_payload: content.target_payload,
      ...(content.target_type === "selected_users" ? { target_count: selectedIds.length } : {}),
      updated_by: adminUserId,
      updated_at: now,
    })
    .eq("id", campaignId)
    .eq("status", "draft")
    .select("id");
  if (error) return { updated: false };
  return { updated: Array.isArray(data) && data.length > 0 };
}
