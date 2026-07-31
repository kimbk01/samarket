import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminNotificationCampaignRow } from "@/lib/admin/notification-campaigns/campaign-types";

export const CAMPAIGN_ACTIVE_USER_DAYS = 30;

/** Shared target scan used by batch send and audience preview — no segment fallback. */
export async function fetchCampaignProfileScanSlice(
  svc: SupabaseClient,
  campaign: Pick<AdminNotificationCampaignRow, "target_type" | "segment_region_code">,
  offset: number,
  limit: number
): Promise<string[]> {
  const tt = campaign.target_type;

  if (tt === "segment") {
    return [];
  }

  if (tt === "marketing_opt_in") {
    const { data, error } = await svc
      .from("user_notification_settings")
      .select("user_id")
      .eq("marketing_enabled", true)
      .order("user_id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) {
      console.error("[campaign scan marketing_opt_in]", error.message);
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
    const since = new Date(Date.now() - CAMPAIGN_ACTIVE_USER_DAYS * 86_400_000).toISOString();
    q = svc
      .from("profiles")
      .select("id")
      .gte("updated_at", since)
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
  } else if (tt === "all") {
    // default profiles scan
  } else if (tt !== "selected_users") {
    console.error("[campaign scan] unsupported target_type", tt);
    return [];
  }

  if (tt === "selected_users") {
    return [];
  }

  const { data, error } = await q;
  if (error) {
    console.error("[campaign scan profiles]", error.message);
    return [];
  }
  return (data ?? []).map((r) => String((r as { id: string }).id)).filter(Boolean);
}

export async function countCampaignProfileAudience(
  svc: SupabaseClient,
  campaign: Pick<AdminNotificationCampaignRow, "target_type" | "segment_region_code">,
  opts?: { maxScan?: number }
): Promise<{ userIds: string[]; truncated: boolean }> {
  const maxScan = Math.max(1, Math.min(opts?.maxScan ?? 5_000, 20_000));
  const page = 500;
  const userIds: string[] = [];
  let offset = 0;
  let truncated = false;

  while (userIds.length < maxScan) {
    const slice = await fetchCampaignProfileScanSlice(svc, campaign, offset, page);
    if (slice.length === 0) break;
    userIds.push(...slice);
    offset += slice.length;
    if (slice.length < page) break;
    if (userIds.length >= maxScan) {
      truncated = true;
      break;
    }
  }

  return { userIds: userIds.slice(0, maxScan), truncated };
}
