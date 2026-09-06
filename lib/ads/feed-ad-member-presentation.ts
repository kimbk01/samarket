/**
 * Member/Admin presentation projection for Feed Banner lifecycle (PHASE 3).
 *
 * CONTRACT:
 * - Prefer **campaign** status + window over request row copies when present.
 * - Campaign `ended` ⇒ display `ended` even if request.status is still `active`
 *   (orphan request rows must not look like feed-eligible "광고중").
 * - Natural window expiry is RESOLVER-ONLY (no cron required for feed).
 * - Writers that end a campaign MUST also mark the linked request ended
 *   (`endFeedAdCampaign` / sync helper) so admin filters stay honest.
 */

import { isFeedAdCampaignEligibleNow } from "@/lib/ads/feed-ad-placement";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { formatAppDateTime } from "@/lib/i18n/locale-for-app-language";

export type FeedAdMemberDisplayStatus =
  | "pending_review"
  | "scheduled"
  | "active"
  | "paused"
  | "rejected"
  | "ended"
  | "cancelled";

export type FeedAdMemberPresentation = {
  displayStatus: FeedAdMemberDisplayStatus;
  /** Same rule as feed delivery eligibility when a campaign window exists. */
  eligible: boolean;
  remainingMs: number | null;
  startAt: string | null;
  endAt: string | null;
};

/**
 * Resolve the window + campaign status used for ops/member projection.
 * Campaign window fields override request copies when provided; otherwise request window.
 */
export function resolveFeedAdPresentationInputs(input: {
  requestStatus: string;
  requestStartAt?: string | null;
  requestEndAt?: string | null;
  campaignStatus?: string | null;
  campaignStartAt?: string | null;
  campaignEndAt?: string | null;
}): {
  requestStatus: string;
  campaignStatus: string | null;
  startAt: string | null;
  endAt: string | null;
} {
  return {
    requestStatus: String(input.requestStatus ?? "").trim().toLowerCase(),
    campaignStatus:
      input.campaignStatus != null && String(input.campaignStatus).trim() !== ""
        ? String(input.campaignStatus).trim().toLowerCase()
        : null,
    startAt:
      input.campaignStartAt !== undefined && input.campaignStartAt !== null
        ? input.campaignStartAt
        : (input.requestStartAt ?? null),
    endAt:
      input.campaignEndAt !== undefined && input.campaignEndAt !== null
        ? input.campaignEndAt
        : (input.requestEndAt ?? null),
  };
}

export function projectFeedAdMemberPresentation(input: {
  requestStatus: string;
  startAt?: string | null;
  endAt?: string | null;
  /** When set, campaign terminal status overrides stale request.status=active. */
  campaignStatus?: string | null;
  nowMs?: number;
}): FeedAdMemberPresentation {
  const nowMs = input.nowMs ?? Date.now();
  const startAt = input.startAt ?? null;
  const endAt = input.endAt ?? null;
  const rs = String(input.requestStatus ?? "").trim().toLowerCase();
  const cs =
    input.campaignStatus != null
      ? String(input.campaignStatus).trim().toLowerCase()
      : null;

  if (rs === "pending_review" || rs === "pending" || rs === "held") {
    return {
      displayStatus: "pending_review",
      eligible: false,
      remainingMs: null,
      startAt,
      endAt,
    };
  }
  if (rs === "rejected") {
    return {
      displayStatus: "rejected",
      eligible: false,
      remainingMs: null,
      startAt,
      endAt,
    };
  }
  if (rs === "cancelled") {
    return {
      displayStatus: "cancelled",
      eligible: false,
      remainingMs: null,
      startAt,
      endAt,
    };
  }

  // Campaign ended/paused/draft ⇒ not advertising (even if request row stuck active).
  if (cs === "ended" || cs === "expired") {
    return {
      displayStatus: "ended",
      eligible: false,
      remainingMs: 0,
      startAt,
      endAt,
    };
  }
  if (cs === "paused") {
    const rem =
      endAt && Number.isFinite(Date.parse(endAt))
        ? Math.max(0, Date.parse(endAt) - nowMs)
        : null;
    return {
      displayStatus: "paused",
      eligible: false,
      remainingMs: rem,
      startAt,
      endAt,
    };
  }
  if (cs != null && cs !== "" && cs !== "active" && cs !== "scheduled") {
    return {
      displayStatus: "ended",
      eligible: false,
      remainingMs: 0,
      startAt,
      endAt,
    };
  }

  const eligibilityStatus = cs === "scheduled" ? "scheduled" : "active";
  const eligible = isFeedAdCampaignEligibleNow(
    { status: eligibilityStatus, startAt, endAt },
    nowMs
  );

  if (startAt) {
    const t = Date.parse(startAt);
    if (Number.isFinite(t) && t > nowMs) {
      return {
        displayStatus: "scheduled",
        eligible: false,
        remainingMs: null,
        startAt,
        endAt,
      };
    }
  }

  if (endAt) {
    const t = Date.parse(endAt);
    if (Number.isFinite(t) && t <= nowMs) {
      return {
        displayStatus: "ended",
        eligible: false,
        remainingMs: 0,
        startAt,
        endAt,
      };
    }
  }

  if (rs === "ended" || rs === "expired") {
    return {
      displayStatus: "ended",
      eligible: false,
      remainingMs: 0,
      startAt,
      endAt,
    };
  }

  let remainingMs: number | null = null;
  if (endAt) {
    const t = Date.parse(endAt);
    if (Number.isFinite(t)) remainingMs = Math.max(0, t - nowMs);
  }

  return {
    displayStatus: eligible ? "active" : "ended",
    eligible,
    remainingMs,
    startAt,
    endAt,
  };
}

/** Remaining time copy — uses existing locale contract, no new timezone stack. */
export function formatFeedAdRemaining(
  remainingMs: number | null | undefined,
  lang: AppLanguageCode
): string {
  if (remainingMs == null) return "";
  if (remainingMs <= 0) {
    return lang === "en" ? "Ended" : "종료됨";
  }
  const totalMin = Math.floor(remainingMs / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  if (lang === "en") {
    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h left`;
    return `${Math.max(1, totalMin)}m left`;
  }
  if (days > 0) return `${days}일 ${hours}시간 남음`;
  if (hours > 0) return `${hours}시간 남음`;
  return `${Math.max(1, totalMin)}분 남음`;
}

export function formatFeedAdWindowLabel(
  startAt: string | null | undefined,
  endAt: string | null | undefined,
  lang: AppLanguageCode
): { startLabel: string; endLabel: string } {
  return {
    startLabel: startAt ? formatAppDateTime(startAt, lang) : "—",
    endLabel: endAt ? formatAppDateTime(endAt, lang) : "—",
  };
}

/**
 * Renewal base end: max(now, current ends_at).
 * LOCK: extend from later of now vs current end so mid-flight renewals stack correctly.
 */
export function computeFeedAdRenewalEndAt(input: {
  currentEndAt: string | null | undefined;
  durationDays: number;
  nowMs?: number;
}): string {
  const nowMs = input.nowMs ?? Date.now();
  const days = Math.max(1, Math.floor(Number(input.durationDays) || 1));
  let base = nowMs;
  if (input.currentEndAt) {
    const t = Date.parse(input.currentEndAt);
    if (Number.isFinite(t) && t > base) base = t;
  }
  return new Date(base + days * 86_400_000).toISOString();
}
