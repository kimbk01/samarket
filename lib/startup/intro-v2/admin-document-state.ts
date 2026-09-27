/**
 * Operator document states — never UUID or ISO timestamp as primary state.
 */

import type { IntroAdminCampaign } from "@/lib/startup/intro-v2/admin-editor-model";
import type { IntroAdminIssue } from "@/lib/startup/intro-v2/admin-validate";
import {
  validatePublishedManifest,
  type IntroPublishedManifest,
} from "@/lib/startup/intro-v2/publication";

export const INTRO_DOCUMENT_STATES = [
  "DRAFT",
  "UNSAVED_CHANGES",
  "SAVING",
  "SAVED",
  "VALIDATION_ERROR",
  "SCHEDULED",
  "PUBLISHED",
  "DIRTY_AFTER_PUBLISH",
  "PAUSED",
  "ARCHIVED",
] as const;
export type IntroDocumentState = (typeof INTRO_DOCUMENT_STATES)[number];

function normIso(value: string | null): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : value;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, stable((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

function authorityFingerprint(input: {
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  priority: number;
  targeting: unknown;
  frequencyMode: string;
  deepLinkPolicy: string;
  scenes: unknown;
  deviceOverrides: unknown;
}): string {
  return JSON.stringify(
    stable({
      name: input.name,
      startsAt: normIso(input.startsAt),
      endsAt: normIso(input.endsAt),
      timezone: input.timezone,
      priority: input.priority,
      targeting: input.targeting,
      frequencyMode: input.frequencyMode,
      deepLinkPolicy: input.deepLinkPolicy,
      scenes: input.scenes,
      deviceOverrides: input.deviceOverrides,
    })
  );
}

export function introDraftFingerprint(campaign: IntroAdminCampaign): string {
  return JSON.stringify({
    name: campaign.name,
    status: campaign.status,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    timezone: campaign.timezone,
    priority: campaign.priority,
    targeting: campaign.targeting,
    frequencyMode: campaign.frequencyMode,
    deepLinkPolicy: campaign.deepLinkPolicy,
    scenes: campaign.scenes,
    deviceOverrides: campaign.deviceOverrides,
  });
}

export function introCampaignAuthorityFingerprint(campaign: IntroAdminCampaign): string {
  return authorityFingerprint({
    name: campaign.name,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    timezone: campaign.timezone,
    priority: campaign.priority,
    targeting: campaign.targeting,
    frequencyMode: campaign.frequencyMode,
    deepLinkPolicy: campaign.deepLinkPolicy,
    scenes: campaign.scenes.map((s) => ({
      id: s.id,
      name: s.name,
      sortOrder: s.sortOrder,
      advanceMode: s.advanceMode,
      durationMs: s.durationMs,
      maxHoldMs: s.maxHoldMs,
      transition: s.transition,
      skipPolicy: s.skipPolicy,
      interactionMode: s.interactionMode,
      interactionLayerId: s.interactionLayerId,
      layers: s.layers,
      cta: s.cta,
      backgroundColor: s.backgroundColor,
      backgroundAssetId: s.backgroundAssetId,
    })),
    deviceOverrides: campaign.deviceOverrides.map((o) => ({
      deviceFamily: o.deviceFamily,
      sceneId: o.sceneId,
      layers: o.layers,
      backgroundAssetId: o.backgroundAssetId,
    })),
  });
}

export function introManifestAuthorityFingerprint(manifest: IntroPublishedManifest): string {
  return authorityFingerprint({
    name: manifest.campaign.name,
    startsAt: manifest.campaign.startsAt,
    endsAt: manifest.campaign.endsAt,
    timezone: manifest.campaign.timezone,
    priority: manifest.campaign.priority,
    targeting: manifest.targeting,
    frequencyMode: manifest.frequencyMode,
    deepLinkPolicy: manifest.deepLinkPolicy,
    scenes: manifest.scenes,
    deviceOverrides: manifest.deviceOverrides,
  });
}

export function introDraftDivergedFromPublication(
  campaign: IntroAdminCampaign,
  manifest: unknown
): boolean {
  const checked = validatePublishedManifest(manifest);
  if (!checked.ok) return false;
  return introCampaignAuthorityFingerprint(campaign) !== introManifestAuthorityFingerprint(checked.value);
}

export function resolveIntroDocumentState(input: {
  campaign: IntroAdminCampaign;
  dirty: boolean;
  saving: boolean;
  issues: readonly IntroAdminIssue[];
}): IntroDocumentState {
  if (input.saving) return "SAVING";
  if (input.issues.length > 0) return "VALIDATION_ERROR";
  if (input.campaign.status === "archived") return "ARCHIVED";
  if (input.campaign.status === "paused") return "PAUSED";
  if (input.campaign.published && (input.dirty || input.campaign.draftDivergedFromPublication)) {
    return "DIRTY_AFTER_PUBLISH";
  }
  if (input.dirty) return "UNSAVED_CHANGES";
  if (input.campaign.published) return "PUBLISHED";
  if (input.campaign.status === "scheduled") return "SCHEDULED";
  if (!input.dirty && input.campaign.updatedAt) return "SAVED";
  return "DRAFT";
}

export function introDocumentStateLabel(
  state: IntroDocumentState,
  lang: "ko" | "en",
  revision?: number | null
): string {
  const rev = revision != null && revision > 0 ? revision : null;
  const map: Record<IntroDocumentState, { ko: string; en: string }> = {
    DRAFT: { ko: "초안", en: "Draft" },
    UNSAVED_CHANGES: { ko: "저장하지 않은 변경사항", en: "Unsaved changes" },
    SAVING: { ko: "저장 중", en: "Saving" },
    SAVED: { ko: "저장됨", en: "Saved" },
    VALIDATION_ERROR: { ko: "검사 오류", en: "Validation error" },
    SCHEDULED: { ko: "예약됨", en: "Scheduled" },
    PUBLISHED: {
      ko: rev != null ? `게시됨 · Revision ${rev}` : "게시됨",
      en: rev != null ? `Published · Revision ${rev}` : "Published",
    },
    DIRTY_AFTER_PUBLISH: { ko: "게시 후 변경사항 있음", en: "Changed after publish" },
    PAUSED: { ko: "일시중지", en: "Paused" },
    ARCHIVED: { ko: "보관", en: "Archived" },
  };
  return lang === "en" ? map[state].en : map[state].ko;
}
