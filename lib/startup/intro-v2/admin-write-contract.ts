import { validateIntroTargeting } from "@/lib/startup/intro-v2/targeting";
import { validateIntroSceneContract } from "@/lib/startup/intro-v2/scenes";
import { validateIntroAssetRef } from "@/lib/startup/intro-v2/assets";
import { validatePublishedManifest } from "@/lib/startup/intro-v2/publication";
import {
  INTRO_CAMPAIGN_STATUSES,
  INTRO_DEEP_LINK_POLICIES,
  INTRO_DEVICE_FAMILIES,
  INTRO_FREQUENCY_MODES,
  isIn,
  type ContractResult,
} from "@/lib/startup/intro-v2/types";

export function validateIntroCampaignWrite(raw: unknown): ContractResult<{
  name: string;
  status: string;
  targeting: unknown;
  frequencyMode: string;
  deepLinkPolicy: string;
}> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "campaign_not_object" };
  }
  const rec = raw as Record<string, unknown>;
  const name = String(rec.name ?? "").trim();
  if (!name) return { ok: false, error: "campaign_name_required" };
  if (!isIn(INTRO_CAMPAIGN_STATUSES, rec.status ?? "draft")) {
    return { ok: false, error: "campaign_status_invalid" };
  }
  if (rec.playback_policy != null || rec.playbackPolicy != null) {
    return { ok: false, error: "playback_policy_forbidden" };
  }
  if (rec.target_audience != null || rec.targetAudience != null) {
    return { ok: false, error: "target_audience_enum_forbidden" };
  }
  const targeting = validateIntroTargeting(rec.targeting ?? { audiences: [], platforms: [], deviceClasses: [] });
  if (!targeting.ok) return targeting;
  if (!isIn(INTRO_FREQUENCY_MODES, rec.frequencyMode ?? "every_launch")) {
    return { ok: false, error: "frequency_mode_invalid" };
  }
  if (!isIn(INTRO_DEEP_LINK_POLICIES, rec.deepLinkPolicy ?? "honor")) {
    return { ok: false, error: "deep_link_policy_invalid" };
  }
  const startsAt = rec.startsAt == null ? null : Date.parse(String(rec.startsAt));
  const endsAt = rec.endsAt == null ? null : Date.parse(String(rec.endsAt));
  if (startsAt != null && !Number.isFinite(startsAt)) return { ok: false, error: "starts_at_invalid" };
  if (endsAt != null && !Number.isFinite(endsAt)) return { ok: false, error: "ends_at_invalid" };
  if (startsAt != null && endsAt != null && endsAt < startsAt) return { ok: false, error: "schedule_invalid" };
  return {
    ok: true,
    value: {
      name,
      status: String(rec.status ?? "draft"),
      targeting: targeting.value,
      frequencyMode: String(rec.frequencyMode ?? "every_launch"),
      deepLinkPolicy: String(rec.deepLinkPolicy ?? "honor"),
    },
  };
}

export function validateIntroDeviceOverrideFamily(family: unknown): ContractResult<string> {
  if (!isIn(INTRO_DEVICE_FAMILIES, family)) return { ok: false, error: "device_family_invalid" };
  return { ok: true, value: family };
}

export function validateIntroPublishPayload(raw: unknown): ContractResult<true> {
  const campaign = validateIntroCampaignWrite(raw);
  if (!campaign.ok) return campaign;
  const rec = raw as Record<string, unknown>;
  if (rec.requiresAdminConfirmation === true) {
    return { ok: false, error: "requires_admin_confirmation" };
  }
  if (!Array.isArray(rec.scenes) || rec.scenes.length < 1) return { ok: false, error: "scenes_required" };
  for (const scene of rec.scenes) {
    const ok = validateIntroSceneContract(scene, { allowIncompleteAdvance: false });
    if (!ok.ok) return ok;
  }
  if (Array.isArray(rec.assets)) {
    for (const asset of rec.assets) {
      const ok = validateIntroAssetRef(asset);
      if (!ok.ok) return ok;
    }
  }
  return { ok: true, value: true };
}

export function assertPublishedDoesNotContainDraft(raw: unknown): ContractResult<true> {
  const manifest = validatePublishedManifest(raw);
  if (!manifest.ok) return manifest;
  const text = JSON.stringify(raw);
  if (text.includes('"draftRevision"') || text.includes('"updatedBy"') || text.includes('"requiresAdminConfirmation"')) {
    return { ok: false, error: "draft_field_leak" };
  }
  return { ok: true, value: true };
}
