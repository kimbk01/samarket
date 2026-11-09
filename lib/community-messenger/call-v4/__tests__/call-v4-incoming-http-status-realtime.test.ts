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

describe("F1 실시간 ① 성공 경로 간격 불변 (실제 채널 SUBSCRIBED)", () => {
  it.each([1, 4])("%i탭 · SUBSCRIBED 5초 이상 · 정상 200 → 10초 주기 (분당 탭당 6회)", async (tabs) => {
    for (let i = 0; i < tabs; i += 1) stops.push(startCallV4IncomingDiscovery(UID));
    await ackIncomingJoin();
    await flush(0);
    const afterJoin = incomingCalls();
    /** 안정화 5초 동안은 2초 주기, 이후 10초 */
    await flush(5_000);
    const base = incomingCalls();
    await flush(60_000);
    const perMin = incomingCalls() - base;
    process.stdout.write(`[F1 volume realtime] ${tabs}tab subscribed afterJoin=${afterJoin} perMin=${perMin}\n`);
    expect(perMin).toBeLessThanOrEqual(6 * tabs + tabs);
    expect(perMin).toBeGreaterThanOrEqual(5 * tabs);
  });
});

describe("F1 실시간 ② 429 대기 중 실제 울림 신호 → 8초 상한으로 발견", () => {
  it("Retry-After 60 받은 뒤 울림 UPDATE 가 와도 즉시 조회하지 않고, 429 시점부터 8초에 조회 → 발견", async () => {
    stops.push(startCallV4IncomingDiscovery(UID));
    await ackIncomingJoin();
    await flush(0);
    await flush(6_000); // 안정 SUBSCRIBED · 정상 주기
    nextReply = { status: 429, body: { ok: false }, headers: { "Retry-After": "60" } };
    /** 다음 정기 조회(10초 주기)에서 429 */
    await flush(10_000);
    const limitedAt = incomingCallTimes[incomingCallTimes.length - 1]!;
    const before = incomingCalls();

    ingestCallV4SurfaceOwnerSignal({ callId: "call-rt", owner: "web_in_app", reason: "test", ts: Date.now() });
    await flush(1_000);
    serverRowChange({ id: "call-rt", status: "ringing" });
    await flush(0);
    expect(incomingCalls()).toBe(before); // 429 대기 중 — 신호로도 즉시 요청 없음

    nextReply = { status: 200, body: { ok: true, sessions: [ringingSession("call-rt")] } };
    await flush(limitedAt + 8_000 - Date.now() - 1);
    expect(incomingCalls()).toBe(before);
    await flush(1);
    expect(incomingCalls()).toBe(before + 1);
    expect(callV4IncomingDiscovered).toHaveBeenCalledTimes(1);
  });

  it("429 가 계속돼도 울림 신호 뒤 30초 안 조회 ≥ 3회", async () => {
    stops.push(startCallV4IncomingDiscovery(UID));
    await ackIncomingJoin();
    await flush(6_000);
    nextReply = { status: 429, body: { ok: false }, headers: { "Retry-After": "60" } };
    await flush(10_000);
    const signalAt = Date.now();
    serverRowChange({ id: "call-rt2", status: "ringing" });
    await flush(30_000 - 1);
    const inRing = incomingCallTimes.filter((t) => t >= signalAt && t < signalAt + 30_000).length;
    expect(inRing).toBeGreaterThanOrEqual(3);
  });

  it("울림 신호 없으면 Retry-After 60 그대로(정기 조회 없음)", async () => {
    stops.push(startCallV4IncomingDiscovery(UID));
    await ackIncomingJoin();
    await flush(6_000);
    nextReply = { status: 429, body: { ok: false }, headers: { "Retry-After": "60" } };
    await flush(10_000);
    const before = incomingCalls();
    await flush(59_000);
    expect(incomingCalls()).toBe(before);
  });
});

describe("F1 실시간 ③ 5xx 중 울림 신호 · T1 유지", () => {
  it("5xx 백오프 중 실제 울림 신호 → 즉시 1회 조회(관문 없음), 오류면 T2 없음", async () => {
    stops.push(startCallV4IncomingDiscovery(UID));
    await ackIncomingJoin();
    await flush(6_000);
    nextReply = { status: 503, text: "unavailable" };
    await flush(10_000);
    const before = incomingCalls();
    serverRowChange({ id: "call-5", status: "ringing" });
    await flush(0);
    expect(incomingCalls()).toBe(before + 1);
    expect(confirmCallV4IncomingRemoteTerminal).not.toHaveBeenCalled();
  });

  it("HTTP 오류가 이어져도 T1(실시간 상태 변경 → 서버 확인)은 그대로 동작", async () => {
    useCallV4Store.getState().setIdentity({
      callId: "call-t1",
      roomId: "r",
      callerUserId: "c",
      calleeUserId: UID,
      direction: "incoming",
      mediaType: "audio",
      createdAt: new Date().toISOString(),
    });
    useCallV4Store.setState({ phase: "incoming_ringing" });
    vi.mocked(isCurrentCallV4IncomingRinging).mockImplementation((id) => id === "call-t1");
    nextReply = { status: 500, text: "err" };
    stops.push(startCallV4IncomingDiscovery(UID));
    await ackIncomingJoin();
    await flush(10_000);
    expect(confirmCallV4IncomingRemoteTerminal).not.toHaveBeenCalled();
    serverRowChange({ id: "call-t1", status: "cancelled" });
    await flush(0);
    expect(confirmCallV4IncomingRemoteTerminal).toHaveBeenCalledTimes(1);
    expect(confirmCallV4IncomingRemoteTerminal).toHaveBeenCalledWith("call-t1", "realtime_incoming_status");
  });
});
