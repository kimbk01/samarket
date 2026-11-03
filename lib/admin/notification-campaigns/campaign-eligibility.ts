import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampaignSkipReason } from "@/lib/admin/notification-campaigns/campaign-skip-reasons";
import type { AdminNotificationCampaignRow } from "@/lib/admin/notification-campaigns/campaign-types";
import { shouldSendWebPushForUser } from "@/lib/notifications/web-push-user-settings-gate";
import { resolvePushSoundMode, type PushSoundMode } from "@/lib/push/dispatch/push-sound-mode";
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
  prefs: Map<string, { push_enabled?: boolean | null }>;
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
  const prefs = new Map<string, { push_enabled?: boolean | null }>();
  if (userIds.length === 0) return { notif, prefs };

  const [{ data: nsRows }, { data: usRows }] = await Promise.all([
    svc
      .from("user_notification_settings")
      .select(
        "user_id, service_enabled, marketing_enabled, notice_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end"
      )
      .in("user_id", userIds),
    svc.from("user_settings").select("user_id, push_enabled").in("user_id", userIds),
  ]);

  for (const r of nsRows ?? []) {
    const id = String((r as { user_id?: string }).user_id ?? "");
    if (id) notif.set(id, r as SettingsMaps["notif"] extends Map<string, infer V> ? V : never);
  }
  for (const r of usRows ?? []) {
    const id = String((r as { user_id?: string }).user_id ?? "");
    if (id) prefs.set(id, r as { push_enabled?: boolean | null });
  }
  return { notif, prefs };
}

/**
 * 알림함 대상 판정 — Owner 2026-11-03: 공지·시스템·업데이트·이벤트·마케팅 모두 **알림함은 전원**.
 * (이전: 마케팅은 광고 동의 2곳이 모두 true 여야 알림함까지 보냈다 = 한국식 사전 동의.)
 * 푸시 동의는 `evaluateCampaignPushPreference` · 발송 시 `evaluateCampaignPushGate` 가 본다.
 */
export function evaluateCampaignUserEligibility(
  _campaignType: AdminNotificationCampaignRow["type"],
  _userId: string,
  _maps: SettingsMaps
): { eligible: boolean; skipReason: CampaignSkipReason | null } {
  return { eligible: true, skipReason: null };
}

/**
 * 푸시 받을 회원 판정(미리보기 숫자용 — 발송은 `evaluateCampaignPushGate` 가 같은 규칙으로 최종 판정).
 * - 회원이 직접 끈 「알림 전체」 → 제외
 * - 이벤트·마케팅 = 혜택·이벤트 수신 동의(`user_notification_settings.marketing_enabled`, 정본 1곳) 회원만
 * - 공지·시스템 = 회원이 직접 끈 「공지 알림」만 제외
 */
export function evaluateCampaignPushPreference(
  campaignType: AdminNotificationCampaignRow["type"],
  userId: string,
  maps: SettingsMaps
): { allowed: boolean; skipReason: CampaignSkipReason | null } {
  const n = maps.notif.get(userId);
  const u = maps.prefs.get(userId);
  if (n?.service_enabled === false || u?.push_enabled === false) {
    return { allowed: false, skipReason: "service_disabled" };
  }
  if (campaignType === "marketing") {
    return n?.marketing_enabled === true
      ? { allowed: true, skipReason: null }
      : { allowed: false, skipReason: "marketing_not_opted_in" };
  }
  if (n?.notice_enabled === false) {
    return { allowed: false, skipReason: "notice_disabled" };
  }
  return { allowed: true, skipReason: null };
}

export async function evaluateCampaignPushGate(
  svc: SupabaseClient,
  userId: string,
  pushPayload: NotificationSideEffectPayloadOut
): Promise<{ allowed: boolean; skipReason: CampaignSkipReason | null; soundMode?: PushSoundMode | null }> {
  // D-Q3: 캠페인은 여기서 게이트를 거치고 dispatch 는 skip_settings_gate 로 보낸다 → 알림음·진동 끔을 함께 넘긴다.
  let soundMode: PushSoundMode | null = null;
  // Consent fail-closed: preference gate throw/unavailable must not send (CD-1).
  const allowed = await shouldSendWebPushForUser(svc, userId, pushPayload, {
    onDecision: (decision) => {
      soundMode = resolvePushSoundMode(decision);
    },
  }).catch(() => false);
  if (allowed) return { allowed: true, skipReason: null, soundMode };

  const kind =
    pushPayload.notification_type === "marketing"
      ? "marketing"
      : pushPayload.notification_type === "system"
        ? "notice"
        : "system";
  if (kind === "marketing") {
    // 혜택·이벤트 푸시 미동의 — 어드민 결과 「푸시 미동의」 칸 (Owner 2026-11-03)
    return { allowed: false, skipReason: "marketing_not_opted_in" };
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
