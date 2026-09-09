/**
 * CUT-R1 delivery — bundle call_logs must use Home-proven viewer filters,
 * not room_id=in.(…) (ACK ≠ delivery).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type OnCall = {
  event: string;
  opts: { event: string; schema: string; table: string; filter?: string };
  cb: (payload: { eventType?: string; new: unknown; old: unknown }) => void;
};

const channelNames: string[] = [];
const subscribeStatusCbs: Array<(status: string) => void> = [];
const onCalls: OnCall[] = [];

function makeChannel() {
  const ch = {
    on: vi.fn(function on(
      this: unknown,
      event: string,
      opts: OnCall["opts"],
      cb: OnCall["cb"]
    ) {
      onCalls.push({ event, opts, cb });
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

vi.mock("@/lib/community-messenger/realtime/community-messenger-realtime-auth-bridge", () => ({
  /** Hung onReady — notify path alone binds (CUT-R1). Avoids double-bind generation races in unit tests. */
  createRealtimeAuthBridge: () => () => {},
}));

vi.mock("@/lib/supabase/wait-for-realtime-auth", () => ({
  waitForSupabaseRealtimeAuth: vi.fn(async () => true),
  syncSupabaseRealtimeAuthFromSession: vi.fn(async () => true),
}));

vi.mock("@/lib/supabase/realtime-auth-events", () => ({
  subscribeSamarketRealtimeTokenRefreshed: () => () => {},
}));

describe("CUT-R1 bundle call_logs filter (Home-proven)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    channelNames.length = 0;
    subscribeStatusCbs.length = 0;
    onCalls.length = 0;
    mockSb.channel.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  async function bindOpenRoom(viewer: string, roomId: string) {
    const { createGlobalMessengerRoomBundleEntry } = await import(
      "@/lib/community-messenger/realtime/global-messenger-room-bundle-channel"
    );
    const entry = createGlobalMessengerRoomBundleEntry({ viewerForChannel: viewer });
    const onRefresh = vi.fn();
    const listenerRef = { current: { onRefresh } };
    const key = roomId.trim().toLowerCase();
    entry.listenersByRoom.set(key, new Set([listenerRef]));
    entry.notifyRoomListenersChanged?.();
    await vi.advanceTimersByTimeAsync(80);
    await Promise.resolve();
    await Promise.resolve();
    for (const cb of [...subscribeStatusCbs]) cb("SUBSCRIBED");
    onRefresh.mockClear();
    return { entry, onRefresh, listenerRef };
  }

  it("registers call_logs exactly twice: caller_user_id=eq + peer_user_id=eq (not room_id=in)", async () => {
    const viewer = "edc8c2f0-2673-4ca8-9d63-92a609d556f4";
    const roomId = "c202326f-8109-4ce4-aa61-394f0a799e7d";
    await bindOpenRoom(viewer, roomId);

    expect(channelNames).toEqual([`global-messenger:bundle:${viewer}:0`]);

    const callLogOns = onCalls.filter(
      (c) => c.event === "postgres_changes" && c.opts.table === "community_messenger_call_logs"
    );
    expect(callLogOns).toHaveLength(2);
    expect(callLogOns.map((c) => c.opts.filter).sort()).toEqual(
      [`caller_user_id=eq.${viewer}`, `peer_user_id=eq.${viewer}`].sort()
    );
    for (const c of callLogOns) {
      expect(c.opts.event).toBe("*");
      expect(c.opts.schema).toBe("public");
      expect(c.opts.filter).not.toMatch(/room_id=/);
    }

    // Source contract: Home uses the same identity filters
    const home = readFileSync(
      join(process.cwd(), "lib/community-messenger/realtime/community-messenger-home-realtime-channels.ts"),
      "utf8"
    );
    expect(home).toContain("caller_user_id=eq.");
    expect(home).toContain("peer_user_id=eq.");
  });

  it("matching open-room call_log schedules catch-up once; nonmatching room schedules zero", async () => {
    const viewer = "viewer-call-log-filter";
    const openRoom = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const otherRoom = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const { entry, onRefresh } = await bindOpenRoom(viewer, openRoom);

    const callLogOns = onCalls.filter(
      (c) => c.event === "postgres_changes" && c.opts.table === "community_messenger_call_logs"
    );
    expect(callLogOns).toHaveLength(2);
    const cb = callLogOns[0]!.cb;

    cb({
      eventType: "INSERT",
      new: { id: "log-1", room_id: openRoom, caller_user_id: viewer },
      old: null,
    });
    await vi.advanceTimersByTimeAsync(200);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    onRefresh.mockClear();
    cb({
      eventType: "INSERT",
      new: { id: "log-2", room_id: otherRoom, caller_user_id: viewer },
      old: null,
    });
    await vi.advanceTimersByTimeAsync(200);
    expect(onRefresh).not.toHaveBeenCalled();

    entry.stop();
  });

  it("room switch drops old room catch-up; unmount cleans up", async () => {
    const { disposeGlobalMessengerRoomSchedulers } = await import(
      "@/lib/community-messenger/realtime/global-messenger-room-bundle-channel"
    );
    const viewer = "viewer-switch";
    const roomA = "11111111-1111-1111-1111-111111111111";
    const roomB = "22222222-2222-2222-2222-222222222222";
    const { entry, onRefresh, listenerRef } = await bindOpenRoom(viewer, roomA);

    entry.listenersByRoom.delete(roomA.toLowerCase());
    disposeGlobalMessengerRoomSchedulers(entry, roomA.toLowerCase());
    entry.listenersByRoom.set(roomB.toLowerCase(), new Set([listenerRef]));
    onCalls.length = 0;
    channelNames.length = 0;
    subscribeStatusCbs.length = 0;
    entry.notifyRoomListenersChanged?.();
    await vi.advanceTimersByTimeAsync(80);
    await Promise.resolve();
    await Promise.resolve();
    for (const cb of [...subscribeStatusCbs]) cb("SUBSCRIBED");
    onRefresh.mockClear();

    const callLogOns = onCalls.filter(
      (c) => c.event === "postgres_changes" && c.opts.table === "community_messenger_call_logs"
    );
    expect(callLogOns).toHaveLength(2);

    callLogOns[0]!.cb({
      eventType: "INSERT",
      new: { id: "log-a", room_id: roomA, caller_user_id: viewer },
      old: null,
    });
    await vi.advanceTimersByTimeAsync(200);
    expect(onRefresh).not.toHaveBeenCalled();

    callLogOns[0]!.cb({
      eventType: "INSERT",
      new: { id: "log-b", room_id: roomB, caller_user_id: viewer },
      old: null,
    });
    await vi.advanceTimersByTimeAsync(200);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    entry.listenersByRoom.delete(roomB.toLowerCase());
    disposeGlobalMessengerRoomSchedulers(entry, roomB.toLowerCase());
    entry.notifyRoomListenersChanged?.();
    await vi.advanceTimersByTimeAsync(80);
    entry.stop();
  });
});
