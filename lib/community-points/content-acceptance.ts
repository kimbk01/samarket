/**
 * Level 1 — CONTENT ACCEPTANCE.
 * BLOCK register. Does not decide D-Point.
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

export function communityAcceptanceErrorMessage(
  code: "empty" | "punctuation_only" | "repeated_only"
): string {
  if (code === "empty") return "내용을 입력하세요.";
  if (code === "punctuation_only") return "의미 있는 내용을 입력하세요.";
  return "반복된 문자만으로는 등록할 수 없습니다.";
}
