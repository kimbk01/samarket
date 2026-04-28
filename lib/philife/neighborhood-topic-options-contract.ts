/**
 * `/api/philife/neighborhood-topic-options` 페이로드 — 서버(RSC)·클라이언트 공유.
 * (`use client` 모듈에 두지 않아 RSC에서 안전하게 import)
 */
export type PhilifeNeighborhoodTopicOptionsJson = {
  ok?: boolean;
  feedChips?: {
    slug: string;
    name: string;
    is_feed_sort?: boolean;
    sort_slot?: "recommend" | "popular" | null;
  }[];
  writeTopics?: { slug: string; name: string }[];
  /** false면 상단「전체」칩 생략(기본 true / 생략 시 true) */
  showAllFeedTab?: boolean;
  /** false면「관심이웃 글만 보기」필터 띠 전체 비노출(기본 true) */
  showNeighborOnlyFilter?: boolean;
  source?: string;
  error?: string;
};
