/**
 * CUT-R1 — open-room `global-messenger:bundle` must bind from listener registration
 * even when the auth-bridge `onReady` path never flips `roomBound` first.
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

describe("CUT-R1 open-room bundle subscription bind", () => {
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

  it("listener notify binds global-messenger:bundle even when auth-bridge onReady never fires", async () => {
    const { createGlobalMessengerRoomBundleEntry } = await import(
      "@/lib/community-messenger/realtime/global-messenger-room-bundle-channel"
    );
    const viewer = "viewer-cut-r1";
    const roomId = "c202326f-8109-4ce4-aa61-394f0a799e7d";
    const entry = createGlobalMessengerRoomBundleEntry({ viewerForChannel: viewer });
    expect(typeof entry.notifyRoomListenersChanged).toBe("function");

    const listenerRef = {
      current: {
        onRefresh: vi.fn(),
        onMessageEvent: vi.fn(),
      },
    };
    const key = roomId.toLowerCase();
    entry.listenersByRoom.set(key, new Set([listenerRef]));
    entry.notifyRoomListenersChanged!();

    await vi.advanceTimersByTimeAsync(80);
    await Promise.resolve();
    await Promise.resolve();

    expect(channelNames.some((n) => n === `global-messenger:bundle:${viewer}:0`)).toBe(true);
    expect(mockSb.channel).toHaveBeenCalledWith(`global-messenger:bundle:${viewer}:0`);

    entry.stop();
  });

  it("one room → one bundle channel; room switch rebinds filter set", async () => {
    const { createGlobalMessengerRoomBundleEntry, disposeGlobalMessengerRoomSchedulers } = await import(
      "@/lib/community-messenger/realtime/global-messenger-room-bundle-channel"
    );
    const viewer = "viewer-switch";
    const roomA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const roomB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const entry = createGlobalMessengerRoomBundleEntry({ viewerForChannel: viewer });
    const refA = { current: { onRefresh: vi.fn() } };
    const refB = { current: { onRefresh: vi.fn() } };

    entry.listenersByRoom.set(roomA, new Set([refA]));
    entry.notifyRoomListenersChanged!();
    await vi.advanceTimersByTimeAsync(80);
    await Promise.resolve();
    await Promise.resolve();
    expect(channelNames.filter((n) => n.startsWith(`global-messenger:bundle:${viewer}:`))).toHaveLength(1);

    const setA = entry.listenersByRoom.get(roomA)!;
    setA.delete(refA);
    entry.listenersByRoom.delete(roomA);
    disposeGlobalMessengerRoomSchedulers(entry, roomA);
    entry.listenersByRoom.set(roomB, new Set([refB]));
    entry.notifyRoomListenersChanged!();
    await vi.advanceTimersByTimeAsync(80);
    await Promise.resolve();
    await Promise.resolve();

    const bundleCalls = channelNames.filter((n) => n.startsWith(`global-messenger:bundle:${viewer}:`));
    expect(bundleCalls.length).toBeGreaterThanOrEqual(2);
    expect(entry.listenersByRoom.has(roomA)).toBe(false);
    expect(entry.listenersByRoom.has(roomB)).toBe(true);

    entry.stop();
  });

  it("unmount last listener → empty bind; remount → bind again", async () => {
    const { createGlobalMessengerRoomBundleEntry, disposeGlobalMessengerRoomSchedulers } = await import(
      "@/lib/community-messenger/realtime/global-messenger-room-bundle-channel"
    );
    const viewer = "viewer-remount";
    const roomId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const entry = createGlobalMessengerRoomBundleEntry({ viewerForChannel: viewer });
    const ref = { current: { onRefresh: vi.fn() } };

    entry.listenersByRoom.set(roomId, new Set([ref]));
    entry.notifyRoomListenersChanged!();
    await vi.advanceTimersByTimeAsync(80);
    await Promise.resolve();
    await Promise.resolve();
    const afterMount = channelNames.filter((n) => n === `global-messenger:bundle:${viewer}:0`).length;
    expect(afterMount).toBeGreaterThanOrEqual(1);

    entry.listenersByRoom.delete(roomId);
    disposeGlobalMessengerRoomSchedulers(entry, roomId);
    entry.notifyRoomListenersChanged!();
    await vi.advanceTimersByTimeAsync(80);
    await Promise.resolve();

    entry.listenersByRoom.set(roomId, new Set([ref]));
    entry.notifyRoomListenersChanged!();
    await vi.advanceTimersByTimeAsync(80);
    await Promise.resolve();
    await Promise.resolve();
    const afterRemount = channelNames.filter((n) => n === `global-messenger:bundle:${viewer}:0`).length;
    expect(afterRemount).toBeGreaterThan(afterMount);

    entry.stop();
  });

  it("wiring: notify no longer hard-requires roomBound before scheduling bind", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/realtime/global-messenger-room-bundle-channel.ts"),
      "utf8"
    );
    expect(src).toContain("CUT-R1");
    expect(src).toContain("bindGlobalRoomBundle()");
    expect(src).not.toMatch(/notifyRoomListenersChanged = \(\) => \{\s*if \(!roomBound \|\| cancelled\) return;/);
  });
});
