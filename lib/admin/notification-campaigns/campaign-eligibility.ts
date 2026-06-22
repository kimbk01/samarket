import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampaignSkipReason } from "@/lib/admin/notification-campaigns/campaign-skip-reasons";
import type { AdminNotificationCampaignRow } from "@/lib/admin/notification-campaigns/campaign-types";
import { shouldSendWebPushForUser } from "@/lib/notifications/web-push-user-settings-gate";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";

export type SettingsMaps = {
  notif: Map<
    string,
    {
      service_enabled?: boolean | null;
      marketing_enabled?: boolean | null;
      notice_enabled?: boolean | null;
      quiet_hours_enabled?: boolean | null;
      quiet_hours_start?: string | null;
      quiet_hours_end?: string | null;
    }
  >;
  prefs: Map<string, { marketing_push_enabled?: boolean | null; push_enabled?: boolean | null }>;
};

export async function loadCampaignSettingsMaps(
  svc: SupabaseClient,
  userIds: string[]
): Promise<SettingsMaps> {
  const notif = new Map<
    string,
    {
      service_enabled?: boolean | null;
      marketing_enabled?: boolean | null;
      notice_enabled?: boolean | null;
      quiet_hours_enabled?: boolean | null;
      quiet_hours_start?: string | null;
      quiet_hours_end?: string | null;
    }
  >();
  const prefs = new Map<string, { marketing_push_enabled?: boolean | null; push_enabled?: boolean | null }>();
  if (userIds.length === 0) return { notif, prefs };

  const [{ data: nsRows }, { data: usRows }] = await Promise.all([
    svc
      .from("user_notification_settings")
      .select(
        "user_id, service_enabled, marketing_enabled, notice_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end"
      )
      .in("user_id", userIds),
    svc.from("user_settings").select("user_id, marketing_push_enabled, push_enabled").in("user_id", userIds),
  ]);

  for (const r of nsRows ?? []) {
    const id = String((r as { user_id?: string }).user_id ?? "");
    if (id) notif.set(id, r as SettingsMaps["notif"] extends Map<string, infer V> ? V : never);
  }
  for (const r of usRows ?? []) {
    const id = String((r as { user_id?: string }).user_id ?? "");
    if (id) prefs.set(id, r as { marketing_push_enabled?: boolean | null; push_enabled?: boolean | null });
  }
  return { notif, prefs };
}

export function evaluateCampaignUserEligibility(
  campaignType: AdminNotificationCampaignRow["type"],
  userId: string,
  maps: SettingsMaps
): { eligible: boolean; skipReason: CampaignSkipReason | null } {
  const n = maps.notif.get(userId);
  const u = maps.prefs.get(userId);

  if (n?.service_enabled === false || u?.push_enabled === false) {
    return { eligible: false, skipReason: "service_disabled" };
  }

  if (campaignType === "marketing") {
    if (n?.marketing_enabled !== true) {
      return { eligible: false, skipReason: "marketing_not_opted_in" };
    }
    if (u?.marketing_push_enabled !== true) {
      return { eligible: false, skipReason: "user_setting_blocked" };
    }
    return { eligible: true, skipReason: null };
  }

  if (campaignType === "notice") {
    if (n?.notice_enabled === false) {
      return { eligible: false, skipReason: "notice_disabled" };
    }
    return { eligible: true, skipReason: null };
  }

  return { eligible: true, skipReason: null };
}

export async function evaluateCampaignPushGate(
  svc: SupabaseClient,
  userId: string,
  pushPayload: NotificationSideEffectPayloadOut
): Promise<{ allowed: boolean; skipReason: CampaignSkipReason | null }> {
  const allowed = await shouldSendWebPushForUser(svc, userId, pushPayload).catch(() => true);
  if (allowed) return { allowed: true, skipReason: null };

  const kind =
    pushPayload.notification_type === "marketing"
      ? "marketing"
      : pushPayload.notification_type === "system"
        ? "notice"
        : "system";
  if (kind === "marketing") {
    return { allowed: false, skipReason: "user_setting_blocked" };
  }

  const [{ data: ns }, { data: us }] = await Promise.all([
    svc
      .from("user_notification_settings")
      .select("quiet_hours_enabled, quiet_hours_start, quiet_hours_end, notice_enabled, service_enabled")
      .eq("user_id", userId)
      .maybeSingle(),
    svc
      .from("user_settings")
      .select("do_not_disturb_enabled, push_enabled, marketing_push_enabled")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (ns?.service_enabled === false || us?.push_enabled === false) {
    return { allowed: false, skipReason: "service_disabled" };
  }
  if (kind === "notice" && ns?.notice_enabled === false) {
    return { allowed: false, skipReason: "notice_disabled" };
  }
  if (ns?.quiet_hours_enabled === true || us?.do_not_disturb_enabled === true) {
    return { allowed: false, skipReason: "quiet_hours" };
  }
  return { allowed: false, skipReason: "user_setting_blocked" };
}
