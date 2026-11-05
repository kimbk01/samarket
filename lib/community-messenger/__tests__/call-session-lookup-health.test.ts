/**
 * 통화 화면 세션 조회 실패 처리 — 일시 실패는 세션 보존·제한 재시도, 404 는 두 번(간격) 확정,
 * 확정 뒤 정리는 그 sessionId 의 통화가 살아 있다는 근거가 없을 때만.
 */
import { describe, expect, it } from "vitest";
import {
  CALL_SESSION_LOOKUP_RETRY as R,
  canClearLocalCallFlagsAfterConfirmedNotFound,
  classifyCallSessionFetchResponse,
  createCallSessionLookupHealth,
} from "@/lib/community-messenger/call-session-lookup-health";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

const S = { id: "s1", status: "active" } as unknown as CommunityMessengerCallSession;

describe("classifyCallSessionFetchResponse", () => {
  it("상태별 분류", () => {
    expect(classifyCallSessionFetchResponse(200, { ok: true, session: S }, null)).toEqual({ kind: "ok", session: S });
    expect(classifyCallSessionFetchResponse(200, { ok: false }, null).kind).toBe("transient");
    expect(classifyCallSessionFetchResponse(200, null, null).kind).toBe("transient");
    expect(classifyCallSessionFetchResponse(404, { ok: false }, null).kind).toBe("not_found");
    expect(classifyCallSessionFetchResponse(401, null, null).kind).toBe("auth_required");
    expect(classifyCallSessionFetchResponse(503, null, "2").kind).toBe("transient");
    expect(classifyCallSessionFetchResponse(500, null, null).kind).toBe("transient");
    expect(classifyCallSessionFetchResponse(502, null, null).kind).toBe("transient");
    expect(classifyCallSessionFetchResponse(403, null, null).kind).toBe("transient");
  });

  it("429 Retry-After (기본 5초 · 상한 120초)", () => {
    expect(classifyCallSessionFetchResponse(429, null, "7")).toEqual({ kind: "rate_limited", retryAfterMs: 7_000 });
    expect(classifyCallSessionFetchResponse(429, null, null)).toEqual({ kind: "rate_limited", retryAfterMs: 5_000 });
    expect(classifyCallSessionFetchResponse(429, null, "9999")).toEqual({ kind: "rate_limited", retryAfterMs: 120_000 });
  });
});

describe("createCallSessionLookupHealth", () => {
  it("정상 통화 중 DB 오류(503)·5xx·네트워크 단절: 세션 유지 + 지수 간격 재시도 + 연속 상한 뒤 자동 재시도 중단", () => {
    const h = createCallSessionLookupHealth("s1");
    let now = 1_000;
    const delays: number[] = [];
    for (let i = 0; i < R.maxConsecutiveTransient - 1; i++) {
      const d = h.record({ kind: "transient" }, now);
      expect(d.action).toBe("keep");
      if (d.action !== "keep" || d.retryAt == null) throw new Error("retryAt expected");
      delays.push(d.retryAt - now);
      expect(h.canAutoRetry(now)).toBe(false);
      now = d.retryAt;
      expect(h.canAutoRetry(now)).toBe(true);
    }
    expect(delays).toEqual([2_000, 4_000, 8_000, 16_000, 30_000]);
    const last = h.record({ kind: "transient" }, now);
    expect(last).toEqual({ action: "keep", retryAt: null });
    expect(h.canAutoRetry(now + 10 * 60_000)).toBe(false);
  });

  it("네트워크 복귀(resume) 뒤 즉시 재조회 가능 · 성공하면 상태 초기화", () => {
    const h = createCallSessionLookupHealth("s1");
    for (let i = 0; i < R.maxConsecutiveTransient; i++) h.record({ kind: "transient" }, 1_000);
    expect(h.canAutoRetry(2_000)).toBe(false);
    h.resume();
    expect(h.canAutoRetry(2_000)).toBe(true);
    expect(h.record({ kind: "ok", session: S }, 2_000)).toEqual({ action: "apply", session: S });
    expect(h.backoffUntil()).toBe(0);
  });

  it("429: Retry-After 동안 대기 — resume 으로도 429 대기는 풀리지 않는다", () => {
    const h = createCallSessionLookupHealth("s1");
    expect(h.record({ kind: "rate_limited", retryAfterMs: 10_000 }, 0)).toEqual({ action: "keep", retryAt: 10_000 });
    h.resume();
    expect(h.canAutoRetry(5_000)).toBe(false);
    expect(h.canAutoRetry(10_000)).toBe(true);
  });

  it("401: 세션 유지 · 자동 재시도 없음(인증 우회 금지) · resume 뒤 1회 재확인 가능", () => {
    const h = createCallSessionLookupHealth("s1");
    expect(h.record({ kind: "auth_required" }, 0)).toEqual({ action: "keep", retryAt: null });
    expect(h.canAutoRetry(60_000)).toBe(false);
    h.resume();
    expect(h.canAutoRetry(60_000)).toBe(true);
  });

  it("404 1회는 종료가 아니다 — 확인 재조회 예약, 간격 안의 두 번째 404 도 확정 아님", () => {
    const h = createCallSessionLookupHealth("s1");
    expect(h.record({ kind: "not_found" }, 0)).toEqual({ action: "keep", retryAt: R.notFoundConfirmGapMs });
    expect(h.record({ kind: "not_found" }, 500)).toEqual({ action: "keep", retryAt: R.notFoundConfirmGapMs });
    expect(h.record({ kind: "not_found" }, R.notFoundConfirmGapMs)).toEqual({ action: "not_found_confirmed" });
    expect(h.canAutoRetry(R.notFoundConfirmGapMs + 60_000)).toBe(false);
  });

  it("404 사이에 성공이 있으면 다시 처음부터 (일시적 404)", () => {
    const h = createCallSessionLookupHealth("s1");
    h.record({ kind: "not_found" }, 0);
    h.record({ kind: "ok", session: S }, 1_000);
    expect(h.record({ kind: "not_found" }, 5_000).action).toBe("keep");
  });

  it("404 뒤 일시 오류는 404 확정을 앞당기지도 지우지도 않는다", () => {
    const h = createCallSessionLookupHealth("s1");
    h.record({ kind: "not_found" }, 0);
    expect(h.record({ kind: "transient" }, 1_000).action).toBe("keep");
    expect(h.record({ kind: "not_found" }, 4_000)).toEqual({ action: "not_found_confirmed" });
  });

  it("세션 전환: sessionId 별 독립", () => {
    const a = createCallSessionLookupHealth("a");
    const b = createCallSessionLookupHealth("b");
    a.record({ kind: "not_found" }, 0);
    expect(b.record({ kind: "not_found" }, 5_000).action).toBe("keep");
    expect(a.sessionId).toBe("a");
  });
});

describe("canClearLocalCallFlagsAfterConfirmedNotFound", () => {
  it("이 세션 미디어에 join 중이거나 detached 로 보관 중이면 정리하지 않는다(통화가 살아 있다는 근거)", () => {
    expect(
      canClearLocalCallFlagsAfterConfirmedNotFound({ sessionId: "s1", joinedMediaSessionId: "s1", detachedSessionId: null })
    ).toBe(false);
    expect(
      canClearLocalCallFlagsAfterConfirmedNotFound({ sessionId: "s1", joinedMediaSessionId: null, detachedSessionId: "s1" })
    ).toBe(false);
  });

  it("근거 없음 → 정리 가능 · 다른 통화의 미디어·detached 는 이 세션 근거가 아니다", () => {
    expect(
      canClearLocalCallFlagsAfterConfirmedNotFound({ sessionId: "s1", joinedMediaSessionId: null, detachedSessionId: null })
    ).toBe(true);
    expect(
      canClearLocalCallFlagsAfterConfirmedNotFound({ sessionId: "s1", joinedMediaSessionId: "s2", detachedSessionId: "s2" })
    ).toBe(true);
    expect(
      canClearLocalCallFlagsAfterConfirmedNotFound({ sessionId: " ", joinedMediaSessionId: null, detachedSessionId: null })
    ).toBe(false);
  });
});
