/**
 * CUT-R1 ownership — Bundle must NOT register community_messenger_call_logs.
 * Home meta is sole postgres_changes owner; open-room catch-up via
 * notifyOpenRoomTerminalCatchUpFromCallLog (in-process fanout).
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

describe("CUT-R1 call_logs single-owner (Home → open-room fanout)", () => {
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

  it("bundle registers zero call_logs bindings; Home remains sole owner in source", async () => {
    const viewer = "edc8c2f0-2673-4ca8-9d63-92a609d556f4";
    const roomId = "c202326f-8109-4ce4-aa61-394f0a799e7d";
    await bindOpenRoom(viewer, roomId);

    expect(channelNames).toEqual([`global-messenger:bundle:${viewer}:0`]);

    const callLogOns = onCalls.filter(
      (c) => c.event === "postgres_changes" && c.opts.table === "community_messenger_call_logs"
    );
    expect(callLogOns).toHaveLength(0);

    const home = readFileSync(
      join(process.cwd(), "lib/community-messenger/realtime/community-messenger-home-realtime-channels.ts"),
      "utf8"
    );
    expect(home).toContain("caller_user_id=eq.");
    expect(home).toContain("peer_user_id=eq.");
    expect(home).toContain("notifyOpenRoomTerminalCatchUpFromCallLog");

    const bundle = readFileSync(
      join(process.cwd(), "lib/community-messenger/realtime/global-messenger-room-bundle-channel.ts"),
      "utf8"
    );
    expect(bundle).toContain("notifyOpenRoomTerminalCatchUpFromCallLog");
    expect(bundle).not.toMatch(/table:\s*"community_messenger_call_logs"/);
  });

  it("matching open-room call_log fanout schedules catch-up once; nonmatching room schedules zero", async () => {
    const {
      createGlobalMessengerRoomBundleEntry,
      notifyOpenRoomTerminalCatchUpFromCallLog,
    } = await import("@/lib/community-messenger/realtime/global-messenger-room-bundle-channel");

    const viewer = "viewer-call-log-filter";
    const openRoom = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const otherRoom = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const entry = createGlobalMessengerRoomBundleEntry({ viewerForChannel: viewer });
    const onRefresh = vi.fn();
    const listenerRef = { current: { onRefresh } };
    entry.listenersByRoom.set(openRoom.toLowerCase(), new Set([listenerRef]));

    notifyOpenRoomTerminalCatchUpFromCallLog(viewer, openRoom);
    await vi.advanceTimersByTimeAsync(200);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    onRefresh.mockClear();
    notifyOpenRoomTerminalCatchUpFromCallLog(viewer, otherRoom);
    await vi.advanceTimersByTimeAsync(200);
    expect(onRefresh).not.toHaveBeenCalled();

    entry.stop();
  });

  it("room switch drops old room catch-up; unmount cleans fanout registry", async () => {
    const {
      createGlobalMessengerRoomBundleEntry,
      disposeGlobalMessengerRoomSchedulers,
      notifyOpenRoomTerminalCatchUpFromCallLog,
    } = await import("@/lib/community-messenger/realtime/global-messenger-room-bundle-channel");

    const viewer = "viewer-switch";
    const roomA = "11111111-1111-1111-1111-111111111111";
    const roomB = "22222222-2222-2222-2222-222222222222";
    const entry = createGlobalMessengerRoomBundleEntry({ viewerForChannel: viewer });
    const onRefresh = vi.fn();
    const listenerRef = { current: { onRefresh } };
    entry.listenersByRoom.set(roomA.toLowerCase(), new Set([listenerRef]));

    entry.listenersByRoom.delete(roomA.toLowerCase());
    disposeGlobalMessengerRoomSchedulers(entry, roomA.toLowerCase());
    entry.listenersByRoom.set(roomB.toLowerCase(), new Set([listenerRef]));
    onRefresh.mockClear();

    notifyOpenRoomTerminalCatchUpFromCallLog(viewer, roomA);
    await vi.advanceTimersByTimeAsync(200);
    expect(onRefresh).not.toHaveBeenCalled();

    notifyOpenRoomTerminalCatchUpFromCallLog(viewer, roomB);
    await vi.advanceTimersByTimeAsync(200);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    entry.listenersByRoom.delete(roomB.toLowerCase());
    disposeGlobalMessengerRoomSchedulers(entry, roomB.toLowerCase());
    entry.stop();

    onRefresh.mockClear();
    notifyOpenRoomTerminalCatchUpFromCallLog(viewer, roomB);
    await vi.advanceTimersByTimeAsync(200);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("message/room/session Bundle bindings remain; reactions stay removed", async () => {
    const viewer = "edc8c2f0-2673-4ca8-9d63-92a609d556f4";
    const roomId = "c202326f-8109-4ce4-aa61-394f0a799e7d";
    await bindOpenRoom(viewer, roomId);

    const pg = onCalls.filter((c) => c.event === "postgres_changes");
    expect(pg).toHaveLength(5);
    expect(pg.map((c) => c.opts.table).sort()).toEqual(
      [
        "community_messenger_call_session_participants",
        "community_messenger_call_sessions",
        "community_messenger_messages",
        "community_messenger_participants",
        "community_messenger_rooms",
      ].sort()
    );
    expect(pg.some((c) => c.opts.table === "community_messenger_message_reactions")).toBe(false);
    expect(pg.some((c) => c.opts.table === "community_messenger_call_logs")).toBe(false);
  });
});
