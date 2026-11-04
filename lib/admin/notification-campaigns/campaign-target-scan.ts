import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminNotificationCampaignRow } from "@/lib/admin/notification-campaigns/campaign-types";

export const CAMPAIGN_ACTIVE_USER_DAYS = 30;

/** `active_users` 기준 시각 — 회차 시작 때 1회 정해 회차(`active_since`)에 저장한다 (확정 설계 B-11). */
export function campaignActiveUsersSince(now: Date = new Date()): string {
  return new Date(now.getTime() - CAMPAIGN_ACTIVE_USER_DAYS * 86_400_000).toISOString();
}

/**
 * Shared target scan used by batch send and audience preview — no segment fallback.
 * 확정 설계 B-11: 위치(offset)가 아니라 **마지막으로 처리한 id 다음**부터 읽는다 — 발송 중 회원이 가입·탈퇴해도
 * 건너뛰거나 두 번 읽지 않는다. `afterId = null` 이면 처음부터.
 */
export async function fetchCampaignProfileScanSlice(
  svc: SupabaseClient,
  campaign: Pick<AdminNotificationCampaignRow, "target_type" | "segment_region_code">,
  afterId: string | null,
  limit: number,
  opts?: { throwOnError?: boolean; activeSince?: string | null }
): Promise<string[]> {
  const tt = campaign.target_type;

  if (tt === "segment" || tt === "selected_users") {
    return [];
  }

  if (tt === "marketing_opt_in") {
    let q = svc
      .from("user_notification_settings")
      .select("user_id")
      .eq("marketing_enabled", true)
      .order("user_id", { ascending: true })
      .limit(limit);
    if (afterId) q = q.gt("user_id", afterId);
    const { data, error } = await q;
    if (error) {
      console.error("[campaign scan marketing_opt_in]", error.message);
      if (opts?.throwOnError) throw new Error(`target_scan_failed:${error.message}`);
      return [];
    }
    return (data ?? []).map((r) => String((r as { user_id: string }).user_id)).filter(Boolean);
  }

  if (tt !== "all" && tt !== "region" && tt !== "active_users") {
    console.error("[campaign scan] unsupported target_type", tt);
    return [];
  }

  let q = svc.from("profiles").select("id").order("id", { ascending: true }).limit(limit);
  if (afterId) q = q.gt("id", afterId);
  if (tt === "region" && campaign.segment_region_code?.trim()) {
    q = q.eq("region_code", campaign.segment_region_code.trim());
  } else if (tt === "active_users") {
    q = q.gte("updated_at", opts?.activeSince || campaignActiveUsersSince());
  }

  const { data, error } = await q;
  if (error) {
    console.error("[campaign scan profiles]", error.message);
    if (opts?.throwOnError) throw new Error(`target_scan_failed:${error.message}`);
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
  let cursor: string | null = null;
  let truncated = false;
  const activeSince = campaignActiveUsersSince();

  while (userIds.length < maxScan) {
    const slice = await fetchCampaignProfileScanSlice(svc, campaign, cursor, page, { activeSince });
    if (slice.length === 0) break;
    userIds.push(...slice);
    cursor = slice[slice.length - 1] ?? null;
    if (slice.length < page) break;
    if (userIds.length >= maxScan) {
      truncated = true;
      break;
    }
  }

  return { userIds: userIds.slice(0, maxScan), truncated };
}
