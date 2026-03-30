import { normalizeFeedSlug } from "@/lib/community-feed/constants";

/**
 * 일반 필라이프 글쓰기 전용 주제 slug.
 * - 동네 카테고리 중 `meetup` 제외 전부
 * - 커스텀 시드(자유게시판 등)
 *
 * DB에서 실수로 `allow_meetup=true`여도 모임 만들기·`/api/philife/meetup-feed-topics`·어드민「모임」탭에서 제외.
 */
const EXTRA_GENERAL_SLUGS = ["free", "board", "general", "talk"] as const;

const BASE_FROM_NEIGHBORHOOD = [
  "question",
  "info",
  "daily",
  "job",
  "food",
  "promo",
  "notice",
  "etc",
] as const;

export const PHILIFE_GENERAL_ONLY_TOPIC_SLUGS: ReadonlySet<string> = new Set<string>([
  ...BASE_FROM_NEIGHBORHOOD,
  ...EXTRA_GENERAL_SLUGS,
]);

export function isPhilifeGeneralOnlyTopicSlug(raw: string): boolean {
  const s = normalizeFeedSlug(raw);
  if (!s) return false;
  return PHILIFE_GENERAL_ONLY_TOPIC_SLUGS.has(s);
}

/** 모임 만들기 피드 주제로 노출 가능: allow_meetup 이고 일반 전용 slug 아님 */
export function qualifiesForPhilifeMeetupWriterTopic(allowMeetup: boolean, slug: string): boolean {
  return allowMeetup && !isPhilifeGeneralOnlyTopicSlug(slug);
}
