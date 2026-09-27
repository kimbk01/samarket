/**
 * Derived Admin live status — stored status is not the operator truth.
 * LIVE NOW uses the same resolver eligibility as Phase 1 runtime.
 */

import { resolveIntroCampaign } from "@/lib/startup/intro-v2/resolver";
import { targetingMatches } from "@/lib/startup/intro-v2/targeting";
import type {
  IntroCampaignStatus,
  IntroResolverCandidate,
  IntroResolverInput,
  IntroTargeting,
} from "@/lib/startup/intro-v2/types";

export const INTRO_DERIVED_STATUSES = [
  "LIVE_NOW",
  "SCHEDULED",
  "PAUSED",
  "EXPIRED",
  "DRAFT",
  "ARCHIVED",
  "ACTIVE",
  "TARGET_LIMITED",
  "DEVICE_LIMITED",
  "FREQUENCY_CONTROLLED",
] as const;
export type IntroDerivedStatus = (typeof INTRO_DERIVED_STATUSES)[number];

export type IntroLiveFlags = {
  storedStatus: IntroCampaignStatus;
  derived: IntroDerivedStatus;
  liveNow: boolean;
  scheduled: boolean;
  paused: boolean;
  expired: boolean;
  targetLimited: boolean;
  deviceLimited: boolean;
  frequencyControlled: boolean;
  isResolverWinner: boolean;
};

function scheduleWindow(startsAt: string | null, endsAt: string | null, nowMs: number): {
  notStarted: boolean;
  ended: boolean;
  inWindow: boolean;
} {
  const starts = startsAt ? Date.parse(startsAt) : null;
  const ends = endsAt ? Date.parse(endsAt) : null;
  const notStarted = starts != null && Number.isFinite(starts) && nowMs < starts;
  const ended = ends != null && Number.isFinite(ends) && nowMs > ends;
  return { notStarted, ended, inWindow: !notStarted && !ended };
}

export function deriveIntroLiveFlags(input: {
  status: IntroCampaignStatus;
  startsAt: string | null;
  endsAt: string | null;
  targeting: IntroTargeting;
  frequencyMode: string;
  nowIso: string;
  winnerId: string | null;
  campaignId: string;
}): IntroLiveFlags {
  const nowMs = Date.parse(input.nowIso);
  const window = Number.isFinite(nowMs)
    ? scheduleWindow(input.startsAt, input.endsAt, nowMs)
    : { notStarted: false, ended: false, inWindow: false };

  const targetLimited =
    input.targeting.audiences.length > 0 || input.targeting.platforms.length > 0;
  const deviceLimited = input.targeting.deviceClasses.length > 0;
  const frequencyControlled = input.frequencyMode !== "every_launch";
  const isResolverWinner = input.winnerId != null && input.winnerId === input.campaignId;

  let derived: IntroDerivedStatus = "DRAFT";
  if (input.status === "archived") derived = "ARCHIVED";
  else if (input.status === "paused") derived = "PAUSED";
  else if (input.status === "expired" || (input.status === "active" && window.ended)) {
    derived = "EXPIRED";
  } else if (input.status === "draft") derived = "DRAFT";
  else if (input.status === "scheduled" || (input.status === "active" && window.notStarted)) {
    derived = "SCHEDULED";
  } else if (isResolverWinner) derived = "LIVE_NOW";
  else if (input.status === "active") derived = "ACTIVE";

  return {
    storedStatus: input.status,
    derived,
    liveNow: isResolverWinner,
    scheduled: derived === "SCHEDULED",
    paused: input.status === "paused",
    expired: derived === "EXPIRED",
    targetLimited,
    deviceLimited,
    frequencyControlled,
    isResolverWinner,
  };
}

export function resolveIntroWinnerId(
  candidates: readonly IntroResolverCandidate[],
  fixture: IntroResolverInput
): string | null {
  return resolveIntroCampaign(candidates, fixture)?.id ?? null;
}

export function campaignWouldMatchFixture(
  targeting: IntroTargeting,
  fixture: IntroResolverInput
): boolean {
  return targetingMatches(targeting, {
    audience: fixture.audience,
    platform: fixture.platform,
    deviceClass: fixture.deviceClass,
  });
}

export function introDerivedStatusLabel(
  derived: IntroDerivedStatus,
  lang: "ko" | "en"
): string {
  const map: Record<IntroDerivedStatus, { ko: string; en: string }> = {
    LIVE_NOW: { ko: "현재 노출 중", en: "Currently live" },
    SCHEDULED: { ko: "예약됨", en: "Scheduled" },
    PAUSED: { ko: "일시중지", en: "Paused" },
    EXPIRED: { ko: "노출 종료", en: "Ended" },
    DRAFT: { ko: "초안", en: "Draft" },
    ARCHIVED: { ko: "보관", en: "Archived" },
    ACTIVE: { ko: "활성", en: "Active" },
    TARGET_LIMITED: { ko: "대상 제한", en: "Target limited" },
    DEVICE_LIMITED: { ko: "기기 제한", en: "Device limited" },
    FREQUENCY_CONTROLLED: { ko: "빈도 제어", en: "Frequency controlled" },
  };
  return lang === "en" ? map[derived].en : map[derived].ko;
}
