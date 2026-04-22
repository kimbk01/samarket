"use client";

import { philifeNeighborhoodTopicOptionsUrl } from "@domain/philife/api";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const PHILIFE_NEIGHBORHOOD_TOPIC_OPTIONS_FLIGHT = "philife:neighborhood-topic-options";
const PHILIFE_NEIGHBORHOOD_TOPIC_OPTIONS_TTL_MS = 60_000;

let topicOptionsCache:
  | {
      value: PhilifeNeighborhoodTopicOptionsJson;
      expiresAt: number;
    }
  | null = null;

export type PhilifeNeighborhoodTopicOptionsJson = {
  ok?: boolean;
  feedChips?: { slug: string; name: string }[];
  writeTopics?: { slug: string; name: string }[];
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
 * 피드 진입 전 idle 구간에서 topic options를 선요청한다.
 * 실패는 무시하고, 이미 TTL 캐시가 있으면 네트워크를 열지 않는다.
 */
export function warmPhilifeNeighborhoodTopicOptions(): void {
  void fetchPhilifeNeighborhoodTopicOptions().catch(() => {});
}
