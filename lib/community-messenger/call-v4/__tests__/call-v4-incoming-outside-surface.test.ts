/** @vitest-environment jsdom */
/**
 * F2 (Owner 승인 2026-11-09) — V4 웹 수신: 허용 경로(메신저·채팅) 밖에서도 Realtime 울림 신호 1회에 수신 조회 1회.
 * 설계: docs/audit/f1-f2-call-incoming-design-2026-11-09.md §F2·§3-3 (특성화 테스트 → 기대 동작 테스트로 전환)
 *
 * 실시간 신호 경로는 **실제** `@supabase/realtime-js` RealtimeClient + 가짜 WebSocket(`rt-fake-realtime-socket`) 위에서
 * 실제 `acquireCallV4IncomingRealtimeFeed` → `subscribeWithRetry` → `startCallV4IncomingDiscovery` 를 그대로 탄다.
 * 대체하는 것: 서버 응답(join ack·postgres_changes 프레임), 수신 조회 HTTP(`callV4FetchIncomingSessions`),
 * 시트 표시 진입(`callV4IncomingDiscovered` — 호출 시 store 를 incoming_ringing 으로 둔다), 측정 전송.
 *
 * 기대 계약
 * - 울림 신호: `/admin*`·`/login*` 을 뺀 모든 경로에서 통화당 1회 조회.
 * - 정기 조회·탭 복귀·online·재연결 resync: 허용 경로 밖이면 지금처럼 0(우회 없음).
 * - 메신저 화면: 지금과 같음.
 * - Capacitor 셸: 피드 미획득 → 신호 경로 자체가 없음.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import {
  createFakeRealtime,
  flushMicrotasks,
  type FakeRealtime,
} from "@/lib/community-messenger/realtime/__tests__/rt-fake-realtime-socket";

const h = vi.hoisted(() => ({
  fake: null as unknown,
  metrics: [] as string[],
  native: false,
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => (h.fake as { sb: unknown } | null)?.sb ?? null,
}));
vi.mock("@/lib/supabase/wait-for-realtime-auth", () => ({
  syncSupabaseRealtimeAuthFromSession: vi.fn(async () => true),
  waitForSupabaseRealtimeAuth: vi.fn(async () => true),
}));
vi.mock("@/lib/community-messenger/monitoring/client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  messengerMonitorRecord: vi.fn((e: { metric: string }) => h.metrics.push(e.metric)),
  messengerMonitorRealtimeSubscriptionOutcome: vi.fn(),
  messengerMonitorRealtimeSilentScope: vi.fn(),
}));
vi.mock("@/lib/community-messenger/call-v4/call-v4-flag", () => ({ isCallV4TelegramLaneEnabled: vi.fn(() => true) }));
vi.mock("@/lib/community-messenger/call-v4/call-v4-api", () => {
  const callV4FetchIncomingSessions = vi.fn();
  return {
    callV4FetchIncomingSessions,
    /** F1 통합: 수신 조회 루프는 Outcome 을 쓴다 — 이 파일의 목록 mock 을 「200 ok」로 감싼다(예외는 그대로 throw). */
    callV4FetchIncomingSessionsOutcome: vi.fn(async () => ({
      kind: "ok" as const,
      sessions: await callV4FetchIncomingSessions(),
    })),
    callV4FetchSession: vi.fn(),
  };
});
vi.mock("@/lib/community-messenger/call-v4/call-v4-actions", () => ({ callV4IncomingDiscovered: vi.fn() }));
vi.mock("@/lib/community-messenger/call-v4/call-v4-platform-owner-claim", () => ({
  tryPrimeCallV4WebIncomingOwner: vi.fn(async () => {}),
}));
vi.mock("@/lib/platform/capacitor-native", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isCapacitorNativePlatform: vi.fn(() => h.native),
}));
vi.mock("@/lib/community-messenger/call-v4/call-v4-incoming-remote-terminal", () => ({
  confirmCallV4IncomingRemoteTerminal: vi.fn(async () => "not_current"),
  isCurrentCallV4IncomingRinging: vi.fn(() => false),
}));

import { callV4FetchIncomingSessions } from "@/lib/community-messenger/call-v4/call-v4-api";
import { callV4IncomingDiscovered } from "@/lib/community-messenger/call-v4/call-v4-actions";
import { startCallV4IncomingDiscovery } from "@/lib/community-messenger/call-v4/call-v4-incoming-discovery";
import { __resetCallV4IncomingRealtimeFeedForTests } from "@/lib/community-messenger/call-v4/call-v4-incoming-realtime-feed";
import {
  clearAllCallV4NativeAcceptingSurfaces,
  ingestCallV4SurfaceOwnerSignal,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

const UID = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const FEED = `community-messenger-incoming-call:${UID}`;
const PG_FILTER = {
  event: "*",
  schema: "public",
  table: "community_messenger_call_sessions",
  filter: `recipient_user_id=eq.${UID}`,
} as const;
const PG_ID = 701;

const fetchMock = vi.mocked(callV4FetchIncomingSessions);
const discoveredMock = vi.mocked(callV4IncomingDiscovered);
const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
let fake: FakeRealtime;
let stops: Array<() => void> = [];

const ringing = (id: string): CommunityMessengerCallSession =>
  ({
    id,
    roomId: "room-1",
    status: "ringing",
    isMineInitiator: false,
    callKind: "voice",
    startedAt: new Date().toISOString(),
  }) as unknown as CommunityMessengerCallSession;

function setVisibility(v: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: v });
}

function start(): void {
  stops.push(startCallV4IncomingDiscovery(UID));
}

/** 실제 realtime-js 채널이 보낸 phx_join 에 서버 ok + postgres_changes 바인딩 id 응답 → SUBSCRIBED */
async function ackFeedJoin(): Promise<void> {
  await flushMicrotasks(20);
  await flush(0);
  const join = fake.ackLastJoin(FEED, { postgres_changes: [{ id: PG_ID, ...PG_FILTER }] });
  expect(join).not.toBeNull();
  await flushMicrotasks(10);
  await flush(0);
}

/** 서버가 보내는 postgres_changes 프레임(실제 realtime-js 가 columns+record → payload.new 로 변환) */
function serverSessionRow(callId: string, status = "ringing", type: "INSERT" | "UPDATE" = "UPDATE"): void {
  fake.serverPostgresChange(FEED, [PG_ID], {
    type,
    schema: "public",
    table: "community_messenger_call_sessions",
    commit_timestamp: new Date().toISOString(),
    columns: [
      { name: "id", type: "text" },
      { name: "status", type: "text" },
      { name: "session_mode", type: "text" },
      { name: "recipient_user_id", type: "text" },
      { name: "started_at", type: "text" },
    ],
    record: {
      id: callId,
      status,
      session_mode: "direct",
      recipient_user_id: UID,
      started_at: new Date().toISOString(),
    },
    old_record: { id: callId },
    errors: null,
  });
}

/** 데스크톱 브라우저: 시트 표시 진입 시 store 가 incoming_ringing (실제 callV4IncomingDiscovered 의 결과 상태만 흉내) */
function discoveredSetsRinging(): void {
  discoveredMock.mockImplementation((session: CommunityMessengerCallSession) => {
    useCallV4Store.getState().setIdentity({
      callId: session.id,
      roomId: session.roomId ?? "room-1",
      callerUserId: "peer",
      calleeUserId: UID,
      direction: "incoming",
      mediaType: "audio",
      createdAt: new Date().toISOString(),
    });
    useCallV4Store.setState({ phase: "incoming_ringing" });
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
  h.metrics.length = 0;
  h.native = false;
  __resetCallV4IncomingRealtimeFeedForTests();
  fake = createFakeRealtime("jwt-A");
  h.fake = fake;
  clearAllCallV4NativeAcceptingSurfaces();
  useCallV4Store.getState().resetToIdle();
  fetchMock.mockResolvedValue([]);
  discoveredSetsRinging();
  setVisibility("visible");
});

afterEach(() => {
  for (const s of stops) s();
  stops = [];
  __resetCallV4IncomingRealtimeFeedForTests();
  fake.dispose();
  h.fake = null;
  useCallV4Store.getState().resetToIdle();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const OUTSIDE_USER = ["/", "/philife", "/community", "/market", "/stores", "/mypage"];
const ADMIN = ["/admin", "/admin/x"];

/** route × trigger 표 — 아래 각 it 이 1칸씩 검증한다. (before = 8b894e37b, after = F2) */
const MATRIX: Record<string, { signal: number; poll120s: number | "messenger"; resync: number }> = {
  "/": { signal: 1, poll120s: 0, resync: 0 },
  "/philife": { signal: 1, poll120s: 0, resync: 0 },
  "/community": { signal: 1, poll120s: 0, resync: 0 },
  "/market": { signal: 1, poll120s: 0, resync: 0 },
  "/stores": { signal: 1, poll120s: 0, resync: 0 },
  "/mypage": { signal: 1, poll120s: 0, resync: 0 },
  "/admin": { signal: 0, poll120s: 0, resync: 0 },
  "/admin/x": { signal: 0, poll120s: 0, resync: 0 },
  "/community-messenger": { signal: 1, poll120s: "messenger", resync: 2 },
};

describe("F2 경로 × 출처 조회 횟수 (실제 realtime-js)", () => {
  it.each(Object.keys(MATRIX))("%s — 울림 신호 1회 → 조회 수", async (path) => {
    window.history.pushState({}, "", path);
    ingestCallV4SurfaceOwnerSignal({ callId: "call-sig", owner: "web_in_app", reason: "test", ts: Date.now() });
    start();
    await ackFeedJoin();
    const before = fetchMock.mock.calls.length;
    fetchMock.mockResolvedValue([ringing("call-sig")]);
    serverSessionRow("call-sig", "ringing", "INSERT");
    await flush(0);
    expect(fetchMock.mock.calls.length - before).toBe(MATRIX[path]!.signal);
    expect(discoveredMock).toHaveBeenCalledTimes(MATRIX[path]!.signal);
  });

  it.each(Object.keys(MATRIX))("%s — 정기 조회(신호 없음 120초) 조회 수", async (path) => {
    window.history.pushState({}, "", path);
    start();
    await ackFeedJoin();
    await flush(120_000);
    const expected = MATRIX[path]!.poll120s;
    if (expected === "messenger") {
      /** 메신저: 시작 1 + SUBSCRIBED resync 1 + 2초 간격(안정 전) → 10초 간격(S4) — 기존 그대로 */
      expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
      expect(h.metrics).toContain("poll_tick_subscribed_visible");
    } else {
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it.each(Object.keys(MATRIX))("%s — 탭 복귀·online resync 조회 수(우회 없음)", async (path) => {
    window.history.pushState({}, "", path);
    start();
    await ackFeedJoin();
    const before = fetchMock.mock.calls.length;
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
    await flush(0);
    expect(fetchMock.mock.calls.length - before).toBe(MATRIX[path]!.resync);
  });

  it.each([...OUTSIDE_USER, ...ADMIN])("%s — 실시간 재연결(SUBSCRIBED 전환) resync 도 조회 0", async (path) => {
    window.history.pushState({}, "", path);
    start();
    /** 시작 tick + join ack 의 SUBSCRIBED 전환 resync — 둘 다 경로 관문 그대로 */
    await ackFeedJoin();
    await flush(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("F2 중복 방지 · 우회 누수 없음", () => {
  it("같은 통화의 ringing 프레임이 여러 번 와도 조회는 1회(realtimeSignaled dedupe)", async () => {
    window.history.pushState({}, "", "/philife");
    start();
    await ackFeedJoin();
    serverSessionRow("call-dup", "ringing", "INSERT");
    serverSessionRow("call-dup", "ringing", "UPDATE");
    serverSessionRow("call-dup", "ringing", "UPDATE");
    await flush(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("울리는 중 메신저로 이동한 뒤 같은 통화 신호가 다시 와도 추가 신호 조회 없음(정기 조회만)", async () => {
    window.history.pushState({}, "", "/philife");
    start();
    await ackFeedJoin();
    serverSessionRow("call-dup2");
    await flush(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    window.history.pushState({}, "", "/community-messenger");
    serverSessionRow("call-dup2");
    await flush(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("신호 조회 진행 중 탭 복귀·online(resync)이 밀려도 끝난 뒤 재조회는 경로 관문 그대로 → 추가 0", async () => {
    window.history.pushState({}, "", "/market");
    start();
    await ackFeedJoin();
    let release: (v: CommunityMessengerCallSession[]) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise((r) => (release = r)));
    serverSessionRow("call-hang");
    await flush(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
    await flush(0);
    release([]);
    await flush(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    /** 다음 정기 예약도 억제 간격(60초·HTTP 0) */
    await flush(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("신호 조회 진행 중 다른 통화 신호 → 끝난 뒤 그 신호만 1회 우회 조회, 우회 플래그는 1회로 소진", async () => {
    window.history.pushState({}, "", "/stores");
    start();
    await ackFeedJoin();
    let release: (v: CommunityMessengerCallSession[]) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise((r) => (release = r)));
    serverSessionRow("call-a");
    await flush(0);
    serverSessionRow("call-b");
    serverSessionRow("call-b");
    await flush(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release([]);
    await flush(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    /** 소진 후 resync 는 다시 0 */
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
    await flush(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("/admin: 신호 조회 진행이 없으므로 밀린 우회도 없다 — 신호·resync 모두 0", async () => {
    window.history.pushState({}, "", "/admin/x");
    start();
    await ackFeedJoin();
    serverSessionRow("call-adm");
    document.dispatchEvent(new Event("visibilitychange"));
    await flush(120_000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(discoveredMock).not.toHaveBeenCalled();
  });

  it("종료 프레임(cancelled)은 울림 신호가 아니다 → 경로 밖 조회 0", async () => {
    window.history.pushState({}, "", "/");
    start();
    await ackFeedJoin();
    serverSessionRow("call-x", "cancelled");
    await flush(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("F2 울림 30초 창 안 발견", () => {
  it.each(OUTSIDE_USER)("%s: 울림 신호 직후(30초 안) 수신 시트 진입 + 울리는 중 2초 조회로 전환", async (path) => {
    window.history.pushState({}, "", path);
    ingestCallV4SurfaceOwnerSignal({ callId: "call-30", owner: "web_in_app", reason: "test", ts: Date.now() });
    start();
    await ackFeedJoin();
    fetchMock.mockResolvedValue([ringing("call-30")]);
    const t0 = Date.now();
    serverSessionRow("call-30", "ringing", "INSERT");
    await flush(0);
    expect(discoveredMock).toHaveBeenCalledTimes(1);
    expect(Date.now() - t0).toBeLessThan(30_000);
    expect(useCallV4Store.getState().phase).toBe("incoming_ringing");
    await flush(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("허용 경로 밖 울리는 중(phase=incoming_ringing)에는 경로 무관 2초 조회 — 기존 유지", async () => {
    window.history.pushState({}, "", "/");
    useCallV4Store.getState().setIdentity({
      callId: "call-r",
      roomId: "r",
      callerUserId: "c",
      calleeUserId: UID,
      direction: "incoming",
      mediaType: "audio",
      createdAt: new Date().toISOString(),
    });
    useCallV4Store.setState({ phase: "incoming_ringing" });
    start();
    await flush(0);
    await flush(2_000 * 3);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe("F2 다중 탭 요청량 (사용자당 120회/60초 상한)", () => {
  it("4탭 · 경로 밖 · 수신 1건(30초 울림 후 부재중) → 60초 창 조회 합계 ≤ 120", async () => {
    window.history.pushState({}, "", "/");
    ingestCallV4SurfaceOwnerSignal({ callId: "call-4t", owner: "web_in_app", reason: "test", ts: Date.now() });
    /** 같은 문서에서 4개 수신 루프 = 탭 4개 상한 모델(채널은 사용자당 1개 fan-out, 각 루프는 자기 tick·dedupe 를 가진다) */
    for (let i = 0; i < 4; i += 1) start();
    await ackFeedJoin();
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue([ringing("call-4t")]);
    serverSessionRow("call-4t", "ringing", "INSERT");
    await flush(0);
    /** 신호 1회 → 탭당 1회 */
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await flush(29_999);
    /** 울림 30초 종료(부재중) → 서버 목록에서 빠지고 store idle */
    fetchMock.mockResolvedValue([]);
    useCallV4Store.getState().resetToIdle();
    await flush(30_001);
    const total = fetchMock.mock.calls.length;
    /** 탭당: 신호 1 + 울리는 중 2초 × 14(2~28초) = 15 → 4탭 60 */
    expect(total).toBe(60);
    expect(total).toBeLessThanOrEqual(120);
  });
});

describe("F2 네이티브(Capacitor 셸) 무영향", () => {
  it("isCapacitorNativePlatform=true → 피드 join 자체가 없고 경로 밖 조회 0", async () => {
    h.native = true;
    window.history.pushState({}, "", "/");
    start();
    await flushMicrotasks(20);
    await flush(120_000);
    expect(fake.frames({ topic: FEED, event: "phx_join" })).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Android·iOS 셸(syncOnly)은 수신 조회 호스트를 마운트하지 않는다(CallV4Provider 소스 계약)", () => {
    const src = readFileSync(
      join(process.cwd(), "components/community-messenger/call-v4/CallV4Provider.tsx"),
      "utf8",
    );
    expect(src).toMatch(
      /const syncOnly =\s*isLegacyWebCallEstablishmentRemoved\(\) \|\|\s*\(isCapacitorNativePlatform\(\) && resolveCapacitorShellPlatform\(\) === "ios"\);/,
    );
    expect(src).toMatch(/if \(syncOnly\) \{\s*return <>\{children\}<\/>;\s*\}/);
    /** startCallV4IncomingDiscovery 는 CallV4WebEstablishmentHost 안에서만 호출 */
    const hostStart = src.indexOf("function CallV4WebEstablishmentHost(");
    const providerStart = src.indexOf("export function CallV4Provider(");
    const call = src.indexOf("startCallV4IncomingDiscovery(userId)");
    expect(hostStart).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(hostStart);
    expect(call).toBeLessThan(providerStart);
    expect(src.split("startCallV4IncomingDiscovery(").length - 1).toBe(1);
  });

  it("수신 루프는 Capacitor 에서 피드를 획득하지 않는다(discovery 소스 계약)", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/call-v4/call-v4-incoming-discovery.ts"),
      "utf8",
    );
    expect(src).toContain("const realtimeFeedActive = !isCapacitorNativePlatform();");
    expect(src).toMatch(/if \(realtimeFeedActive\) \{\s*releaseRealtimeFeed = acquireCallV4IncomingRealtimeFeed\(/);
  });
});
