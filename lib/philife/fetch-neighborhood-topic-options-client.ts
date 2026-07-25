"use client";

import { philifeNeighborhoodTopicOptionsUrl } from "@domain/philife/api";
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";
import type { PhilifeNeighborhoodTopicOptionsJson } from "@/lib/philife/neighborhood-topic-options-contract";

export type { PhilifeNeighborhoodTopicOptionsJson } from "@/lib/philife/neighborhood-topic-options-contract";

const PHILIFE_NEIGHBORHOOD_TOPIC_OPTIONS_FLIGHT = "philife:neighborhood-topic-options";
/** 메모리 TTL — 네트워크 재요청 간격 (persistent 와 별개) */
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
 * 피드·글쓰기가 동시에 마운트돼도 `/api/philife/neighborhood-topic-options` 는 한 갈래로 합침.
 */
export function fetchPhilifeNeighborhoodTopicOptions(): Promise<PhilifeNeighborhoodTopicOptionsJson> {
  hydrateMemoryFromPersistent();
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
      writePersistentTopicOptions(json);
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

/** PTR·강제 새로고침 — 20s 클라 TTL·진행 중 single-flight 제거 (persistent 는 유지) */
export function invalidatePhilifeNeighborhoodTopicOptionsCache(): void {
  topicOptionsCache = null;
  forgetSingleFlight(PHILIFE_NEIGHBORHOOD_TOPIC_OPTIONS_FLIGHT);
}

/**
 * 동기 peek — 메모리 TTL 또는 persistent localStorage.
 * Cold Boot 첫 paint 칩용 (네트워크 대기 금지).
 */
export function peekPhilifeNeighborhoodTopicOptionsFromCache(): PhilifeNeighborhoodTopicOptionsJson | null {
  hydrateMemoryFromPersistent();
  if (topicOptionsCache) return topicOptionsCache.value;
  return readPersistentTopicOptions();
}

/** RSC·프리패치가 채운 시드를 클라 TTL 캐시에 반영(API 응답과 동일 단일 출처). */
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
