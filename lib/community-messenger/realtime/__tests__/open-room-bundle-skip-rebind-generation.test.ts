/**
 * 방 묶음 — 같은 방 목록 재바인드(건너뜀)는 세대 번호를 올리지 않는다.
 * 결함(2026-11-27 iPhone 실기): 건너뜀이 세대를 먼저 올려 살아 있는 채널이 옛 세대가 됨 →
 * SUBSCRIBED 무시(끊김 시계 안 풀림 → 60초 fallback 영원히) · DB 이벤트(메시지·읽음·방·통화 세션) 버림.
 * 설계 docs/audit/supabase-request-surge-2026-11-18/rt-bundle-gen-skip-and-unsupervised-channels-design-2026-11-27.md §2
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const channelNames: string[] = [];
const pgHandlers: Array<{ table: string; cb: (p: unknown) => void }> = [];
const subscribeStatusCbs: Array<(status: string) => void> = [];

function makeChannel() {
  const ch = {
    on: vi.fn(function on(this: unknown, _type: string, filter: { table?: string }, cb: (p: unknown) => void) {
      if (filter?.table) pgHandlers.push({ table: filter.table, cb });
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

describe("방 묶음: 같은 방 목록 재바인드(건너뜀)는 세대를 올리지 않는다 (2026-11-27 iPhone 실기 결함)", () => {
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

  it("가입 정상 + 같은 목록 notify 1번 더 → 180초 동안 fallback 0번", async () => {
    const { createGlobalMessengerRoomBundleEntry } = await import(
      "@/lib/community-messenger/realtime/global-messenger-room-bundle-channel"
    );
    const entry = createGlobalMessengerRoomBundleEntry({ viewerForChannel: "viewer-repro" });
    const onRefresh = vi.fn();
    entry.listenersByRoom.set("cccccccc-cccc-cccc-cccc-cccccccccccc", new Set([{ current: { onRefresh } }]));
    entry.notifyRoomListenersChanged!();
    await vi.advanceTimersByTimeAsync(80);
    await flush();
    const first = subscribeStatusCbs[subscribeStatusCbs.length - 1]!;
    // 같은 목록으로 한 번 더(다른 화면이 같은 방 listener 를 다시 등록하는 경우)
    entry.notifyRoomListenersChanged!();
    await vi.advanceTimersByTimeAsync(80);
    await flush();
    expect(channelNames.length).toBe(1);
    first("SUBSCRIBED");
    await flush();
    onRefresh.mockClear();
    await vi.advanceTimersByTimeAsync(180_000);
    await flush();
    const calls = onRefresh.mock.calls.map((c) => c[0]);
    expect(calls).toEqual([]);
    entry.stop();
  });

  it("건너뜀 뒤에도 새 메시지 DB 이벤트가 방 listener 에 닿는다", async () => {
    pgHandlers.length = 0;
    const { createGlobalMessengerRoomBundleEntry } = await import(
      "@/lib/community-messenger/realtime/global-messenger-room-bundle-channel"
    );
    const entry = createGlobalMessengerRoomBundleEntry({ viewerForChannel: "viewer-repro2" });
    const onRefresh = vi.fn();
    const onMessageInsert = vi.fn();
    const rid = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    entry.listenersByRoom.set(rid, new Set([{ current: { onRefresh, onMessageInsert, onMessage: onMessageInsert, onMessageEvent: onMessageInsert } } as never]));
    entry.notifyRoomListenersChanged!();
    await vi.advanceTimersByTimeAsync(80);
    await flush();
    subscribeStatusCbs[subscribeStatusCbs.length - 1]!("SUBSCRIBED");
    await flush();
    const fire = async (label: string) => {
      const before = onRefresh.mock.calls.length + onMessageInsert.mock.calls.length;
      for (const h of pgHandlers.filter((x) => x.table === "community_messenger_messages")) {
        h.cb({ eventType: "INSERT", new: { id: "m-" + label, room_id: rid, sender_id: "peer", content: "x", message_type: "text", created_at: new Date().toISOString() }, old: {} });
      }
      await vi.advanceTimersByTimeAsync(2_000);
      await flush();
      return onRefresh.mock.calls.length + onMessageInsert.mock.calls.length - before;
    };
    const beforeSkip = await fire("a");
    entry.notifyRoomListenersChanged!();
    await vi.advanceTimersByTimeAsync(80);
    await flush();
    const afterSkip = await fire("b");
    expect(afterSkip).toBe(beforeSkip);
    entry.stop();
  });
});
