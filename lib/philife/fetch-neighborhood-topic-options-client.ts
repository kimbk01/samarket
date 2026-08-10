"use client";

import { philifeNeighborhoodTopicOptionsUrl } from "@domain/philife/api";
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";
import type { PhilifeNeighborhoodTopicOptionsJson } from "@/lib/philife/neighborhood-topic-options-contract";

export type { PhilifeNeighborhoodTopicOptionsJson } from "@/lib/philife/neighborhood-topic-options-contract";

const PHILIFE_NEIGHBORHOOD_TOPIC_OPTIONS_FLIGHT = "philife:neighborhood-topic-options";
/** 메모리 TTL — peek/warm 보조. fetch 본문은 이 TTL로 network 를 막지 않는다. */
const PHILIFE_NEIGHBORHOOD_TOPIC_OPTIONS_TTL_MS = 20_000;
const PERSISTENT_TOPIC_OPTIONS_KEY = "philife_neighborhood_topic_options_v1";

let topicOptionsCache:
  | {
      value: PhilifeNeighborhoodTopicOptionsJson;
      expiresAt: number;
    }
  | null = null;

function isTopicOptionsPayloadUsable(
  payload: PhilifeNeighborhoodTopicOptionsJson
): boolean {
  return (
    payload?.ok === true &&
    Array.isArray(payload.feedChips) &&
    Array.isArray(payload.writeTopics)
  );
}

function readPersistentTopicOptions(): PhilifeNeighborhoodTopicOptionsJson | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PERSISTENT_TOPIC_OPTIONS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PhilifeNeighborhoodTopicOptionsJson;
    return isTopicOptionsPayloadUsable(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writePersistentTopicOptions(json: PhilifeNeighborhoodTopicOptionsJson): void {
  if (typeof window === "undefined") return;
  if (!isTopicOptionsPayloadUsable(json)) return;
  try {
    localStorage.setItem(PERSISTENT_TOPIC_OPTIONS_KEY, JSON.stringify(json));
  } catch {
    /* quota */
  }
}

function hydrateMemoryFromPersistent(): void {
  if (topicOptionsCache) return;
  const persisted = readPersistentTopicOptions();
  if (!persisted) return;
  topicOptionsCache = {
    value: persisted,
    expiresAt: Date.now() + PHILIFE_NEIGHBORHOOD_TOPIC_OPTIONS_TTL_MS,
  };
}

const PHILIFE_NEIGHBORHOOD_TOPIC_OPTIONS_WRITE_FLIGHT = "philife:neighborhood-topic-options:write-fresh";

/**
 * Community feed topic-options — **stale-while-revalidate**.
 *
 * CONTRACT:
 * - peek/hydrate may show persistent cache immediately (performance assist).
 * - This fetch MUST hit the network and must NOT return persistent/memory as final authority.
 * - Admin `sort_order` / rename / active·visible changes rely on this refresh.
 * - Concurrent callers share one in-flight request (single-flight only).
 */
export function fetchPhilifeNeighborhoodTopicOptions(): Promise<PhilifeNeighborhoodTopicOptionsJson> {
  return runSingleFlight(PHILIFE_NEIGHBORHOOD_TOPIC_OPTIONS_FLIGHT, async () => {
    const res = await fetch(philifeNeighborhoodTopicOptionsUrl(), { cache: "no-store" });
    const json = (await res.json()) as PhilifeNeighborhoodTopicOptionsJson;
    if (isTopicOptionsPayloadUsable(json)) {
      topicOptionsCache = {
        value: json,
        expiresAt: Date.now() + PHILIFE_NEIGHBORHOOD_TOPIC_OPTIONS_TTL_MS,
      };
      writePersistentTopicOptions(json);
    }
    return json;
  });
}

/**
 * `/philife/write` 전용 — 20s 메모리·브라우저 캐시에 묶이지 않고 **항상** 최신 주제 목록.
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
 * 실패는 무시. 최종 authority 는 항상 network (위 fetch 계약).
 */
export function warmPhilifeNeighborhoodTopicOptions(): void {
  void fetchPhilifeNeighborhoodTopicOptions().catch(() => {});
}

/** PTR·강제 새로고침 — 메모리 TTL·진행 중 single-flight 제거 (persistent 는 유지; 다음 fetch 가 덮어씀) */
export function invalidatePhilifeNeighborhoodTopicOptionsCache(): void {
  topicOptionsCache = null;
  forgetSingleFlight(PHILIFE_NEIGHBORHOOD_TOPIC_OPTIONS_FLIGHT);
}

/**
 * 동기 peek — 메모리 TTL 또는 persistent localStorage.
 * Cold Boot 첫 paint 칩용 (네트워크 대기 금지). **최종 authority 아님** — mount fetch 가 재검증.
 */
export function peekPhilifeNeighborhoodTopicOptionsFromCache(): PhilifeNeighborhoodTopicOptionsJson | null {
  hydrateMemoryFromPersistent();
  if (topicOptionsCache) return topicOptionsCache.value;
  return readPersistentTopicOptions();
}

/** RSC·프리패치가 채운 시드를 클라 캐시에 반영(API 응답과 동일 단일 출처). */
export function seedPhilifeNeighborhoodTopicOptionsCache(
  json: PhilifeNeighborhoodTopicOptionsJson
): void {
  if (!isTopicOptionsPayloadUsable(json)) return;
  topicOptionsCache = {
    value: json,
    expiresAt: Date.now() + PHILIFE_NEIGHBORHOOD_TOPIC_OPTIONS_TTL_MS,
  };
  writePersistentTopicOptions(json);
}
