"use client";

import { subscribeCallLogsRealtimeChanged } from "@/lib/community-messenger/call-history/call-logs-realtime-listeners";
import { onCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";

/**
 * 채팅 P0-4 (Owner 「P0-4 승인」 2026-11-11 · docs/audit/messenger-p0-4-call-logs-impact-analysis-2026-11-11.md):
 * 통화 탭을 다시 열 때 목록을 다시 받을지 판단하는 viewer 단위 신선도.
 *
 * 목록 자체는 메신저 홈 데이터(`data.calls`, 통화 패널이 `onBootstrapCallsChange` 로 맞춤)에 있다.
 * 여기서는 「마지막으로 서버에서 받은 뒤 바뀌었을 수 있는가」만 기록한다 — 바뀌었을 수 있으면 지금처럼 다시 받는다.
 *
 * 무효화(다시 받기) 신호 — 하나라도 오면 다음 방문 때 재조회:
 * - 홈 실시간 `community_messenger_call_logs` 변경(D-5 단일 소유 채널)
 * - 통화 종료 bus `cm.call.session_terminal`
 * - 앱이 다시 보일 때(visibility) — 백그라운드 동안 놓친 신호 대비
 * - 마지막 조회 후 60초 경과 — 실시간 누락 대비 상한
 * - 다른 계정(viewer 불일치)
 */
export const CALL_LOGS_FRESH_MAX_AGE_MS = 60_000;

type FreshnessState = {
  viewerUserId: string | null;
  fetchedAt: number;
  /** 무효화가 일어날 때마다 증가 — 조회 시작 이후 무효화가 있었는지 판정 */
  invalidation: number;
  fetchedInvalidation: number;
  /** 마지막으로 받은 페이지의 다음 커서 — 다시 열 때 「더 보기」를 이어서 쓰기 위해 */
  nextCursor: string | null;
  hasMore: boolean;
};

const state: FreshnessState = {
  viewerUserId: null,
  fetchedAt: 0,
  invalidation: 0,
  fetchedInvalidation: -1,
  nextCursor: null,
  hasMore: false,
};

let listenersInstalled = false;

export function invalidateCallLogsFreshness(): void {
  state.invalidation += 1;
}

function installInvalidationListeners(): void {
  if (listenersInstalled || typeof window === "undefined") return;
  listenersInstalled = true;
  subscribeCallLogsRealtimeChanged(invalidateCallLogsFreshness);
  onCommunityMessengerBusEvent((ev) => {
    if (ev.type === "cm.call.session_terminal") invalidateCallLogsFreshness();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") invalidateCallLogsFreshness();
  });
}

/** 조회 시작 시점 표식 — 끝난 뒤 `markCallLogsFetched` 에 넘긴다 */
export function beginCallLogsFetch(): number {
  installInvalidationListeners();
  return state.invalidation;
}

/** 첫 페이지 조회 성공 — 조회 시작 이후 무효화가 없을 때만 신선 */
export function markCallLogsFetched(
  viewerUserId: string | null | undefined,
  startedAtInvalidation: number,
  page: { nextCursor: string | null; hasMore: boolean },
  now = Date.now()
): void {
  const viewer = viewerUserId?.trim() || null;
  state.viewerUserId = viewer;
  state.fetchedAt = now;
  state.fetchedInvalidation = startedAtInvalidation;
  state.nextCursor = page.nextCursor;
  state.hasMore = page.hasMore;
}

/** 이전 페이지(더 보기) 성공 — 커서만 갱신(신선도는 그대로) */
export function recordCallLogsOlderPage(viewerUserId: string | null | undefined, page: { nextCursor: string | null; hasMore: boolean }): void {
  const viewer = viewerUserId?.trim() || null;
  if (!viewer || state.viewerUserId !== viewer) return;
  state.nextCursor = page.nextCursor;
  state.hasMore = page.hasMore;
}

export function getCallLogsCachedCursor(): { nextCursor: string | null; hasMore: boolean } {
  return { nextCursor: state.nextCursor, hasMore: state.hasMore };
}

export function isCallLogsCacheFresh(viewerUserId: string | null | undefined, now = Date.now()): boolean {
  installInvalidationListeners();
  const viewer = viewerUserId?.trim() || null;
  if (!viewer || state.viewerUserId !== viewer) return false;
  if (state.fetchedAt <= 0 || now - state.fetchedAt > CALL_LOGS_FRESH_MAX_AGE_MS) return false;
  return state.fetchedInvalidation === state.invalidation;
}

/** 계정 전환·로그아웃 — 다음 방문은 반드시 재조회 */
export function resetCallLogsFreshness(): void {
  state.viewerUserId = null;
  state.fetchedAt = 0;
  state.fetchedInvalidation = -1;
  state.nextCursor = null;
  state.hasMore = false;
  state.invalidation += 1;
}

export function __resetCallLogsFreshnessForTests(): void {
  resetCallLogsFreshness();
  listenersInstalled = false;
}
