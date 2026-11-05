/**
 * 세션 조회 재시도 소진(일시 오류 6회)·401 뒤 화면 상태.
 * - 첫 진입: 영구 로딩·「통화 없음」 대신 조회 중단 화면 + 다시 시도
 * - 진행 중 통화: 세션·미디어 유지 + 조회 중단 문구
 * - 재개: 타이머 1개·요청 제한 유지
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CALL_SESSION_LOOKUP_RETRY,
  createCallSessionLookupHealth,
} from "@/lib/community-messenger/call-session-lookup-health";

const ROOT = join(__dirname, "../../..");

describe("503 연속 — 재시도 예산", () => {
  it("첫 503 부터 자동 요청은 정확히 6회, 마지막은 재시도 없음(소진)", () => {
    const h = createCallSessionLookupHealth("s1");
    let now = 0;
    let requests = 0;
    for (;;) {
      requests += 1;
      const d = h.record({ kind: "transient" }, now);
      expect(d.action).toBe("keep");
      if (d.action !== "keep" || d.retryAt == null) break;
      now = d.retryAt + 20;
      expect(requests).toBeLessThan(20);
    }
    expect(requests).toBe(CALL_SESSION_LOOKUP_RETRY.maxConsecutiveTransient);
    expect(h.canAutoRetry(now)).toBe(false);
    expect(h.canAutoRetry(now + 10 * 60_000)).toBe(false);
  });

  it("소진 뒤 Realtime 신호는 30초 대기에 막히고, 그 뒤에도 실패하면 1회만 더 시도", () => {
    const h = createCallSessionLookupHealth("s1");
    let now = 0;
    for (let i = 0; i < CALL_SESSION_LOOKUP_RETRY.maxConsecutiveTransient; i += 1) {
      const d = h.record({ kind: "transient" }, now);
      if (d.action === "keep" && d.retryAt != null) now = d.retryAt + 20;
    }
    expect(now + 1_000 < h.backoffUntil()).toBe(true);
    now = h.backoffUntil();
    const d = h.record({ kind: "transient" }, now);
    expect(d).toEqual({ action: "keep", retryAt: null });
    expect(h.backoffUntil()).toBe(now + CALL_SESSION_LOOKUP_RETRY.transientMaxMs);
  });

  it("재개(온라인·화면 복귀·다시 시도) 1회 = 새 예산 6회 — 무한 반복 없음", () => {
    const h = createCallSessionLookupHealth("s1");
    let now = 0;
    for (let i = 0; i < 6; i += 1) {
      const d = h.record({ kind: "transient" }, now);
      if (d.action === "keep" && d.retryAt != null) now = d.retryAt + 20;
    }
    h.resume();
    expect(h.backoffUntil()).toBe(0);
    let requests = 0;
    for (;;) {
      requests += 1;
      const d = h.record({ kind: "transient" }, now);
      if (d.action !== "keep" || d.retryAt == null) break;
      now = d.retryAt + 20;
    }
    expect(requests).toBe(6);
  });

  it("재개 뒤 성공하면 정상 반영", () => {
    const h = createCallSessionLookupHealth("s1");
    for (let i = 0; i < 6; i += 1) h.record({ kind: "transient" }, i * 40_000);
    h.resume();
    const session = { id: "s1" } as never;
    expect(h.record({ kind: "ok", session }, 300_000)).toEqual({ action: "apply", session });
    expect(h.canAutoRetry(300_000)).toBe(true);
  });
});

describe("통화 화면 계약 — 조회 중단 상태", () => {
  const src = readFileSync(join(ROOT, "components/community-messenger/CommunityMessengerCallClient.tsx"), "utf8");
  const failureBody = src.slice(
    src.indexOf("const applySessionLookupFailure = useCallback("),
    src.indexOf("useEffect(() => {\n    callKindBootRef.current")
  );
  const refreshBody = src.slice(src.indexOf("const refreshSession = useCallback("), src.indexOf("refreshSessionRef.current = refreshSession"));
  const bootstrapStart = src.indexOf("const sessionUrl = `/api/community-messenger/calls/sessions/");
  const bootstrapBody = src.slice(bootstrapStart, src.indexOf("void bootstrap();", bootstrapStart));
  const noSessionStart = src.indexOf("  if (!session) {\n    return (");
  const noSessionBody = src.slice(noSessionStart, src.indexOf("const videoCall = session.callKind", noSessionStart));
  const resumeBody = src.slice(src.indexOf("const resume = () => {"), src.indexOf('window.addEventListener("online", resume)'));
  const retryBody = src.slice(
    src.indexOf("const retrySessionLookupNow = useCallback("),
    src.indexOf("[readSessionLookupHealth, refreshSession]);", src.indexOf("const retrySessionLookupNow"))
  );

  it("자동 재시도가 끝나면(재시도 시각 없음) 조회 중단 상태로 — 401 은 auth, 그 외 unavailable", () => {
    expect(failureBody).toMatch(/decision\.retryAt == null\) \{\s*setSessionLookupStall\(outcomeKind === "auth_required" \? "auth" : "unavailable"\)/);
  });

  it("첫 진입: 소진 시 로딩을 풀고 「통화 세션 없음」 문구를 쓰지 않는다 · 성공 시 중단 상태 해제", () => {
    expect(refreshBody).not.toMatch(/cm_ui_call_session_missing/);
    expect(refreshBody).toMatch(/sessionLookupLoadingHeldRef\.current && !failure\.pending\) \{[\s\S]*?setLoading\(false\)/);
    expect(refreshBody).toMatch(/decision\.action === "apply"\) \{[\s\S]*?setSessionLookupStall\(null\)/);
    expect(bootstrapBody).toMatch(/if \(decision\.action === "keep"\) return;/);
    expect(bootstrapBody).toMatch(/setSessionLookupStall\(null\)/);
  });

  it("세션 없는 화면: 조회 중단이면 「통화 없음」 대신 원인 문구 + 다시 시도", () => {
    expect(noSessionBody).toMatch(/sessionLookupStall \?/);
    expect(noSessionBody).toMatch(/cm_ui_call_session_lookup_unavailable/);
    expect(noSessionBody).toMatch(/cm_ui_call_session_lookup_auth/);
    expect(noSessionBody).toMatch(/onClick=\{retrySessionLookupNow\}/);
  });

  it("진행 중 통화: 세션 유지 + 비종료 상태에서만 조회 중단 문구", () => {
    expect(src).toMatch(
      /sessionLookupStall && !isTerminalCallSessionStatus\(session\.status\)[\s\S]{0,120}cm_ui_call_session_lookup_paused/
    );
  });

  it("재개: 예약된 재시도 타이머를 지우고 재조회 1회 · 다시 시도는 진행 중이면 무시", () => {
    expect(resumeBody).toMatch(/clearTimeout\(sessionLookupRetryTimerRef\.current\)/);
    expect(resumeBody).toMatch(/scheduleSilentRefresh\("ui"\)/);
    expect(retryBody).toMatch(/if \(sessionLookupManualRetryRef\.current\) return;/);
    expect(retryBody).toMatch(/clearTimeout\(sessionLookupRetryTimerRef\.current\)/);
  });

  it("문구 ko/en catalog 동시 등록", () => {
    const catalog = readFileSync(join(ROOT, "lib/i18n/catalog/community-messenger-ui.ts"), "utf8");
    for (const key of [
      "cm_ui_call_session_lookup_unavailable",
      "cm_ui_call_session_lookup_auth",
      "cm_ui_call_session_lookup_paused",
    ]) {
      expect(catalog.match(new RegExp(`\\b${key}:`, "g"))?.length).toBe(2);
    }
  });
});
