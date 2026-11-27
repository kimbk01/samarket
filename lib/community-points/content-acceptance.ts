/**
 * Level 1 — CONTENT ACCEPTANCE.
 * BLOCK register. Does not decide Point.
 */
import {
  normalizeCommunityText,
  type NormalizedCommunityText,
} from "@/lib/community-points/content-normalize";

export type ContentAcceptanceKind = "post_title" | "post_body" | "comment";

export type ContentAcceptanceResult =
  | { ok: true; normalized: NormalizedCommunityText }
  | { ok: false; code: "empty" | "punctuation_only" | "repeated_only"; normalized: NormalizedCommunityText };

const REPEAT_MIN_LEN = 4;
const REPEAT_CHAR_RATIO = 0.85;
const REPEAT_RUN_RATIO = 0.8;

export function evaluateCommunityContentAcceptance(
  raw: string,
  _kind: ContentAcceptanceKind
): ContentAcceptanceResult {
  const normalized = normalizeCommunityText(raw);
  if (!normalized.normalized || normalized.meaningfulCount === 0) {
    if (!normalized.normalized) {
      return { ok: false, code: "empty", normalized };
    }
    return { ok: false, code: "punctuation_only", normalized };
  }
  if (isExcessiveRepeat(normalized)) {
    return { ok: false, code: "repeated_only", normalized };
  }
  return { ok: true, normalized };
}

function isExcessiveRepeat(n: NormalizedCommunityText): boolean {
  if (n.meaningfulCount < REPEAT_MIN_LEN) return false;
  if (n.uniqueMeaningfulCount <= 1) return true;
  if (n.maxCharRatio >= REPEAT_CHAR_RATIO) return true;
  if (n.maxRunRatio >= REPEAT_RUN_RATIO) return true;
  return false;
}

export function evaluateCommunityPostAcceptance(input: {
  title: string;
  content: string;
}): ContentAcceptanceResult {
  const title = evaluateCommunityContentAcceptance(input.title, "post_title");
  if (!title.ok) return title;
  return evaluateCommunityContentAcceptance(input.content, "post_body");
}

/**
 * 응답 오류 코드 — 문구는 화면이 `COMMUNITY_*_ERROR_KEYS`(`lib/community/community-api-error-text.ts`)로 고른다
 * (재감사 2026-11-27 · `docs/i18n-ssot.md` §3-3).
 */
export type CommunityAcceptanceErrorCode = "content_empty" | "content_punctuation_only" | "content_repeated_only";

export function communityAcceptanceErrorCode(
  code: "empty" | "punctuation_only" | "repeated_only"
): CommunityAcceptanceErrorCode {
  if (code === "empty") return "content_empty";
  if (code === "punctuation_only") return "content_punctuation_only";
  return "content_repeated_only";
}
