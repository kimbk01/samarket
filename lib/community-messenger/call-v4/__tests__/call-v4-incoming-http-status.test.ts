/** @vitest-environment jsdom */
/**
 * F1 — V4 웹 수신 조회 HTTP 상태별 동작 (새 계약 · Owner F1 승인 2026-11-09)
 * 설계: docs/audit/f1-f2-call-incoming-design-2026-11-09.md §F1-6 (특성화 테스트
 * `call-v4-incoming-http-status-characterization.test.ts` 의 「→ F1 후 바뀜」 항목을 새 계약으로 바꾼 파일)
 *
 * - 200 ok:true(빈 목록 포함)는 기존 동작 그대로(2초·T2 빠짐 확인).
 * - 401 auth · 403 forbidden · 429 rate_limited · 5xx server · 200 본문 오류(bad_response) 를 구분한다.
 * - 오류 응답으로는 T2(poll_incoming_absent) 확인을 하지 않는다.
 * - 실시간 피드는 이 파일에서 끈다(피드 없음 = 2초 기본 주기). 실시간이 끼는 경우는
 *   `call-v4-incoming-http-status-realtime.test.ts`(실제 realtime-js 하네스)에서 본다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/call-v4/call-v4-flag", () => ({ isCallV4TelegramLaneEnabled: vi.fn(() => true) }));
vi.mock("@/lib/community-messenger/call-v4/call-v4-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/community-messenger/call-v4/call-v4-api")>();
  return {
    ...actual,
    /** 수신 목록 조회는 실제 함수(전역 fetch 를 가짜로 바꿔 상태별 응답을 준다) */
    callV4FetchSession: vi.fn(async () => null),
  };
});
vi.mock("@/lib/community-messenger/call-v4/call-v4-actions", () => ({ callV4IncomingDiscovered: vi.fn() }));
vi.mock("@/lib/community-messenger/call-v4/call-v4-platform-owner-claim", () => ({
  tryPrimeCallV4WebIncomingOwner: vi.fn(async () => {}),
}));
vi.mock("@/lib/platform/capacitor-native", () => ({ isCapacitorNativePlatform: vi.fn(() => false) }));
const metrics: string[] = [];
vi.mock("@/lib/community-messenger/monitoring/client", () => ({
  messengerMonitorRecord: vi.fn((e: { metric: string }) => metrics.push(e.metric)),
  messengerMonitorRealtimeSubscriptionOutcome: vi.fn(),
}));
vi.mock("@/lib/community-messenger/call-v4/call-v4-incoming-remote-terminal", () => ({
  confirmCallV4IncomingRemoteTerminal: vi.fn(async () => "unavailable"),
  isCurrentCallV4IncomingRinging: vi.fn(() => false),
}));
vi.mock("@/lib/community-messenger/call-v4/call-v4-incoming-realtime-feed", () => ({
  /** 실시간 피드 없음 = 2초 기본 주기(S4 10초 미적용)에서 상태별 동작만 본다 */
  acquireCallV4IncomingRealtimeFeed: vi.fn(() => () => {}),
}));

import {
  callV4FetchIncomingSessions,
  callV4FetchIncomingSessionsOutcome,
  parseCallV4RetryAfterMs,
} from "@/lib/community-messenger/call-v4/call-v4-api";
import { callV4IncomingDiscovered } from "@/lib/community-messenger/call-v4/call-v4-actions";
import {
  confirmCallV4IncomingRemoteTerminal,
  isCurrentCallV4IncomingRinging,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-remote-terminal";
import {
  resolveCallV4IncomingDiscoveryPollDelayMs,
  startCallV4IncomingDiscovery,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-discovery";
import {
  clearAllCallV4NativeAcceptingSurfaces,
  ingestCallV4SurfaceOwnerSignal,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import {
  dispatchDibayAuthStateChangeForTests,
  resetDibaySessionManagerForTests,
} from "@/lib/auth/dibay-session-manager";

const INCOMING_URL = "/api/community-messenger/calls/sessions/incoming?directOnly=1";
const ME = "me";

type FakeReply =
  | { kind: "json"; status: number; body: unknown; headers?: Record<string, string> }
  | { kind: "text"; status: number; text: string; headers?: Record<string, string> }
  | { kind: "throw"; error: Error };

function fakeResponse(reply: Exclude<FakeReply, { kind: "throw" }>): Response {
  const headers = new Map(Object.entries(reply.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: reply.status >= 200 && reply.status < 300,
    status: reply.status,
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    json: async () => {
      if (reply.kind === "json") return reply.body;
      return JSON.parse(reply.text);
    },
  } as unknown as Response;
}

const fetchSpy = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
let nextReply: FakeReply | (() => FakeReply) = { kind: "json", status: 200, body: { ok: true, sessions: [] } };

function incomingCalls(): number {
  return fetchSpy.mock.calls.filter(([u]) => String(u) === INCOMING_URL).length;
}

const ringingSession = (id: string) => ({
  id,
  roomId: "room-1",
  status: "ringing",
  isMineInitiator: false,
  callKind: "voice",
  startedAt: new Date().toISOString(),
});

const OK_EMPTY: FakeReply = { kind: "json", status: 200, body: { ok: true, sessions: [] } };
const REPLIES: Record<string, FakeReply> = {
  "401": { kind: "json", status: 401, body: { ok: false, error: "로그인이 필요합니다.", authenticated: false } },
  "403": { kind: "json", status: 403, body: { ok: false, error: "forbidden" } },
  "429": {
    kind: "json",
    status: 429,
    body: { ok: false, code: "community_messenger_incoming_call_rate_limited" },
    headers: { "Retry-After": "30", "X-RateLimit-Limit": "120", "X-RateLimit-Remaining": "0" },
  },
  "429_no_header": { kind: "json", status: 429, body: { ok: false } },
  "500": { kind: "text", status: 500, text: "<html>Internal Server Error</html>" },
  "503": { kind: "text", status: 503, text: "Service Unavailable" },
  "404": { kind: "text", status: 404, text: "Not Found" },
  "200_bad_json": { kind: "text", status: 200, text: "<html>not json</html>" },
  "200_ok_false": { kind: "json", status: 200, body: { ok: false } },
};

const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
let stops: Array<() => void> = [];
const start = () => {
  const s = startCallV4IncomingDiscovery(ME);
  stops.push(s);
  return s;
};

function ringCurrent(callId: string) {
  useCallV4Store.getState().setIdentity({
    callId,
    roomId: "r",
    callerUserId: "c",
    calleeUserId: ME,
    direction: "incoming",
    mediaType: "audio",
    createdAt: new Date().toISOString(),
  });
  useCallV4Store.setState({ phase: "incoming_ringing" });
  vi.mocked(isCurrentCallV4IncomingRinging).mockImplementation((id) => id === callId);
}

/** 운영 메모리 리미터와 같은 고정 창(`lib/http/api-route.ts` enforceRateLimitMemory) — 거부 요청은 세지 않는다. */
function createFakeRateLimitedServer(okBody: () => unknown, limit = 120, windowMs = 60_000) {
  let windowStart: number | null = null;
  let count = 0;
  const log: Array<{ t: number; status: number }> = [];
  return {
    log,
    reply: (): FakeReply => {
      const now = Date.now();
      if (windowStart == null || now - windowStart >= windowMs) {
        windowStart = now;
        count = 0;
      }
      if (count >= limit) {
        const retryAfterSec = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
        log.push({ t: now, status: 429 });
        return {
          kind: "json",
          status: 429,
          body: { ok: false, code: "community_messenger_incoming_call_rate_limited" },
          headers: { "Retry-After": String(retryAfterSec) },
        };
      }
      count += 1;
      log.push({ t: now, status: 200 });
      return { kind: "json", status: 200, body: okBody() };
    },
  };
}

function perMinute(log: Array<{ t: number; status: number }>, t0: number, minutes: number) {
  const rows: Array<{ minute: number; total: number; ok: number; limited: number }> = [];
  for (let m = 0; m < minutes; m += 1) {
    const inWin = log.filter((r) => r.t >= t0 + m * 60_000 && r.t < t0 + (m + 1) * 60_000);
    rows.push({
      minute: m,
      total: inWin.length,
      ok: inWin.filter((r) => r.status === 200).length,
      limited: inWin.filter((r) => r.status === 429).length,
    });
  }
  return rows;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  metrics.length = 0;
  clearAllCallV4NativeAcceptingSurfaces();
  useCallV4Store.getState().resetToIdle();
  nextReply = OK_EMPTY;
  fetchSpy.mockImplementation(async () => {
    const r = typeof nextReply === "function" ? nextReply() : nextReply;
    if (r.kind === "throw") throw r.error;
    return fakeResponse(r);
  });
  vi.stubGlobal("fetch", fetchSpy);
  window.history.pushState({}, "", "/community-messenger");
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  vi.mocked(isCurrentCallV4IncomingRinging).mockReturnValue(false);
});

afterEach(() => {
  for (const s of stops) s();
  stops = [];
  resetDibaySessionManagerForTests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("F1 ① callV4FetchIncomingSessionsOutcome — 상태별 분류", () => {
  it("200 ok:true → ok + sessions 그대로 (빈 목록도 ok)", async () => {
    nextReply = { kind: "json", status: 200, body: { ok: true, sessions: [ringingSession("c1")] } };
    const out = await callV4FetchIncomingSessionsOutcome();
    expect(out.kind).toBe("ok");
    expect(out.kind === "ok" && out.sessions).toHaveLength(1);
    nextReply = OK_EMPTY;
    await expect(callV4FetchIncomingSessionsOutcome()).resolves.toEqual({ kind: "ok", sessions: [] });
    nextReply = { kind: "json", status: 200, body: { ok: true } };
    await expect(callV4FetchIncomingSessionsOutcome()).resolves.toEqual({ kind: "ok", sessions: [] });
  });

  it.each([
    ["401", { kind: "auth", status: 401 }],
    ["403", { kind: "forbidden", status: 403 }],
    ["429", { kind: "rate_limited", status: 429, retryAfterMs: 30_000 }],
    ["429_no_header", { kind: "rate_limited", status: 429, retryAfterMs: null }],
    ["500", { kind: "server", status: 500 }],
    ["503", { kind: "server", status: 503 }],
    ["404", { kind: "bad_response", status: 404, reason: "http_status" }],
    ["200_bad_json", { kind: "bad_response", status: 200, reason: "invalid_json" }],
    ["200_ok_false", { kind: "bad_response", status: 200, reason: "ok_false" }],
  ])("%s → %j", async (key, expected) => {
    nextReply = REPLIES[key]!;
    await expect(callV4FetchIncomingSessionsOutcome()).resolves.toEqual(expected);
  });

  it("200 ok:true 인데 sessions 가 배열이 아니면 bad_response(invalid_sessions)", async () => {
    nextReply = { kind: "json", status: 200, body: { ok: true, sessions: { a: 1 } } };
    await expect(callV4FetchIncomingSessionsOutcome()).resolves.toEqual({
      kind: "bad_response",
      status: 200,
      reason: "invalid_sessions",
    });
  });

  it("네트워크 예외 → 예외가 그대로 던져진다(호출자 catch)", async () => {
    nextReply = { kind: "throw", error: new TypeError("Failed to fetch") };
    await expect(callV4FetchIncomingSessionsOutcome()).rejects.toThrow("Failed to fetch");
  });

  it("요청 자체(URL·옵션)는 바뀌지 않는다", async () => {
    await callV4FetchIncomingSessionsOutcome();
    expect(fetchSpy).toHaveBeenCalledWith(INCOMING_URL, { credentials: "include", cache: "no-store" });
  });

  it("Retry-After — 초·HTTP 날짜·무효값", () => {
    const now = Date.parse("2026-11-09T12:00:00Z");
    expect(parseCallV4RetryAfterMs("30", now)).toBe(30_000);
    expect(parseCallV4RetryAfterMs("0", now)).toBe(0);
    expect(parseCallV4RetryAfterMs("Mon, 09 Nov 2026 12:00:45 GMT", now)).toBe(45_000);
    expect(parseCallV4RetryAfterMs("", now)).toBeNull();
    expect(parseCallV4RetryAfterMs(null, now)).toBeNull();
    expect(parseCallV4RetryAfterMs("soon", now)).toBeNull();
    expect(parseCallV4RetryAfterMs("-5", now)).toBeNull();
  });

  it("목록 래퍼 callV4FetchIncomingSessions 는 오류에 [] · 정상에 sessions (호출자 호환)", async () => {
    nextReply = REPLIES["500"]!;
    await expect(callV4FetchIncomingSessions()).resolves.toEqual([]);
    nextReply = { kind: "json", status: 200, body: { ok: true, sessions: [ringingSession("c1")] } };
    await expect(callV4FetchIncomingSessions()).resolves.toHaveLength(1);
  });
});

describe("F1 ② 간격 표 (resolveCallV4IncomingDiscoveryPollDelayMs)", () => {
  it("기존 행 불변 — 경로 밖 60초 · 성공 2초 · 실시간 정상 10초 · 울림 2초 · 예외 4/8/16/30", () => {
    expect(resolveCallV4IncomingDiscoveryPollDelayMs(false, 0)).toBe(60_000);
    expect(resolveCallV4IncomingDiscoveryPollDelayMs(true, 0)).toBe(2_000);
    expect(resolveCallV4IncomingDiscoveryPollDelayMs(true, 0, { ringing: false, healthy: true })).toBe(10_000);
    expect(resolveCallV4IncomingDiscoveryPollDelayMs(true, 0, { ringing: true, healthy: true })).toBe(2_000);
    expect([1, 2, 3, 4].map((n) => resolveCallV4IncomingDiscoveryPollDelayMs(true, n))).toEqual([
      4_000, 8_000, 16_000, 30_000,
    ]);
    for (const kind of ["network", "auth", "forbidden"] as const) {
      expect([1, 2, 3, 4].map((n) => resolveCallV4IncomingDiscoveryPollDelayMs(true, n, undefined, { kind }))).toEqual([
        4_000, 8_000, 16_000, 30_000,
      ]);
    }
  });

  it("5xx·본문 오류 — 4→8초 상한(울리는 중에도 상한 8초)", () => {
    for (const kind of ["server", "bad_response"] as const) {
      for (const ringing of [false, true]) {
        expect(
          [1, 2, 3, 4].map((n) =>
            resolveCallV4IncomingDiscoveryPollDelayMs(true, n, { ringing, healthy: false }, { kind }),
          ),
        ).toEqual([4_000, 8_000, 8_000, 8_000]);
      }
    }
  });

  it("429 남은 대기 — 2~60초로 자른다, 경로 밖이면 60초(HTTP 없음)", () => {
    expect(resolveCallV4IncomingDiscoveryPollDelayMs(true, 0, undefined, { rateLimitWaitMs: 30_000 })).toBe(30_000);
    expect(resolveCallV4IncomingDiscoveryPollDelayMs(true, 0, undefined, { rateLimitWaitMs: 500 })).toBe(2_000);
    expect(resolveCallV4IncomingDiscoveryPollDelayMs(true, 0, undefined, { rateLimitWaitMs: 999_000 })).toBe(60_000);
    expect(resolveCallV4IncomingDiscoveryPollDelayMs(true, 3, undefined, { kind: "server", rateLimitWaitMs: 20_000 })).toBe(
      20_000,
    );
    expect(resolveCallV4IncomingDiscoveryPollDelayMs(false, 0, undefined, { rateLimitWaitMs: 5_000 })).toBe(60_000);
  });
});

describe("F1 ③ 루프 동작 — 상태별 다음 조회 시각", () => {
  it("정상 200 빈 목록 — 기존 그대로 2초마다 (10초에 6회)", async () => {
    start();
    await flush(0);
    expect(incomingCalls()).toBe(1);
    await flush(2_000 * 5);
    expect(incomingCalls()).toBe(6);
  });

  it.each(["401", "403"])("%s 연속 → 4·8·16·30(상한)초 사다리 (2초 폭주 없음)", async (key) => {
    nextReply = REPLIES[key]!;
    start();
    await flush(0);
    expect(incomingCalls()).toBe(1);
    await flush(3_999);
    expect(incomingCalls()).toBe(1);
    await flush(1);
    expect(incomingCalls()).toBe(2); // t=4s
    await flush(8_000);
    expect(incomingCalls()).toBe(3); // t=12s
    await flush(16_000);
    expect(incomingCalls()).toBe(4); // t=28s
    await flush(30_000);
    expect(incomingCalls()).toBe(5); // t=58s
    await flush(30_000);
    expect(incomingCalls()).toBe(6); // t=88s
  });

  it.each(["500", "503", "200_bad_json", "200_ok_false", "404"])(
    "%s 연속 → 4·8·8·8초 (상한 8초, 무한 2초 재시도 없음)",
    async (key) => {
      nextReply = REPLIES[key]!;
      start();
      await flush(0);
      expect(incomingCalls()).toBe(1);
      await flush(3_999);
      expect(incomingCalls()).toBe(1);
      await flush(1);
      expect(incomingCalls()).toBe(2); // t=4
      await flush(8_000);
      expect(incomingCalls()).toBe(3); // t=12
      await flush(8_000);
      expect(incomingCalls()).toBe(4); // t=20
      await flush(8_000);
      expect(incomingCalls()).toBe(5); // t=28
    },
  );

  it("429 + Retry-After: 30 → 30초 동안 조회 없음, 30초에 재조회", async () => {
    nextReply = REPLIES["429"]!;
    start();
    await flush(0);
    expect(incomingCalls()).toBe(1);
    await flush(29_999);
    expect(incomingCalls()).toBe(1);
    nextReply = OK_EMPTY;
    await flush(1);
    expect(incomingCalls()).toBe(2);
    /** 해제 뒤 성공이면 기존 2초 주기 */
    await flush(2_000);
    expect(incomingCalls()).toBe(3);
  });

  it("429 Retry-After 없음 → 60초(서버 고정 창) 대기", async () => {
    nextReply = REPLIES["429_no_header"]!;
    start();
    await flush(0);
    await flush(59_999);
    expect(incomingCalls()).toBe(1);
    await flush(1);
    expect(incomingCalls()).toBe(2);
  });

  it("429 대기 중 보임 전환·online(resync) 은 요청을 보내지 않는다", async () => {
    nextReply = REPLIES["429"]!;
    start();
    await flush(0);
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
    await flush(10_000);
    expect(incomingCalls()).toBe(1);
  });

  it("오류에는 실패 카운터를 줄이지 않는다 — 500·500·429·500 뒤에도 8초 (성공 1회에만 2초 복귀)", async () => {
    const seq: FakeReply[] = [REPLIES["500"]!, REPLIES["500"]!, { ...REPLIES["429"]!, headers: { "Retry-After": "3" } } as FakeReply, REPLIES["500"]!];
    nextReply = () => seq.shift() ?? REPLIES["500"]!;
    start();
    await flush(0); // 500 → 4s
    await flush(4_000); // 500 → 8s
    expect(incomingCalls()).toBe(2);
    await flush(8_000); // t=12 429 RA 3
    expect(incomingCalls()).toBe(3);
    await flush(3_000); // t=15 500 → 카운터 3 → 8s
    expect(incomingCalls()).toBe(4);
    await flush(7_999);
    expect(incomingCalls()).toBe(4);
    nextReply = OK_EMPTY;
    await flush(1); // t=23 ok → 2s
    expect(incomingCalls()).toBe(5);
    await flush(2_000);
    expect(incomingCalls()).toBe(6);
  });

  it("네트워크 예외는 기존 사다리 그대로 (4·8·16·30)", async () => {
    nextReply = { kind: "throw", error: new TypeError("Failed to fetch") };
    start();
    await flush(0);
    await flush(4_000);
    expect(incomingCalls()).toBe(2);
    await flush(8_000);
    expect(incomingCalls()).toBe(3);
    await flush(16_000);
    expect(incomingCalls()).toBe(4);
    await flush(30_000);
    expect(incomingCalls()).toBe(5);
  });

  it("오류 종류별 측정 count (incoming_http_<kind>_<tab>)", async () => {
    for (const [key, metric] of [
      ["401", "incoming_http_auth_visible"],
      ["403", "incoming_http_forbidden_visible"],
      ["429", "incoming_http_rate_limited_visible"],
      ["500", "incoming_http_server_visible"],
      ["200_ok_false", "incoming_http_bad_response_visible"],
    ] as const) {
      metrics.length = 0;
      nextReply = REPLIES[key]!;
      const s = start();
      await flush(0);
      s();
      expect(metrics).toContain(metric);
    }
  });
});

describe("F1 ④ T2 — 오류 응답은 「빠짐」으로 보지 않는다", () => {
  it.each(["401", "403", "429", "500", "503", "200_bad_json", "200_ok_false"])(
    "%s 동안 울리는 통화에 confirm(poll_incoming_absent) 호출 0",
    async (key) => {
      ringCurrent("call-r");
      nextReply = REPLIES[key]!;
      start();
      await flush(0);
      await flush(30_000);
      expect(confirmCallV4IncomingRemoteTerminal).not.toHaveBeenCalled();
    },
  );

  it("정상 200 빈 목록 + 울리는 중 → 기존 그대로 매 조회 confirm (2초 주기)", async () => {
    ringCurrent("call-r");
    start();
    await flush(0);
    await flush(2_000 * 2);
    const confirm = vi.mocked(confirmCallV4IncomingRemoteTerminal);
    expect(confirm).toHaveBeenCalledTimes(3);
    expect(confirm).toHaveBeenCalledWith("call-r", "poll_incoming_absent");
  });

  it("오류 뒤 정상 빈 목록이 오면 그 조회에서 confirm (T2 재개)", async () => {
    ringCurrent("call-r");
    nextReply = REPLIES["500"]!;
    start();
    await flush(0);
    expect(confirmCallV4IncomingRemoteTerminal).not.toHaveBeenCalled();
    nextReply = OK_EMPTY;
    await flush(4_000);
    expect(confirmCallV4IncomingRemoteTerminal).toHaveBeenCalledTimes(1);
  });

  it("200 에 울리는 통화가 들어 있으면 confirm 없음 (기존)", async () => {
    ringCurrent("call-r");
    nextReply = { kind: "json", status: 200, body: { ok: true, sessions: [ringingSession("call-r")] } };
    start();
    await flush(0);
    await flush(2_000 * 2);
    expect(confirmCallV4IncomingRemoteTerminal).not.toHaveBeenCalled();
  });
});

describe("F1 ⑤ 401 회복 — 앱 인증 이벤트(subscribeDibayAuthStateChange) 로 즉시 재개", () => {
  async function into401Backoff() {
    nextReply = REPLIES["401"]!;
    start();
    await flush(0);
    await flush(4_000); // 실패 2 → 다음 8초 뒤
    expect(incomingCalls()).toBe(2);
  }

  it.each(["TOKEN_REFRESHED", "SIGNED_IN"] as const)(
    "%s → 기다리지 않고 1회 조회, 수신 발견, 그 뒤 2초 주기",
    async (event) => {
      ingestCallV4SurfaceOwnerSignal({ callId: "call-x", owner: "web_in_app", reason: "test", ts: Date.now() });
      await into401Backoff();
      nextReply = { kind: "json", status: 200, body: { ok: true, sessions: [ringingSession("call-x")] } };
      dispatchDibayAuthStateChangeForTests(event, { user: { id: ME } } as never);
      await flush(0);
      expect(incomingCalls()).toBe(3);
      expect(callV4IncomingDiscovered).toHaveBeenCalledTimes(1);
      nextReply = OK_EMPTY;
      await flush(2_000);
      expect(incomingCalls()).toBe(4);
    },
  );

  it("인증 이벤트가 없어도 사다리(최대 30초)로 계속 확인한다 — 영구 정지 없음", async () => {
    ingestCallV4SurfaceOwnerSignal({ callId: "call-x", owner: "web_in_app", reason: "test", ts: Date.now() });
    await into401Backoff();
    nextReply = { kind: "json", status: 200, body: { ok: true, sessions: [ringingSession("call-x")] } };
    await flush(8_000);
    expect(incomingCalls()).toBe(3);
    expect(callV4IncomingDiscovered).toHaveBeenCalledTimes(1);
  });

  it("평시(401 아님) TOKEN_REFRESHED 는 요청을 늘리지 않는다", async () => {
    start();
    await flush(0);
    dispatchDibayAuthStateChangeForTests("TOKEN_REFRESHED", { user: { id: ME } } as never);
    await flush(0);
    expect(incomingCalls()).toBe(1);
  });

  it("다른 계정 SIGNED_IN 은 재개하지 않는다(사다리 유지)", async () => {
    await into401Backoff();
    dispatchDibayAuthStateChangeForTests("SIGNED_IN", { user: { id: "someone-else" } } as never);
    await flush(0);
    expect(incomingCalls()).toBe(2);
  });

  it("403 은 인증 이벤트로 재개하지 않는다(별도 분류 · 사다리)", async () => {
    nextReply = REPLIES["403"]!;
    start();
    await flush(0);
    dispatchDibayAuthStateChangeForTests("TOKEN_REFRESHED", { user: { id: ME } } as never);
    await flush(0);
    expect(incomingCalls()).toBe(1);
  });

  it("해제 후에는 인증 이벤트에 반응하지 않는다(구독 정리)", async () => {
    nextReply = REPLIES["401"]!;
    const s = start();
    await flush(0);
    s();
    dispatchDibayAuthStateChangeForTests("TOKEN_REFRESHED", { user: { id: ME } } as never);
    await flush(60_000);
    expect(incomingCalls()).toBe(1);
  });
});

describe("F1 ⑥ 무한 재시도 없음 — 10분 지속 오류 요청 수 상한", () => {
  it.each([
    ["500", 76],
    ["200_bad_json", 76],
    ["401", 23],
    ["403", 23],
  ])("%s 10분 지속 → %i 회 이하 (이전 코드: 301회)", async (key, max) => {
    nextReply = REPLIES[key]!;
    start();
    await flush(0);
    await flush(600_000);
    expect(incomingCalls()).toBeLessThanOrEqual(max);
  });
});

describe("F1 ⑦ 울림 30초 창 — 오류 중에도 최소 3회 조회 기회", () => {
  it("울리는 중 5xx 지속 → 30초 안 조회 ≥ 4회(0·4·12·20·28초)", async () => {
    ringCurrent("call-r");
    nextReply = REPLIES["500"]!;
    start();
    await flush(0);
    await flush(29_999);
    expect(incomingCalls()).toBeGreaterThanOrEqual(4);
  });

  it("울리는 중 429(Retry-After 60) → 8초 상한: 0·8·16·24초, 30초 안 4회", async () => {
    ringCurrent("call-r");
    nextReply = { ...REPLIES["429"]!, headers: { "Retry-After": "60" } } as FakeReply;
    start();
    await flush(0);
    expect(incomingCalls()).toBe(1);
    await flush(7_999);
    expect(incomingCalls()).toBe(1);
    await flush(1);
    expect(incomingCalls()).toBe(2);
    await flush(16_000);
    expect(incomingCalls()).toBe(4);
    await flush(5_999);
    expect(incomingCalls()).toBe(4);
  });

  it("울리지 않을 때 429(Retry-After 60) → 60초 대기(상한 미적용)", async () => {
    nextReply = { ...REPLIES["429"]!, headers: { "Retry-After": "60" } } as FakeReply;
    start();
    await flush(0);
    await flush(59_999);
    expect(incomingCalls()).toBe(1);
  });
});

describe("F1 ⑧ 요청량 — 가짜 서버(고정 창 60초·120회·사용자 키) 타이머 시뮬레이션", () => {
  async function runTabs(
    tabs: number,
    minutes: number,
    opts: { ringing?: boolean; resyncAtMs?: number[] } = {},
  ) {
    if (opts.ringing) ringCurrent("call-r");
    const server = createFakeRateLimitedServer(() => ({
      ok: true,
      sessions: opts.ringing ? [ringingSession("call-r")] : [],
    }));
    nextReply = () => server.reply();
    const t0 = Date.now();
    for (let i = 0; i < tabs; i += 1) start();
    await flush(0);
    let elapsed = 0;
    for (const at of [...(opts.resyncAtMs ?? [])].sort((a, b) => a - b)) {
      await flush(at - elapsed);
      elapsed = at;
      document.dispatchEvent(new Event("visibilitychange"));
      await flush(0);
    }
    await flush(minutes * 60_000 - elapsed - 1);
    return { rows: perMinute(server.log, t0, minutes), log: server.log };
  }

  it("1탭 · 울림 없음 · 실시간 없음 — 분당 30회(한도 25%), 429 없음", async () => {
    const { rows } = await runTabs(1, 3);
    console.info("[F1 volume] 1tab idle", JSON.stringify(rows));
    for (const r of rows) {
      expect(r.total).toBeLessThanOrEqual(30);
      expect(r.limited).toBe(0);
    }
  });

  it("1탭 · 울리는 중 — 분당 30회, 429 없음", async () => {
    const { rows } = await runTabs(1, 2, { ringing: true });
    console.info("[F1 volume] 1tab ringing", JSON.stringify(rows));
    for (const r of rows) {
      expect(r.total).toBeLessThanOrEqual(30);
      expect(r.limited).toBe(0);
    }
  });

  it("4탭 · 울림 없음 · 실시간 없음 — 분당 120회(한도 100%), 429 없음", async () => {
    const { rows } = await runTabs(4, 3);
    console.info("[F1 volume] 4tab idle", JSON.stringify(rows));
    for (const r of rows) {
      expect(r.total).toBeLessThanOrEqual(120);
      expect(r.limited).toBe(0);
    }
  });

  it("4탭 · 울림 없음 · 매분 보임 전환 resync 1회 — 한도 초과분은 Retry-After 로 멈춤 (분당 시도 ≤ 120+4)", async () => {
    const { rows } = await runTabs(4, 5, { resyncAtMs: [10_000, 70_000, 130_000, 190_000, 250_000] });
    console.info("[F1 volume] 4tab idle+resync", JSON.stringify(rows));
    for (const r of rows) {
      expect(r.ok).toBeLessThanOrEqual(120);
      expect(r.total).toBeLessThanOrEqual(124);
      expect(r.limited).toBeLessThanOrEqual(4);
    }
  });

  it("4탭 · 울리는 중 · resync 1회 — 429 뒤 탭마다 8초 상한 재시도 (분당 시도 ≤ 120 + 4×8)", async () => {
    const { rows } = await runTabs(4, 2, { ringing: true, resyncAtMs: [10_000, 70_000] });
    console.info("[F1 volume] 4tab ringing+resync", JSON.stringify(rows));
    for (const r of rows) {
      expect(r.ok).toBeLessThanOrEqual(120);
      expect(r.total).toBeLessThanOrEqual(120 + 4 * 8);
    }
    expect(confirmCallV4IncomingRemoteTerminal).not.toHaveBeenCalled();
  });

  it("참고 · 8탭(같은 사용자 2기기×4탭) · 울림 없음 — 창 중간 429 뒤 Retry-After 까지 정지 (분당 시도 ≤ 120+8, 이전 코드 240)", async () => {
    const { rows } = await runTabs(8, 3);
    console.info("[F1 volume] 8tab idle", JSON.stringify(rows));
    for (const r of rows) {
      expect(r.ok).toBeLessThanOrEqual(120);
      expect(r.total).toBeLessThanOrEqual(128);
    }
  });

  it("참고 · 8탭 · 울리는 중 — 429 뒤 탭마다 8초 상한 재시도, T2 오판 0 (분당 시도 ≤ 120+8×4)", async () => {
    const { rows } = await runTabs(8, 2, { ringing: true });
    console.info("[F1 volume] 8tab ringing", JSON.stringify(rows));
    for (const r of rows) {
      expect(r.ok).toBeLessThanOrEqual(120);
      expect(r.total).toBeLessThanOrEqual(120 + 8 * 4);
    }
    expect(confirmCallV4IncomingRemoteTerminal).not.toHaveBeenCalled();
  });
});
