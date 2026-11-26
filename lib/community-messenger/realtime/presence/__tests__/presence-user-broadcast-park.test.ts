/**
 * D1 R1(2026-11-26) — presence 사용자 토픽 자체 루프 상한·감독 연동.
 * 2차 감사 F-A: 가입 안 된 채널을 놓으면 realtime-js 가 CLOSED 를 동기로 다시 부른다 → 재귀 없이 멈춰야 한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StatusCb = (status: string, err?: Error) => void;
type FakeCh = { topic: string; state: string; statusCb: StatusCb | null };
const created: FakeCh[] = [];
/** 2차 감사 F-A — 놓기 1번이 동기 CLOSED 로 다시 놓기를 부르는 재귀를 센다 */
const removeCalls = { count: 0 };
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
  removeChannel: (ch: FakeCh) => {
    removeCalls.count += 1;
    const wasJoined = ch.state === "joined";
    ch.state = "closed";
    if (!wasJoined) ch.statusCb?.("CLOSED");
    return Promise.resolve("ok");
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

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

async function failRepeatedly(times: number) {
  for (let i = 0; i < times; i++) {
    const ch = created[created.length - 1]!;
    ch.state = "errored";
    ch.statusCb?.("CHANNEL_ERROR");
    await vi.advanceTimersByTimeAsync(10_001);
    await flush();
  }
}

describe("presence 사용자 토픽 — 자체 루프 상한", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    created.length = 0;
    removeCalls.count = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("감독 켜짐: 반복 실패에도 재귀 없이 멈추고, 끄기보다 가입이 적다", async () => {
    const { acquireCommunityMessengerPresenceUserBroadcast } = await import(
      "@/lib/community-messenger/realtime/presence/presence-user-broadcast-client"
    );
    const release = acquireCommunityMessengerPresenceUserBroadcast("peer-1");
    await flush();
    await failRepeatedly(12);
    // 재귀면 놓기가 수천 번(스택 끝까지) — 채널 수만큼만이어야 한다
    expect(removeCalls.count).toBeLessThanOrEqual(created.length);
    expect(created.length).toBeLessThan(13);
    release();
  });

  it("끄기 스위치(=0): 지금처럼 실패마다 재가입", async () => {
    vi.stubEnv("NEXT_PUBLIC_MESSENGER_RT_SUPERVISOR", "0");
    const { acquireCommunityMessengerPresenceUserBroadcast } = await import(
      "@/lib/community-messenger/realtime/presence/presence-user-broadcast-client"
    );
    const release = acquireCommunityMessengerPresenceUserBroadcast("peer-1");
    await flush();
    await failRepeatedly(12);
    expect(created).toHaveLength(13);
    release();
  });
});
