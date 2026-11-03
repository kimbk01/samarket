import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampaignSkipReason } from "@/lib/admin/notification-campaigns/campaign-skip-reasons";
import type { AdminNotificationCampaignRow } from "@/lib/admin/notification-campaigns/campaign-types";
import {
  resolveWebPushDeliveryFromPreferences,
  shouldSendWebPushForUser,
  type WebPushDeliveryDecision,
} from "@/lib/notifications/web-push-user-settings-gate";
import { campaignPushPreferenceProbe } from "@/lib/admin/notification-campaigns/campaign-notification-presentation";
import type { NormalizedNotificationPreferenceSnapshot } from "@/lib/notifications/policy/notification-preference-normalized-snapshot";
import { normalizeNotificationPreferenceStorage } from "@/lib/notifications/policy/notification-preference-storage-normalizer";
import {
  LEGACY_USER_SETTINGS_PUSH_SELECT,
  NOTIFICATION_SETTINGS_SELECT,
} from "@/lib/notifications/policy/notification-preference-storage-reader.server";
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

/** 수신 설정 판정 결과(`reason`) → 어드민 발송 기록 사유. 미리보기·발송이 같은 표를 쓴다. */
export function campaignPushSkipReasonFromDecision(
  campaignType: AdminNotificationCampaignRow["type"],
  decision: WebPushDeliveryDecision | null
): CampaignSkipReason {
  switch (decision?.reason) {
    case "master_push_disabled":
      return "service_disabled";
    case "marketing_opt_out":
      return "marketing_not_opted_in";
    case "quiet_hours":
      return "quiet_hours";
    case "domain_disabled":
      // 이벤트·마케팅은 동의 영역, 공지·시스템·업데이트는 「공지 알림」 영역
      return campaignType === "marketing" ? "marketing_not_opted_in" : "notice_disabled";
    case "preference_read_failed":
    case undefined:
      return "policy_filtered";
    default:
      return "user_setting_blocked";
  }
}

/**
 * 푸시 받을지 판정 — 발송·미리보기 공통 (재감사 C-2).
 * 실제 발송과 같은 `resolveWebPushDeliveryFromPreferences` 를 같은 묶음 값(`campaignPushPreferenceProbe`)으로 부른다.
 * - 회원이 직접 끈 「알림 전체」·방해금지 → 제외
 * - 이벤트·마케팅 = 혜택·이벤트 수신 동의(`marketing_enabled`, 정본 1곳) 회원만
 * - 공지·시스템·업데이트 = 「공지 알림」 영역
 */
export function decideCampaignPushFromPreferences(
  campaignType: AdminNotificationCampaignRow["type"],
  userId: string,
  preferences: NormalizedNotificationPreferenceSnapshot,
  now: Date = new Date()
): { allowed: boolean; skipReason: CampaignSkipReason | null } {
  const decision = resolveWebPushDeliveryFromPreferences(
    campaignPushPreferenceProbe(campaignType, userId),
    "member",
    preferences,
    now
  );
  if (decision.sendPush) return { allowed: true, skipReason: null };
  return { allowed: false, skipReason: campaignPushSkipReasonFromDecision(campaignType, decision) };
}

/** 미리보기용 — 여러 회원의 설정을 한 번에 읽어 발송과 같은 정규화 결과로 만든다. */
export async function loadCampaignPreferenceSnapshots(
  svc: SupabaseClient,
  userIds: string[],
  now: Date = new Date()
): Promise<Map<string, NormalizedNotificationPreferenceSnapshot>> {
  const out = new Map<string, NormalizedNotificationPreferenceSnapshot>();
  if (userIds.length === 0) return out;
  const [{ data: nsRows }, { data: usRows }] = await Promise.all([
    svc.from("user_notification_settings").select(`user_id, ${NOTIFICATION_SETTINGS_SELECT}`).in("user_id", userIds),
    svc.from("user_settings").select(`user_id, ${LEGACY_USER_SETTINGS_PUSH_SELECT}`).in("user_id", userIds),
  ]);
  const ns = new Map<string, Record<string, unknown>>();
  const us = new Map<string, Record<string, unknown>>();
  for (const r of (nsRows ?? []) as Record<string, unknown>[]) ns.set(String(r.user_id ?? ""), r);
  for (const r of (usRows ?? []) as Record<string, unknown>[]) us.set(String(r.user_id ?? ""), r);
  for (const userId of userIds) {
    out.set(
      userId,
      normalizeNotificationPreferenceStorage({
        notificationSettingsRow: (ns.get(userId) ?? null) as never,
        legacyUserSettingsRow: (us.get(userId) ?? null) as never,
        ownerSettingsRow: null,
        adminOpsPreferenceRow: null,
        now,
      })
    );
  }
  return out;
}

export async function evaluateCampaignPushGate(
  svc: SupabaseClient,
  userId: string,
  pushPayload: NotificationSideEffectPayloadOut,
  campaignType: AdminNotificationCampaignRow["type"]
): Promise<{ allowed: boolean; skipReason: CampaignSkipReason | null; soundMode?: PushSoundMode | null }> {
  // D-Q3: 캠페인은 여기서 게이트를 거치고 dispatch 는 skip_settings_gate 로 보낸다 → 알림음·진동 끔을 함께 넘긴다.
  let decision: WebPushDeliveryDecision | null = null;
  // Consent fail-closed: preference gate throw/unavailable must not send (CD-1).
  const allowed = await shouldSendWebPushForUser(svc, userId, pushPayload, {
    onDecision: (d) => {
      decision = d;
    },
  }).catch(() => false);
  const soundMode = decision ? resolvePushSoundMode(decision) : null;
  if (allowed) return { allowed: true, skipReason: null, soundMode };
  // 막힌 이유 = 판정 결과 그대로 (재감사 A-3 — 예전엔 마케팅이면 이유 불문 「미동의」)
  return { allowed: false, skipReason: campaignPushSkipReasonFromDecision(campaignType, decision) };
}
