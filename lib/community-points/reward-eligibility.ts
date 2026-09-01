/**
 * Level 2 — REWARD ELIGIBILITY.
 * Content may already be accepted. This only decides Point.
 */
import { communityTextContentHash, type NormalizedCommunityText } from "@/lib/community-points/content-normalize";

export const COMMUNITY_POINT_DEFAULTS = {
  dailyRewardPostCap: 10,
  dailyRewardCommentCap: 30,
  minRewardPostChars: 10,
  minRewardCommentChars: 8,
  duplicateTextWindowHours: 24,
} as const;

/** Normalized exact phrases that are valid community speech but not reward-eligible. */
export const REWARD_INELIGIBLE_PHRASES = new Set([
  "감사합니다",
  "네",
  "넵",
  "응",
  "확인했습니다",
  "test",
  "asdf",
  "ok",
  "ㅇㅇ",
  "ㄱㄱ",
]);

export type RewardEligibilityReason =
  | "ok"
  | "phrase_denylist"
  | "min_chars"
  | "self_comment"
  | "duplicate_text"
  | "daily_cap"
  | "cooldown"
  | "policy_disabled"
  | "amount_zero"
  | "already_decided";

export type RewardEligibilityResult = {
  eligible: boolean;
  reason: RewardEligibilityReason;
  contentHash: string;
};

export function isQnaCommunityContent(input: {
  isQuestion?: boolean;
  topicSlug?: string | null;
}): boolean {
  if (input.isQuestion === true) return true;
  const topic = String(input.topicSlug ?? "").trim().toLowerCase();
  return topic === "question" || topic === "qna";
}

export function evaluateRewardEligibilityText(input: {
  normalized: NormalizedCommunityText;
  minMeaningfulChars: number;
}): { ok: boolean; reason: RewardEligibilityReason; contentHash: string } {
  const contentHash = communityTextContentHash(input.normalized.normalized);
  const phrase = input.normalized.normalized.toLowerCase();
  if (REWARD_INELIGIBLE_PHRASES.has(phrase) || REWARD_INELIGIBLE_PHRASES.has(input.normalized.normalized)) {
    return { ok: false, reason: "phrase_denylist", contentHash };
  }
  if (input.normalized.meaningfulCount < input.minMeaningfulChars) {
    return { ok: false, reason: "min_chars", contentHash };
  }
  return { ok: true, reason: "ok", contentHash };
}

export function isSelfComment(postAuthorId: string | null | undefined, commentUserId: string): boolean {
  const owner = String(postAuthorId ?? "").trim();
  const user = String(commentUserId ?? "").trim();
  return Boolean(owner && user && owner === user);
}
