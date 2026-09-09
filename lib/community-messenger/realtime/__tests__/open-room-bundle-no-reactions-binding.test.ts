/**
 * CUT-R1 delivery — open-room bundle must NOT register
 * community_messenger_message_reactions (invalid Realtime → channel-wide silent).
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
  createRealtimeAuthBridge: () => () => {},
}));

vi.mock("@/lib/supabase/wait-for-realtime-auth", () => ({
  waitForSupabaseRealtimeAuth: vi.fn(async () => true),
  syncSupabaseRealtimeAuthFromSession: vi.fn(async () => true),
}));

vi.mock("@/lib/supabase/realtime-auth-events", () => ({
  subscribeSamarketRealtimeTokenRefreshed: () => () => {},
}));

describe("CUT-R1 remove invalid reactions binding", () => {
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
    entry.listenersByRoom.set(roomId.trim().toLowerCase(), new Set([listenerRef]));
    entry.notifyRoomListenersChanged?.();
    await vi.advanceTimersByTimeAsync(80);
    await Promise.resolve();
    await Promise.resolve();
    for (const cb of [...subscribeStatusCbs]) cb("SUBSCRIBED");
    onRefresh.mockClear();
    return { entry, onRefresh, listenerRef };
  }

  it("registers exactly 5 postgres_changes; no message_reactions; no call_logs", async () => {
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

    expect(pg.some((c) => c.opts.table === "community_messenger_messages")).toBe(true);
    expect(pg.some((c) => c.opts.table === "community_messenger_rooms")).toBe(true);
    expect(pg.some((c) => c.opts.table === "community_messenger_call_sessions")).toBe(true);
    expect(pg.some((c) => c.opts.table === "community_messenger_call_session_participants")).toBe(
      true
    );

    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/realtime/global-messenger-room-bundle-channel.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/table:\s*"community_messenger_message_reactions"/);
    expect(src).not.toMatch(/table:\s*"community_messenger_call_logs"/);
  });
});
