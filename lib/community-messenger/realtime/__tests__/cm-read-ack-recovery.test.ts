import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** PR #433 검토 2 — 토큰 갱신 재구독 삭제 뒤 서버 CLOSED·가입 실패 시 같은 세대만 백오프 재구독 */
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
  /**
   * realtime-js 2.99.2 와 같게: 가입 안 된(errored·closed) 채널을 놓으면 `unsubscribe` 가 `leavePush.trigger('ok')` 로
   * 그 자리에서 `CLOSED` 를 다시 부른다(2차 감사 F-A — 동기 재귀 재현). 가입된 채널은 비동기.
   */
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

const ROOM = "c202326f-8109-4ce4-aa61-394f0a799e7d";

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("cm-read-ack recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    created.length = 0;
    removeCalls.count = 0;
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

  /** D1 R1(2026-11-26) — 자체 루프 상한: 연속 6번 실패 뒤 멈추고 채널을 놓는다 */
  async function failRepeatedly(times: number) {
    for (let i = 0; i < times; i++) {
      const ch = created[created.length - 1]!;
      ch.state = "closed";
      ch.statusCb?.("CHANNEL_ERROR");
      await vi.advanceTimersByTimeAsync(10_001);
      await flush();
    }
  }

  it("연속 실패 상한: 6번 재가입 뒤 더 가입하지 않는다(감독 켜짐)", async () => {
    const { acquireCommunityMessengerReadAckBroadcast } = await import(
      "@/lib/community-messenger/realtime/cm-read-ack-broadcast-client"
    );
    const release = acquireCommunityMessengerReadAckBroadcast("viewer", ROOM);
    await flush();
    // 놓을 때 동기 CLOSED 가 다시 와도(가짜 sb = realtime-js 와 같음) 재귀 없이 멈춰야 한다(2차 감사 F-A)
    await failRepeatedly(12);
    // 재귀면 놓기가 수천 번(스택 끝까지) — 채널 수만큼만이어야 한다
    expect(removeCalls.count).toBeLessThanOrEqual(created.length);
    // 실패가 감독 창에 들어가 차단이 열리고(F-E) 대기 → 시험 → 닫힘에서 1번씩만 다시 가입 — 끄기(13)보다 적다
    expect(created.length).toBeLessThan(13);
    const before = created.length;
    // 실패가 더 없는 동안(차단 대기 중) 새 가입 없음
    await vi.advanceTimersByTimeAsync(20_000);
    await flush();
    expect(created.length).toBeLessThanOrEqual(before + 1);
    release();
  });

  it("끄기 스위치(NEXT_PUBLIC_MESSENGER_RT_SUPERVISOR=0) → 지금처럼 계속 재가입(상한 없음)", async () => {
    vi.stubEnv("NEXT_PUBLIC_MESSENGER_RT_SUPERVISOR", "0");
    try {
      const { acquireCommunityMessengerReadAckBroadcast } = await import(
        "@/lib/community-messenger/realtime/cm-read-ack-broadcast-client"
      );
      const release = acquireCommunityMessengerReadAckBroadcast("viewer", ROOM);
      await flush();
      await failRepeatedly(12);
      expect(created).toHaveLength(13);
      release();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
