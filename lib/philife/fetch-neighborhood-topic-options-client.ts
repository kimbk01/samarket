"use client";

import { philifeNeighborhoodTopicOptionsUrl } from "@domain/philife/api";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const PHILIFE_NEIGHBORHOOD_TOPIC_OPTIONS_FLIGHT = "philife:neighborhood-topic-options";
/** 어드민 토픽 편집 직후 칩·글쓰기 주제에 반영되기까지 허용 지연(서버 캐시는 어드민 API에서 클리어) */
const PHILIFE_NEIGHBORHOOD_TOPIC_OPTIONS_TTL_MS = 20_000;

let topicOptionsCache:
  | {
      value: PhilifeNeighborhoodTopicOptionsJson;
      expiresAt: number;
    }
  | null = null;

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

function isTopicOptionsPayloadUsable(
  payload: PhilifeNeighborhoodTopicOptionsJson
): boolean {
  return (
    payload?.ok === true &&
    Array.isArray(payload.feedChips) &&
    Array.isArray(payload.writeTopics)
  );
}

const PHILIFE_NEIGHBORHOOD_TOPIC_OPTIONS_WRITE_FLIGHT = "philife:neighborhood-topic-options:write-fresh";

/**
 * 피드·글쓰기가 동시에 마운트돼도 `/api/philife/neighborhood-topic-options` 는 한 갈래로 합침.
 */
export function fetchPhilifeNeighborhoodTopicOptions(): Promise<PhilifeNeighborhoodTopicOptionsJson> {
  const now = Date.now();
  if (topicOptionsCache && topicOptionsCache.expiresAt > now) {
    return Promise.resolve(topicOptionsCache.value);
  }
  return runSingleFlight(PHILIFE_NEIGHBORHOOD_TOPIC_OPTIONS_FLIGHT, async () => {
    const hit = topicOptionsCache;
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value;
    }
    /** 서버 `Cache-Control` 준수 — 탭 왕복·글쓰기 ↔ 피드 시 중복 요청 감소 */
    const res = await fetch(philifeNeighborhoodTopicOptionsUrl(), { cache: "default" });
    const json = (await res.json()) as PhilifeNeighborhoodTopicOptionsJson;
    if (isTopicOptionsPayloadUsable(json)) {
      topicOptionsCache = {
        value: json,
        expiresAt: Date.now() + PHILIFE_NEIGHBORHOOD_TOPIC_OPTIONS_TTL_MS,
      };
    }
    return json;
  });
}

/**
 * `/philife/write` 전용 — 20s 클라·브라우저 캐시에 묶이지 않고 **항상** 최신 주제 목록.
 * (어드민에서 토픽을 추가·저장한 직후 셀렉트가 비는 현상 방지)
 */
export function fetchPhilifeNeighborhoodTopicOptionsForWrite(): Promise<PhilifeNeighborhoodTopicOptionsJson> {
  return runSingleFlight(PHILIFE_NEIGHBORHOOD_TOPIC_OPTIONS_WRITE_FLIGHT, async () => {
    const res = await fetch(philifeNeighborhoodTopicOptionsUrl(), { cache: "no-store" });
    return (await res.json()) as PhilifeNeighborhoodTopicOptionsJson;
  });
}

/**
 * 피드 진입 전 idle 구간에서 topic options를 선요청한다.
 * 실패는 무시하고, 이미 TTL 캐시가 있으면 네트워크를 열지 않는다.
 */
export function warmPhilifeNeighborhoodTopicOptions(): void {
  void fetchPhilifeNeighborhoodTopicOptions().catch(() => {});
}
