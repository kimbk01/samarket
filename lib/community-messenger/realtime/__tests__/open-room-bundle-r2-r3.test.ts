/**
 * D2 R2·R3(2026-11-26) — 방 묶음: 실패마다 HTTP 폴백 없음 · 끊김 15초 뒤 방당 60초에 1번 `fallback` ·
 * 재연결은 재동기화 묶음 1번(`reconnect`) · 처음 가입은 지금 그대로(이유 없음).
 * 개정안 docs/audit/supabase-request-surge-2026-11-18/messenger-realtime-contract-revision-d1-d2-2026-11-26.md §3 R2·R3
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const channelNames: string[] = [];
const subscribeStatusCbs: Array<(status: string) => void> = [];

function makeChannel() {
  const ch = {
    on: vi.fn(function on(this: unknown) {
      return this;
    }),
    subscribe: vi.fn((cb?: (status: string) => void) => {
      if (cb) subscribeStatusCbs.push(cb);
      return ch;
    }),
  };
  return ch;
}

const mockSb = {
  channel: vi.fn((name: string) => {
    channelNames.push(name);
    return makeChannel();
  }),
  removeChannel: vi.fn(async () => {}),
  realtime: { setAuth: vi.fn(async () => {}) },
  auth: {
    getSession: vi.fn(async () => ({
      data: { session: { access_token: "test-token" } },
    })),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
  },
};

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => mockSb,
}));

/** Simulate hung auth bridge — onReady never fires (Production failure mode). */
vi.mock("@/lib/community-messenger/realtime/community-messenger-realtime-auth-bridge", () => ({
  createRealtimeAuthBridge: () => () => {},
}));

vi.mock("@/lib/supabase/wait-for-realtime-auth", () => ({
  waitForSupabaseRealtimeAuth: vi.fn(async () => true),
  syncSupabaseRealtimeAuthFromSession: vi.fn(async () => true),
}));

vi.mock("@/lib/supabase/realtime-auth-events", () => ({
  subscribeSamarketRealtimeTokenRefreshed: () => () => {},
}));


async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

describe("D2 R2·R3 open-room bundle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    channelNames.length = 0;
    subscribeStatusCbs.length = 0;
    mockSb.channel.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  async function setup() {
    const { createGlobalMessengerRoomBundleEntry } = await import(
      "@/lib/community-messenger/realtime/global-messenger-room-bundle-channel"
    );
    const entry = createGlobalMessengerRoomBundleEntry({ viewerForChannel: "viewer-r2r3" });
    const onRefresh = vi.fn();
    entry.listenersByRoom.set("cccccccc-cccc-cccc-cccc-cccccccccccc", new Set([{ current: { onRefresh } }]));
    entry.notifyRoomListenersChanged!();
    await vi.advanceTimersByTimeAsync(80);
    await flush();
    const last = () => subscribeStatusCbs[subscribeStatusCbs.length - 1]!;
    return { entry, onRefresh, last };
  }

  it("처음 가입 → 이유 없는 onRefresh 1번(지금 동작)", async () => {
    const { entry, onRefresh, last } = await setup();
    last()("SUBSCRIBED");
    await flush();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenLastCalledWith(undefined);
    entry.stop();
  });

  it("R3: 실패가 이어져도 실패마다 폴백 없음 — 15초 뒤부터 60초에 1번 fallback (4분 동안 최대 4번)", async () => {
    const { entry, onRefresh, last } = await setup();
    last()("SUBSCRIBED");
    await flush();
    onRefresh.mockClear();
    // 4분 동안 5초마다 실패(래퍼 재시도 흉내)
    for (let i = 0; i < 48; i++) {
      last()("TIMED_OUT");
      await vi.advanceTimersByTimeAsync(5_000);
      await flush();
    }
    const calls = onRefresh.mock.calls.map((c) => c[0]);
    expect(calls.every((r) => r === "fallback")).toBe(true);
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(calls.length).toBeLessThanOrEqual(4);
    entry.stop();
  });

  it("R2: 끊겼다 다시 가입 → 1초 조용 뒤 reconnect 1번(bootstrap 없는 이유)", async () => {
    const { entry, onRefresh, last } = await setup();
    last()("SUBSCRIBED");
    await flush();
    onRefresh.mockClear();
    last()("CHANNEL_ERROR");
    await vi.advanceTimersByTimeAsync(2_000);
    await flush();
    last()("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(1_100);
    await flush();
    const calls = onRefresh.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(["reconnect"]);
    entry.stop();
  });

  it("감사 F1: 상태가 한 번도 안 와도(인증 대기·감독 차단 중 재바인드) 15초 뒤부터 fallback", async () => {
    const { entry, onRefresh } = await setup();
    // SUBSCRIBED·실패 어느 것도 보내지 않음
    await vi.advanceTimersByTimeAsync(14_000);
    await flush();
    expect(onRefresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(6_000);
    await flush();
    expect(onRefresh.mock.calls.map((c) => c[0])).toEqual(["fallback"]);
    // 첫 폴백 ≈15초 · 다음은 60초 뒤(≈75초)
    await vi.advanceTimersByTimeAsync(50_000);
    await flush();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    await flush();
    expect(onRefresh).toHaveBeenCalledTimes(2);
    entry.stop();
  });

  it("stop 뒤 폴백 타이머·재동기화 등록 해제", async () => {
    const { entry, onRefresh, last } = await setup();
    last()("SUBSCRIBED");
    await flush();
    entry.stop();
    onRefresh.mockClear();
    const { noteMessengerRealtimeResubscribed } = await import(
      "@/lib/community-messenger/realtime/messenger-realtime-resync"
    );
    noteMessengerRealtimeResubscribed();
    await vi.advanceTimersByTimeAsync(120_000);
    await flush();
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
