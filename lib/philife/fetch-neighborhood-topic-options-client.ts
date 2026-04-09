"use client";

import { philifeNeighborhoodTopicOptionsUrl } from "@domain/philife/api";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const PHILIFE_NEIGHBORHOOD_TOPIC_OPTIONS_FLIGHT = "philife:neighborhood-topic-options";

export type PhilifeNeighborhoodTopicOptionsJson = {
  ok?: boolean;
  feedChips?: { slug: string; name: string }[];
  writeTopics?: { slug: string; name: string }[];
  source?: string;
  error?: string;
};

/**
 * 피드·글쓰기가 동시에 마운트돼도 `/api/philife/neighborhood-topic-options` 는 한 갈래로 합침.
 */
export function fetchPhilifeNeighborhoodTopicOptions(): Promise<PhilifeNeighborhoodTopicOptionsJson> {
  return runSingleFlight(PHILIFE_NEIGHBORHOOD_TOPIC_OPTIONS_FLIGHT, async () => {
    /** 서버 `Cache-Control` 준수 — 탭 왕복·글쓰기 ↔ 피드 시 중복 요청 감소 */
    const res = await fetch(philifeNeighborhoodTopicOptionsUrl(), { cache: "default" });
    return (await res.json()) as PhilifeNeighborhoodTopicOptionsJson;
  });
}
