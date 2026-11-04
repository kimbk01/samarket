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

/** 수신 설정 판정 결과(`reason`) → 어드민 발송 기록 사유. 미리보기·발송이 같은 표를 쓴다. */
export function campaignPushSkipReasonFromDecision(
  campaignType: AdminNotificationCampaignRow["type"],
  decision: WebPushDeliveryDecision | null
): CampaignSkipReason {
  // 확정 설계 B-2 — 미동의·공지 끔·전체 끔이 방해금지보다 먼저(방해금지가 끝나도 못 받는 이유).
  const domain = decision?.domainPushReason;
  const reason =
    domain === "master_push_disabled" || domain === "marketing_opt_out" || domain === "domain_disabled"
      ? domain
      : decision?.reason;
  switch (reason) {
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
  const [{ data: nsRows, error: nsErr }, { data: usRows, error: usErr }] = await Promise.all([
    svc.from("user_notification_settings").select(`user_id, ${NOTIFICATION_SETTINGS_SELECT}`).in("user_id", userIds),
    svc.from("user_settings").select(`user_id, ${LEGACY_USER_SETTINGS_PUSH_SELECT}`).in("user_id", userIds),
  ]);
  // 확정 설계 B-4 — 읽기 실패를 「설정 없음(기본값)」으로 바꾸지 않는다. 미리보기가 틀린 숫자 대신 실패를 보인다.
  if (nsErr || usErr) {
    throw new Error(`campaign_preference_read_failed:${(nsErr ?? usErr)?.message ?? "unknown"}`);
  }
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
