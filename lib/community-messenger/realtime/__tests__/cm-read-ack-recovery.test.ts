import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** PR #433 검토 2 — 토큰 갱신 재구독 삭제 뒤 서버 CLOSED·가입 실패 시 같은 세대만 백오프 재구독 */
type StatusCb = (status: string, err?: Error) => void;
type FakeCh = { topic: string; state: string; statusCb: StatusCb | null };

const created: FakeCh[] = [];
const fakeSb = {
  realtime: { accessTokenValue: "tok" },
  channel(name: string) {
    const ch: FakeCh = { topic: `realtime:${name}`, state: "joining", statusCb: null };
    created.push(ch);
    const api = {
      on: () => api,
      subscribe: (cb: StatusCb) => {
        ch.statusCb = cb;
        return ch;
      },
    };
    return api;
  },
  removeChannel: async (ch: FakeCh) => {
    ch.state = "closed";
    return "ok";
  },
  getChannels: () => [] as FakeCh[],
};

vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: () => fakeSb }));
vi.mock("@/lib/community-messenger/realtime/community-messenger-realtime-auth-bridge", () => ({
  createRealtimeAuthBridge: (args: { onReady: () => void }) => {
    args.onReady();
    return () => undefined;
  },
}));
vi.mock("@/lib/supabase/wait-for-realtime-auth", () => ({
  syncSupabaseRealtimeAuthFromSession: async () => true,
  waitForSupabaseRealtimeAuth: async () => true,
}));

const ROOM = "c202326f-8109-4ce4-aa61-394f0a799e7d";

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("cm-read-ack recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    created.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("backoff steps 1s → 2s → 5s → 10s cap", async () => {
    const { readAckResubscribeDelayMs } = await import("@/lib/community-messenger/realtime/cm-read-ack-broadcast-client");
    expect([0, 1, 2, 3, 9].map(readAckResubscribeDelayMs)).toEqual([1000, 2000, 5000, 10000, 10000]);
  });

  it("server CLOSED on the live channel → resubscribes after backoff", async () => {
    const { acquireCommunityMessengerReadAckBroadcast } = await import(
      "@/lib/community-messenger/realtime/cm-read-ack-broadcast-client"
    );
    const release = acquireCommunityMessengerReadAckBroadcast("viewer", ROOM);
    await flush();
    expect(created).toHaveLength(1);
    created[0]!.state = "closed";
    created[0]!.statusCb?.("CLOSED");
    await vi.advanceTimersByTimeAsync(999);
    expect(created).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2);
    await flush();
    expect(created).toHaveLength(2);
    release();
  });

  it("recovered by realtime-js rejoin (joined) → no resubscribe; release → no resubscribe", async () => {
    const { acquireCommunityMessengerReadAckBroadcast } = await import(
      "@/lib/community-messenger/realtime/cm-read-ack-broadcast-client"
    );
    const release = acquireCommunityMessengerReadAckBroadcast("viewer", ROOM);
    await flush();
    created[0]!.statusCb?.("CHANNEL_ERROR");
    created[0]!.state = "joined";
    await vi.advanceTimersByTimeAsync(1500);
    await flush();
    expect(created).toHaveLength(1);

    release();
    /** 우리가 제거한 채널의 CLOSED 는 무시 */
    created[0]!.statusCb?.("CLOSED");
    await vi.advanceTimersByTimeAsync(20_000);
    await flush();
    expect(created).toHaveLength(1);
  });
});
