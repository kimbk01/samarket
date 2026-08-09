/**
 * Member/Admin presentation projection for Feed Banner lifecycle (PHASE 3).
 * Uses request status + campaign window — RESOLVER-ONLY, no status cron writer.
 */

import { isFeedAdCampaignEligibleNow } from "@/lib/ads/feed-ad-placement";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { formatAppDateTime } from "@/lib/i18n/locale-for-app-language";

export type FeedAdMemberDisplayStatus =
  | "pending_review"
  | "scheduled"
  | "active"
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

export function projectFeedAdMemberPresentation(input: {
  requestStatus: string;
  startAt?: string | null;
  endAt?: string | null;
  nowMs?: number;
}): FeedAdMemberPresentation {
  const nowMs = input.nowMs ?? Date.now();
  const startAt = input.startAt ?? null;
  const endAt = input.endAt ?? null;
  const rs = String(input.requestStatus ?? "").trim().toLowerCase();

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

  // active / approved / ended request — window drives Member UX
  const eligible = isFeedAdCampaignEligibleNow(
    { status: "active", startAt, endAt },
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
