/**
 * Admin resolver preview — same pure resolver as Phase 1 runtime.
 */

import { deriveIntroLiveFlags, resolveIntroWinnerId } from "@/lib/startup/intro-v2/live-status";
import { resolveIntroCampaign } from "@/lib/startup/intro-v2/resolver";
import {
  INTRO_AUDIENCES,
  INTRO_DEVICE_CLASSES,
  INTRO_PLATFORMS,
  isIn,
  type IntroAudience,
  type IntroDeviceClass,
  type IntroPlatform,
  type IntroResolverCandidate,
  type IntroResolverInput,
} from "@/lib/startup/intro-v2/types";

export type IntroResolverPreviewFixture = {
  now: string;
  audience: IntroAudience | "unknown";
  platform: IntroPlatform | "unknown";
  deviceClass: IntroDeviceClass;
  frequencyEligible: boolean;
};

export const INTRO_RESOLVER_PREVIEW_DEFAULT: IntroResolverPreviewFixture = {
  now: "2026-10-01T01:00:00.000Z",
  audience: "guest",
  platform: "android",
  deviceClass: "PHONE_ANDROID",
  frequencyEligible: true,
};

export function parseIntroResolverPreviewFixture(raw: unknown): IntroResolverPreviewFixture {
  const rec = raw != null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const now = String(rec.now ?? INTRO_RESOLVER_PREVIEW_DEFAULT.now);
  const audience =
    rec.audience === "unknown" || isIn(INTRO_AUDIENCES, rec.audience)
      ? rec.audience
      : INTRO_RESOLVER_PREVIEW_DEFAULT.audience;
  const platform =
    rec.platform === "unknown" || isIn(INTRO_PLATFORMS, rec.platform)
      ? rec.platform
      : INTRO_RESOLVER_PREVIEW_DEFAULT.platform;
  const deviceClass = isIn(INTRO_DEVICE_CLASSES, rec.deviceClass)
    ? rec.deviceClass
    : INTRO_RESOLVER_PREVIEW_DEFAULT.deviceClass;
  return {
    now: Number.isFinite(Date.parse(now)) ? now : INTRO_RESOLVER_PREVIEW_DEFAULT.now,
    audience,
    platform,
    deviceClass,
    frequencyEligible: rec.frequencyEligible !== false,
  };
}

export type IntroResolverPreviewResult = {
  winner: { id: string; name: string; publicationId: string; revision: number } | null;
  reasonCodes: string[];
  reasonKo: string;
  reasonEn: string;
  zeroIntro: boolean;
};

export function previewIntroResolver(
  candidates: readonly (IntroResolverCandidate & { name?: string })[],
  fixture: IntroResolverInput
): IntroResolverPreviewResult {
  const winner = resolveIntroCampaign(candidates, fixture);
  if (!winner) {
    const reasons: string[] = [];
    if (!fixture.frequencyEligible) reasons.push("frequency_not_eligible");
    if (!Number.isFinite(Date.parse(fixture.now))) reasons.push("now_invalid");
    if (candidates.length === 0) reasons.push("no_live_publication");
    else reasons.push("no_eligible_campaign");
    return {
      winner: null,
      reasonCodes: reasons,
      reasonKo: reasons.includes("frequency_not_eligible")
        ? "빈도 조건에 맞지 않아 인트로가 없습니다."
        : "조건에 맞는 캠페인이 없습니다.",
      reasonEn: reasons.includes("frequency_not_eligible")
        ? "ZERO INTRO because frequency is not eligible."
        : "ZERO INTRO — no eligible campaign.",
      zeroIntro: true,
    };
  }
  const named = candidates.find((c) => c.id === winner.id);
  const reasons = ["ACTIVE", "schedule_matched", "target_matched", "priority_winner"];
  return {
    winner: {
      id: winner.id,
      name: named?.name ?? winner.id,
      publicationId: winner.publicationId,
      revision: winner.revision,
    },
    reasonCodes: reasons,
    reasonKo: "활성 · 일정 일치 · 대상 일치 · 우선순위 승자",
    reasonEn: "ACTIVE · schedule matched · target matched · priority winner",
    zeroIntro: false,
  };
}

export function attachWinnerFlags<T extends {
  id: string;
  status: IntroResolverCandidate["status"];
  startsAt: string | null;
  endsAt: string | null;
  targeting: IntroResolverCandidate["targeting"];
  frequencyMode: string;
}>(
  rows: readonly T[],
  candidates: readonly IntroResolverCandidate[],
  fixture: IntroResolverInput
): Array<T & { liveNow: boolean; derived: string }> {
  const winnerId = resolveIntroWinnerId(candidates, fixture);
  return rows.map((row) => {
    const flags = deriveIntroLiveFlags({
      status: row.status,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      targeting: row.targeting,
      frequencyMode: row.frequencyMode,
      nowIso: fixture.now,
      winnerId,
      campaignId: row.id,
    });
    return { ...row, liveNow: flags.liveNow, derived: flags.derived };
  });
}
