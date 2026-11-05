import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decideCampaignPushFromPreferences,
  loadCampaignPreferenceSnapshots,
} from "@/lib/admin/notification-campaigns/campaign-eligibility";
import {
  campaignNeedsInApp,
  campaignNeedsPush,
  type AdminNotificationCampaignRow,
  type CampaignChannel,
} from "@/lib/admin/notification-campaigns/campaign-types";
import { countCampaignProfileAudience } from "@/lib/admin/notification-campaigns/campaign-target-scan";
import { loadActivePushTargets } from "@/lib/push/dispatch/load-active-push-targets";

export type CampaignAudiencePreviewInput = {
  type: AdminNotificationCampaignRow["type"];
  target_type: string;
  channel: CampaignChannel;
  segment_region_code?: string | null;
  target_user_ids?: string[];
};

export type CampaignAudiencePreview = {
  totalUsers: number;
  eligibleUsers: number;
  pushEligibleUsers: number;
  inAppEligibleUsers: number;
  activeDevices: number;
  androidDevices: number;
  iosDevices: number;
  webDevices: number;
  excludedNoDevice: number;
  excludedOptOut: number;
  excludedInvalidTarget: number;
  truncated: boolean;
  segmentUnsupported: boolean;
  /** 회원 설정을 읽지 못해 푸시 인원을 계산하지 못함 — 화면은 숫자 대신 「계산 실패」 (확정 설계 B-4) */
  pushPreviewFailed: boolean;
};

function platformBucket(platform: string | null | undefined, provider: string | null | undefined): "android" | "ios" | "web" | "other" {
  const p = String(platform ?? "").toLowerCase();
  const prov = String(provider ?? "").toLowerCase();
  if (p.includes("android") || prov === "fcm") return "android";
  if (p.includes("ios") || p.includes("iphone") || prov === "apns" || prov === "voip_apns") return "ios";
  if (p.includes("web") || prov === "web_push") return "web";
  return "other";
}

/**
 * Audience preview using the same target scan + eligibility as send batch.
 */
export async function previewCampaignAudience(
  svc: SupabaseClient,
  input: CampaignAudiencePreviewInput
): Promise<CampaignAudiencePreview> {
  const empty: CampaignAudiencePreview = {
    totalUsers: 0,
    eligibleUsers: 0,
    pushEligibleUsers: 0,
    inAppEligibleUsers: 0,
    activeDevices: 0,
    androidDevices: 0,
    iosDevices: 0,
    webDevices: 0,
    excludedNoDevice: 0,
    excludedOptOut: 0,
    excludedInvalidTarget: 0,
    truncated: false,
    segmentUnsupported: false,
    pushPreviewFailed: false,
  };

  if (input.target_type === "segment") {
    return { ...empty, segmentUnsupported: true };
  }

  let userIds: string[] = [];
  let truncated = false;
  let excludedInvalidTarget = 0;

  if (input.target_type === "selected_users") {
    const requested = [...new Set((input.target_user_ids ?? []).map((id) => id.trim()).filter(Boolean))];
    if (requested.length === 0) return empty;
    const { data: profiles } = await svc.from("profiles").select("id").in("id", requested);
    const found = new Set((profiles ?? []).map((r) => String((r as { id: string }).id)));
    userIds = requested.filter((id) => found.has(id));
    excludedInvalidTarget = requested.length - userIds.length;
  } else {
    const scanned = await countCampaignProfileAudience(
      svc,
      {
        target_type: input.target_type,
        segment_region_code: input.segment_region_code ?? null,
      },
      { maxScan: 5_000 }
    );
    userIds = scanned.userIds;
    truncated = scanned.truncated;
  }

  const needsPush = campaignNeedsPush(input.channel);
  const needsInApp = campaignNeedsInApp(input.channel);

  let pushEligibleUsers = 0;
  let excludedOptOut = 0;
  let excludedNoDevice = 0;
  let activeDevices = 0;
  let androidDevices = 0;
  let iosDevices = 0;
  let webDevices = 0;

  // 알림함은 대상 전원(Owner 2026-11-03) — 단 광고성(마케팅)은 직접 동의 회원만 (Owner 2026-11-05 · 발송과 같은 판정).
  const eligibleUsers = userIds.length;
  const marketingInboxGate = needsInApp && input.type === "marketing";
  let inAppEligibleUsers = needsInApp ? eligibleUsers : 0;

  // Cap device lookups for preview cost
  const deviceSample = userIds.slice(0, 800);
  const now = new Date();
  let preferenceSnapshots = new Map<string, Parameters<typeof decideCampaignPushFromPreferences>[2]>();
  if (needsPush || marketingInboxGate) {
    try {
      preferenceSnapshots = await loadCampaignPreferenceSnapshots(svc, deviceSample, now);
    } catch (e) {
      console.error("[campaign preview] preference read failed", e instanceof Error ? e.message : e);
      return {
        ...empty,
        totalUsers: userIds.length,
        eligibleUsers,
        inAppEligibleUsers: marketingInboxGate ? 0 : inAppEligibleUsers,
        truncated,
        excludedInvalidTarget,
        pushPreviewFailed: true,
      };
    }
  }
  if (marketingInboxGate && deviceSample.length > 0) {
    const consented = deviceSample.filter((id) => preferenceSnapshots.get(id)?.member?.marketingEnabled === true).length;
    inAppEligibleUsers = Math.round((consented * eligibleUsers) / deviceSample.length);
  }

  for (const userId of needsPush ? deviceSample : []) {
    // 푸시만 회원 동의·설정을 본다 — 발송 `evaluateCampaignPushGate` 와 같은 판정 함수·같은 설정 읽기 결과
    // (재감사 C-2). 방해금지는 미리보기 시각 기준.
    const snapshot = preferenceSnapshots.get(userId);
    if (!snapshot || !decideCampaignPushFromPreferences(input.type, userId, snapshot, now).allowed) {
      excludedOptOut += 1;
      continue;
    }

    // 발송과 같은 기기 거르기 — 운영 환경 · FCM 다기기 · 통화 전용(VoIP) 토큰 제외(캠페인을 받지 않음)
    const targets = (
      await loadActivePushTargets(svc, userId, { environment: "production", fcmMode: "multi_device_fcm" })
    ).filter((t) => String(t.push_provider ?? "").toLowerCase() !== "voip_apns");
    if (!targets.length) {
      excludedNoDevice += 1;
      continue;
    }
    pushEligibleUsers += 1;
    for (const t of targets) {
      activeDevices += 1;
      const bucket = platformBucket(t.platform, t.push_provider);
      if (bucket === "android") androidDevices += 1;
      else if (bucket === "ios") iosDevices += 1;
      else if (bucket === "web") webDevices += 1;
    }
  }

  // Scale pushEligible estimate if we sampled
  if (deviceSample.length > 0 && eligibleUsers > deviceSample.length) {
    const ratio = eligibleUsers / deviceSample.length;
    pushEligibleUsers = Math.round(pushEligibleUsers * ratio);
    excludedNoDevice = Math.round(excludedNoDevice * ratio);
    excludedOptOut = Math.round(excludedOptOut * ratio);
    activeDevices = Math.round(activeDevices * ratio);
    androidDevices = Math.round(androidDevices * ratio);
    iosDevices = Math.round(iosDevices * ratio);
    webDevices = Math.round(webDevices * ratio);
  }

  if (!needsPush) {
    pushEligibleUsers = 0;
    activeDevices = 0;
    androidDevices = 0;
    iosDevices = 0;
    webDevices = 0;
    excludedNoDevice = 0;
    excludedOptOut = 0;
  }

  return {
    totalUsers: userIds.length,
    eligibleUsers,
    pushEligibleUsers,
    inAppEligibleUsers,
    activeDevices,
    androidDevices,
    iosDevices,
    webDevices,
    excludedNoDevice,
    excludedOptOut,
    excludedInvalidTarget,
    truncated,
    segmentUnsupported: false,
    pushPreviewFailed: false,
  };
}
