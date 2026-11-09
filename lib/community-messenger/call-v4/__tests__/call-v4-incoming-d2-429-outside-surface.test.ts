/** @vitest-environment jsdom */
/**
 * F1 — 실시간이 끼는 경우 (실제 `@supabase/realtime-js` RealtimeClient + 가짜 WebSocket 하네스).
 * 수신 피드(`acquireCallV4IncomingRealtimeFeed` → `subscribeWithRetry`)는 실제 코드 그대로 돈다.
 * 서버 응답(phx_reply·postgres_changes)과 수신 조회 HTTP 응답만 테스트가 흉내 낸다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeRealtime,
  flushMicrotasks,
  type FakeRealtime,
} from "@/lib/community-messenger/realtime/__tests__/rt-fake-realtime-socket";

const h = vi.hoisted(() => ({ fake: null as unknown }));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => (h.fake as { sb: unknown } | null)?.sb ?? null,
}));
vi.mock("@/lib/supabase/wait-for-realtime-auth", () => ({
  syncSupabaseRealtimeAuthFromSession: vi.fn(async () => true),
  waitForSupabaseRealtimeAuth: vi.fn(async () => true),
}));
vi.mock("@/lib/community-messenger/call-v4/call-v4-flag", () => ({ isCallV4TelegramLaneEnabled: vi.fn(() => true) }));
vi.mock("@/lib/community-messenger/call-v4/call-v4-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/community-messenger/call-v4/call-v4-api")>();
  return { ...actual, callV4FetchSession: vi.fn(async () => null) };
});
vi.mock("@/lib/community-messenger/call-v4/call-v4-actions", () => ({ callV4IncomingDiscovered: vi.fn() }));
vi.mock("@/lib/community-messenger/call-v4/call-v4-platform-owner-claim", () => ({
  tryPrimeCallV4WebIncomingOwner: vi.fn(async () => {}),
}));
vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => false),
  resolveCapacitorShellPlatform: vi.fn(() => "web"),
}));
vi.mock("@/lib/community-messenger/monitoring/client", () => ({
  messengerMonitorRecord: vi.fn(),
  messengerMonitorRealtimeSubscriptionOutcome: vi.fn(),
}));
vi.mock("@/lib/community-messenger/call-v4/call-v4-incoming-remote-terminal", () => ({
  confirmCallV4IncomingRemoteTerminal: vi.fn(async () => "unavailable"),
  isCurrentCallV4IncomingRinging: vi.fn(() => false),
}));

import { callV4IncomingDiscovered } from "@/lib/community-messenger/call-v4/call-v4-actions";
import {
  confirmCallV4IncomingRemoteTerminal,
  isCurrentCallV4IncomingRinging,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-remote-terminal";
import { startCallV4IncomingDiscovery } from "@/lib/community-messenger/call-v4/call-v4-incoming-discovery";
import { __resetCallV4IncomingRealtimeFeedForTests } from "@/lib/community-messenger/call-v4/call-v4-incoming-realtime-feed";
import {
  clearAllCallV4NativeAcceptingSurfaces,
  ingestCallV4SurfaceOwnerSignal,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

const UID = "4b9d6a3e-1c2f-4e5a-9b8c-7d6e5f4a3b2c";
const TOPIC = `community-messenger-incoming-call:${UID}`;
const INCOMING_URL = "/api/community-messenger/calls/sessions/incoming?directOnly=1";
const PG_ID = 9001;

type Reply = { status: number; body?: unknown; text?: string; headers?: Record<string, string> };
const OK_EMPTY: Reply = { status: 200, body: { ok: true, sessions: [] } };
let nextReply: Reply | (() => Reply) = OK_EMPTY;
const fetchSpy = vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) => {
  const r = typeof nextReply === "function" ? nextReply() : nextReply;
  const headers = new Map(Object.entries(r.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    json: async () => (r.body !== undefined ? r.body : JSON.parse(r.text ?? "")),
  } as unknown as Response;
});
const incomingCalls = () => fetchSpy.mock.calls.filter(([u]) => String(u) === INCOMING_URL).length;
const incomingCallTimes: number[] = [];

let fake: FakeRealtime;
let stops: Array<() => void> = [];
const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

function ringingSession(id: string) {
  return { id, roomId: "room-1", status: "ringing", isMineInitiator: false, startedAt: new Date().toISOString() };
}

/** 실제 채널 join 에 서버 ok 응답(postgres_changes 바인딩 id 부여) → SUBSCRIBED */
async function ackIncomingJoin() {
  await flushMicrotasks(10);
  const ack = fake.ackLastJoin(TOPIC, {
    postgres_changes: [
      {
        id: PG_ID,
        event: "*",
        schema: "public",
        table: "community_messenger_call_sessions",
        filter: `recipient_user_id=eq.${UID}`,
      },
    ],
  });
  expect(ack).not.toBeNull();
  await flushMicrotasks(10);
}

function serverRowChange(row: Record<string, unknown>, type: "INSERT" | "UPDATE" = "UPDATE") {
  fake.serverPostgresChange(TOPIC, [PG_ID], {
    type,
    schema: "public",
    table: "community_messenger_call_sessions",
    commit_timestamp: new Date().toISOString(),
    columns: [],
    record: { session_mode: "direct", recipient_user_id: UID, started_at: new Date().toISOString(), ...row },
    old_record: {},
    errors: null,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  fake = createFakeRealtime("jwt-A");
  h.fake = fake;
  __resetCallV4IncomingRealtimeFeedForTests();
  clearAllCallV4NativeAcceptingSurfaces();
  useCallV4Store.getState().resetToIdle();
  nextReply = OK_EMPTY;
  incomingCallTimes.length = 0;
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", (u: RequestInfo | URL, i?: RequestInit) => {
    if (String(u) === INCOMING_URL) incomingCallTimes.push(Date.now());
    return fetchSpy(u, i);
  });
  window.history.pushState({}, "", "/community-messenger");
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  vi.mocked(isCurrentCallV4IncomingRinging).mockReturnValue(false);
});

afterEach(() => {
  for (const s of stops) s();
  stops = [];
  __resetCallV4IncomingRealtimeFeedForTests();
  fake.dispose();
  h.fake = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/**
 * D2 (Owner 승인 2026-11-09 · docs/audit/call-incoming-defects-d1-d2-plan-2026-11-09.md) —
 * 429 대기 중 메신저 밖 화면(/philife 등)에서 울림 신호가 와도 대기가 끝나면 1회 조회해 발견한다.
 * 실제 realtime-js 2.99.2 + 가짜 WebSocket (위 하네스).
 */
const RATE_60: Reply = { status: 429, body: { ok: false }, headers: { "Retry-After": "60" } };

async function startOn(path: string) {
  window.history.pushState({}, "", path);
  stops.push(startCallV4IncomingDiscovery(UID));
  await ackIncomingJoin();
  await flush(6_000);
}

describe("D2 ① 신호 조회 자체가 429 (메신저 밖)", () => {
  it.each(["/philife", "/", "/market", "/mypage"])(
    "%s — 첫 울림 신호 조회 429 → 대기(울림 구간 8초 상한) 뒤 1회 조회로 발견",
    async (path) => {
      await startOn(path);
      expect(incomingCalls()).toBe(0); // 메신저 밖 — 정기 조회 없음(F2 계약)
      nextReply = RATE_60;
      ingestCallV4SurfaceOwnerSignal({ callId: "c1", owner: "web_in_app", reason: "test", ts: Date.now() });
      serverRowChange({ id: "c1", status: "ringing" });
      await flush(0);
      expect(incomingCalls()).toBe(1); // 신호 조회 → 429
      const limitedAt = incomingCallTimes[0]!;
      nextReply = { status: 200, body: { ok: true, sessions: [ringingSession("c1")] } };
      await flush(limitedAt + 8_000 - Date.now() - 1);
      expect(incomingCalls()).toBe(1);
      await flush(1);
      expect(incomingCalls()).toBe(2);
      expect(callV4IncomingDiscovered).toHaveBeenCalledTimes(1);
    },
  );
});

describe("D2 ② 이미 429 대기 중에 다른 통화 울림 신호", () => {
  it("/philife — 대기 중 신호는 즉시 요청 없이 기억, 대기 끝나면 1회 조회로 발견", async () => {
    await startOn("/philife");
    nextReply = RATE_60;
    serverRowChange({ id: "c-old", status: "ringing" });
    await flush(0);
    expect(incomingCalls()).toBe(1); // 429 시작
    const limitedAt = incomingCallTimes[0]!;
    await flush(2_000);
    ingestCallV4SurfaceOwnerSignal({ callId: "c2", owner: "web_in_app", reason: "test", ts: Date.now() });
    serverRowChange({ id: "c2", status: "ringing" });
    await flush(0);
    expect(incomingCalls()).toBe(1); // 대기 중 — 즉시 요청 없음
    nextReply = { status: 200, body: { ok: true, sessions: [ringingSession("c2")] } };
    await flush(limitedAt + 8_000 - Date.now());
    expect(incomingCalls()).toBe(2);
    expect(callV4IncomingDiscovered).toHaveBeenCalledTimes(1);
  });
});

describe("D2 ③ 경계 — 요청 폭주·우회 누수 없음", () => {
  it("울림 신호 없이 429 → 메신저 밖에서는 이후 조회 0 (F2 계약 그대로)", async () => {
    await startOn("/philife");
    nextReply = RATE_60;
    serverRowChange({ id: "c3", status: "ringing" });
    await flush(0);
    nextReply = { status: 200, body: { ok: true, sessions: [] } };
    await flush(8_000);
    const after = incomingCalls(); // 미뤄 둔 1회 소진
    await flush(120_000);
    expect(incomingCalls()).toBe(after); // 그 뒤로 정기 조회 없음
    expect(after).toBe(2);
  });

  it("429 가 계속되면 미뤄 둔 신호는 울림 시간(30초) 안에서만 재시도 — 무한 반복 없음", async () => {
    await startOn("/philife");
    nextReply = RATE_60;
    serverRowChange({ id: "c4", status: "ringing" });
    await flush(0);
    await flush(30_000);
    const inRing = incomingCalls();
    await flush(120_000);
    expect(incomingCalls()).toBe(inRing); // 30초 뒤에는 더 요청하지 않음
    expect(inRing).toBeLessThanOrEqual(1 + Math.ceil(30_000 / 8_000));
  });

  it("재감사: Retry-After 가 30초보다 짧아도 30초 기준은 처음 울림 신호 시각 — 우회 조회가 다시 429 여도 끝난다", async () => {
    await startOn("/philife");
    const RATE_10: Reply = { status: 429, body: { ok: false }, headers: { "Retry-After": "10" } };
    nextReply = RATE_10;
    serverRowChange({ id: "c6", status: "ringing" });
    await flush(0);
    const firstAt = incomingCallTimes[0]!;
    await flush(40_000);
    const after40 = incomingCalls();
    await flush(160_000);
    expect(incomingCalls()).toBe(after40); // 처음 신호 + 30초 이후 더 요청하지 않음
    const last = incomingCallTimes[incomingCallTimes.length - 1]!;
    expect(last - firstAt).toBeLessThan(30_000 + 8_000);
  });

  it("/admin — 429 대기 중 울림 신호가 와도 조회 0 (제외 그대로)", async () => {
    await startOn("/admin");
    serverRowChange({ id: "c5", status: "ringing" });
    await flush(60_000);
    expect(incomingCalls()).toBe(0);
  });

  it("메신저 경로 — 기존 동작(429 대기 뒤 정기 조회로 발견) 그대로", async () => {
    await startOn("/community-messenger");
    nextReply = RATE_60;
    await flush(10_000);
    const limitedAt = incomingCallTimes[incomingCallTimes.length - 1]!;
    const before = incomingCalls();
    ingestCallV4SurfaceOwnerSignal({ callId: "c6", owner: "web_in_app", reason: "test", ts: Date.now() });
    serverRowChange({ id: "c6", status: "ringing" });
    await flush(0);
    expect(incomingCalls()).toBe(before);
    nextReply = { status: 200, body: { ok: true, sessions: [ringingSession("c6")] } };
    await flush(limitedAt + 8_000 - Date.now());
    expect(incomingCalls()).toBe(before + 1);
    expect(callV4IncomingDiscovered).toHaveBeenCalledTimes(1);
  });

  it("4탭 · /philife · 수신 1건 · 신호 조회 429 → 60초 창 요청 ≤ 120", async () => {
    window.history.pushState({}, "", "/philife");
    for (let i = 0; i < 4; i += 1) stops.push(startCallV4IncomingDiscovery(UID));
    await ackIncomingJoin();
    await flush(6_000);
    nextReply = RATE_60;
    const t0 = Date.now();
    serverRowChange({ id: "c7", status: "ringing" });
    await flush(60_000);
    const inWindow = incomingCallTimes.filter((t) => t >= t0 && t < t0 + 60_000).length;
    process.stdout.write(`[D2 volume] 4tab philife 429 window60s=${inWindow}\n`);
    expect(inWindow).toBeLessThanOrEqual(120);
  });
});
