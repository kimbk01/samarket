/**
 * 커뮤니티 운영 설정 저장 — 현재 저장값 위에 요청 필드만 덮는다 (설계 C-29).
 * 기본값과 병합하면 요청에 빠진 필드(예: 금칙어)가 기본값으로 초기화되므로 금지.
 * 순수 함수 — 서버·테스트 공용.
 */
import {
  mergeCommunityFeedOps,
  type CommunityFeedOps,
} from "@/lib/community-feed/community-ops-settings";

export const COMMUNITY_FEED_OPS_FIELDS = [
  "banned_words",
  "max_title_length",
  "max_content_length",
  "max_comment_length",
  "max_posts_per_day",
  "min_comment_interval_sec",
] as const satisfies readonly (keyof CommunityFeedOps)[];

/** 요청 본문에서 설정 필드만 추린다 (expectedUpdatedAt 등 메타 필드 제외). */
export function pickCommunityFeedOpsPatch(body: Record<string, unknown> | null | undefined): Partial<CommunityFeedOps> {
  const out: Record<string, unknown> = {};
  if (!body) return out as Partial<CommunityFeedOps>;
  for (const k of COMMUNITY_FEED_OPS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, k) && body[k] !== undefined) out[k] = body[k];
  }
  return out as Partial<CommunityFeedOps>;
}

/** 현재 저장값(정규화) + 요청 필드 → 저장할 값 */
export function mergeCommunityFeedOpsWithCurrent(
  current: Record<string, unknown> | null | undefined,
  patch: Partial<CommunityFeedOps>
): CommunityFeedOps {
  const base = mergeCommunityFeedOps(current ?? {});
  return mergeCommunityFeedOps({ ...base, ...patch } as Record<string, unknown>);
}

/** 감사 기록용 변경 필드만 before/after */
export function diffCommunityFeedOps(
  before: CommunityFeedOps,
  after: CommunityFeedOps
): { before: Record<string, unknown>; after: Record<string, unknown>; changed: string[] } {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const changed: string[] = [];
  for (const k of COMMUNITY_FEED_OPS_FIELDS) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      b[k] = before[k];
      a[k] = after[k];
      changed.push(k);
    }
  }
  return { before: b, after: a, changed };
}

/** expectedUpdatedAt 비교 — 문자열 형식 차이(+00:00 / Z, 소수 자릿수) 무시 */
export function sameSettingsTimestamp(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isFinite(ta) && Number.isFinite(tb)) {
    return ta === tb;
  }
  return a === b;
}
