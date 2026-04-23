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

/**
 * 필라이프 상단 **인기·추천(정렬) 탭**에 쓰는 시드 slug — 일반 글 `community_posts.topic` 로는 쓰지 않음.
 * DB `is_feed_sort` 누락(레거시) 시에도 글쓰기 드롭다운에 `인기글`이 끼는 것을 막기 위함.
 */
export function isPhilifeNeighborhoodSortSlotSlug(raw: string): boolean {
  const s = normalizeFeedSlug(raw);
  return s === "popular" || s === "recommend" || s === "recommended";
}

/** 모임 만들기 피드 주제로 노출 가능: allow_meetup 이고 일반 전용 slug 아님 */
export function qualifiesForPhilifeMeetupWriterTopic(allowMeetup: boolean, slug: string): boolean {
  return allowMeetup && !isPhilifeGeneralOnlyTopicSlug(slug);
}

/**
 * `/philify/write` 일반 동네 글·`resolveTopicForNeighborhoodCategory`·주제 셀렉트.
 * - **글쓰기에서 빼는 것**은 `popular` / `recommend` / `recommended` **정렬 탭용 slug**뿐(아래). 인기/추천은 여기에만 해당.
 * - `is_feed_sort`만 보고 끄면, DB에 잘못 `true`가 박힌 **일반 주제(phlifee 등)**가 전부 셀렉트에서 사라짐 — 그래서 **슬롯 slug로만** 판단한다.
 * - `allow_meetup`+일반전용이 아닌 slug는 모임용으로 취급(글쓰기 일반 토픽에서 제외) — `question`·`free` 등 예외는 `isPhilifeGeneralOnlyTopicSlug`
 */
export function isPhilifeNeighborhoodWriteEligibleRow(
  allowMeetup: boolean,
  _isFeedSort: boolean,
  slug: string
): boolean {
  if (isPhilifeNeighborhoodSortSlotSlug(slug)) return false;
  if (!allowMeetup) return true;
  return isPhilifeGeneralOnlyTopicSlug(slug);
}
