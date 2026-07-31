import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateCampaignUserEligibility,
  loadCampaignSettingsMaps,
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

  const maps = await loadCampaignSettingsMaps(svc, userIds);
  const needsPush = campaignNeedsPush(input.channel);
  const needsInApp = campaignNeedsInApp(input.channel);

  let eligibleUsers = 0;
  let pushEligibleUsers = 0;
  let inAppEligibleUsers = 0;
  let excludedOptOut = 0;
  let excludedNoDevice = 0;
  let activeDevices = 0;
  let androidDevices = 0;
  let iosDevices = 0;
  let webDevices = 0;

  // Cap device lookups for preview cost
  const deviceSample = userIds.slice(0, 800);

  for (const userId of userIds) {
    const eligibility = evaluateCampaignUserEligibility(input.type, userId, maps);
    if (!eligibility.eligible) {
      excludedOptOut += 1;
      continue;
    }
    eligibleUsers += 1;
    if (needsInApp) inAppEligibleUsers += 1;
  }

  for (const userId of deviceSample) {
    const eligibility = evaluateCampaignUserEligibility(input.type, userId, maps);
    if (!eligibility.eligible) continue;
    if (!needsPush) continue;

    const targets = await loadActivePushTargets(svc, userId);
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
  };
}
