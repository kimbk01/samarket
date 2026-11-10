// @vitest-environment jsdom
/**
 * 채팅 P0-4 계약 (Owner 「P0-4 승인」 2026-11-11 · docs/audit/messenger-p0-4-call-logs-impact-analysis-2026-11-11.md):
 * 통화 탭 재방문 — 마지막 조회 뒤 바뀌었을 신호가 없을 때만 재조회 생략.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CALL_LOGS_FRESH_MAX_AGE_MS,
  __resetCallLogsFreshnessForTests,
  beginCallLogsFetch,
  getCallLogsCachedCursor,
  isCallLogsCacheFresh,
  markCallLogsFetched,
  recordCallLogsOlderPage,
  resetCallLogsFreshness,
} from "@/lib/community-messenger/call-history/call-logs-freshness";
import { notifyCallLogsRealtimeChanged } from "@/lib/community-messenger/call-history/call-logs-realtime-listeners";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const page = { nextCursor: "c1", hasMore: true };

beforeEach(() => {
  __resetCallLogsFreshnessForTests();
});

describe("통화 목록 신선도", () => {
  it("조회 전에는 신선하지 않다(첫 방문은 반드시 조회)", () => {
    expect(isCallLogsCacheFresh(A)).toBe(false);
  });

  it("조회 성공 뒤 같은 계정·60초 안·신호 없음 → 신선(재조회 생략)", () => {
    const t0 = 1_000_000;
    markCallLogsFetched(A, beginCallLogsFetch(), page, t0);
    expect(isCallLogsCacheFresh(A, t0 + 1_000)).toBe(true);
    expect(getCallLogsCachedCursor()).toEqual(page);
  });

  it("60초가 지나면 다시 조회", () => {
    const t0 = 1_000_000;
    markCallLogsFetched(A, beginCallLogsFetch(), page, t0);
    expect(isCallLogsCacheFresh(A, t0 + CALL_LOGS_FRESH_MAX_AGE_MS + 1)).toBe(false);
  });

  it("홈 실시간 call_logs 신호가 오면 다시 조회", () => {
    markCallLogsFetched(A, beginCallLogsFetch(), page);
    notifyCallLogsRealtimeChanged();
    expect(isCallLogsCacheFresh(A)).toBe(false);
  });

  it("조회 중에 신호가 오면 그 조회 결과로 신선 처리하지 않는다", () => {
    const started = beginCallLogsFetch();
    notifyCallLogsRealtimeChanged();
    markCallLogsFetched(A, started, page);
    expect(isCallLogsCacheFresh(A)).toBe(false);
  });

  it("앱이 다시 보이면 다시 조회", () => {
    markCallLogsFetched(A, beginCallLogsFetch(), page);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(isCallLogsCacheFresh(A)).toBe(false);
  });

  it("다른 계정이면 다시 조회(계정 A 목록을 B 에 쓰지 않음)", () => {
    markCallLogsFetched(A, beginCallLogsFetch(), page);
    expect(isCallLogsCacheFresh(B)).toBe(false);
    resetCallLogsFreshness();
    expect(isCallLogsCacheFresh(A)).toBe(false);
  });

  it("더 보기 커서는 같은 계정에서만 갱신", () => {
    markCallLogsFetched(A, beginCallLogsFetch(), page);
    recordCallLogsOlderPage(B, { nextCursor: "x", hasMore: false });
    expect(getCallLogsCachedCursor()).toEqual(page);
    recordCallLogsOlderPage(A, { nextCursor: "c2", hasMore: false });
    expect(getCallLogsCachedCursor()).toEqual({ nextCursor: "c2", hasMore: false });
  });
});

describe("통화 패널 구조 계약(소스)", () => {
  const panel = fs.readFileSync(path.join(process.cwd(), "components/community-messenger/MessengerCallLogsPanel.tsx"), "utf8");
  it("마운트 재조회는 신선할 때만 생략, 첫 페이지 성공 시 신선 기록", () => {
    expect(panel).toMatch(/if \(isCallLogsCacheFresh\(resolvedViewerUserId\)\) \{[\s\S]{0,200}return;\s*\}\s*void refetchCallLogsFromServer\(\);/);
    expect(panel).toMatch(/applyFirstPageFromServer\(fetched\);\s*markCallLogsFetched\(resolvedViewerUserId, startedAtInvalidation, fetched\);/);
  });
  it("실시간·앱 복귀 재조회 경로는 그대로", () => {
    expect(panel).toContain("useCommunityCallHistoryRealtimeSync({");
    expect(panel).toMatch(/document\.addEventListener\("visibilitychange", onVisible\)/);
  });
});
