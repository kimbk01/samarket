/**
 * D1 R1 연결 감독 — 상태 전이·상한·통화 경계 (Owner 「개정안 승인」 2026-11-26)
 * 개정안: docs/audit/supabase-request-surge-2026-11-18/messenger-realtime-contract-revision-d1-d2-2026-11-26.md §3 R1 · §7
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  RT_SUPERVISOR_OPEN_DELAYS_MS,
  RT_SUPERVISOR_PROBE_TIMEOUT_MS,
  createMessengerRealtimeSupervisor,
  type RtSupervisorDeps,
} from "@/lib/community-messenger/realtime/messenger-realtime-supervisor";
import type { SubscribeWithRetryArgs } from "@/lib/community-messenger/realtime/cm-rt-channel-registry";

type Sub = { name: string; onStatus?: (s: string) => void; stopped: boolean };

function harness(opts: { canProbe?: () => boolean } = {}) {
  let now = 0;
  const timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let nextId = 1;
  const subs: Sub[] = [];
  const records: string[] = [];
  const deps: RtSupervisorDeps = {
    subscribe: (args) => {
      const s: Sub = { name: args.name, onStatus: args.onStatus, stopped: false };
      subs.push(s);
      return {
        channel: { topic: args.name } as never,
        stop: () => {
          s.stopped = true;
        },
        markSignal: () => undefined,
      };
    },
    now: () => now,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimer: (t) => {
      const i = timers.findIndex((x) => x.id === t);
      if (i >= 0) timers.splice(i, 1);
    },
    canProbe: opts.canProbe ?? (() => true),
    record: (e) => {
      records.push(e);
    },
  };
  const sup = createMessengerRealtimeSupervisor(deps);
  const advance = (ms: number) => {
    const target = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at > target) break;
      timers.shift();
      now = t.at;
      t.fn();
    }
    now = target;
  };
  const args = (name: string, onStatus?: (s: string) => void): SubscribeWithRetryArgs =>
    ({ sb: {} as never, name, scope: name, build: (c) => c, isCancelled: () => false, onStatus }) as SubscribeWithRetryArgs;
  const live = () => subs.filter((s) => !s.stopped);
  const fail = (s: Sub, status = "TIMED_OUT") => s.onStatus?.(status);
  return { sup, subs, live, records, advance, args, fail, setNow: (n: number) => (now = n) };
}

describe("정상", () => {
  it("등록 즉시 가입, 호출부 onStatus 그대로 전달", () => {
    const h = harness();
    const seen: string[] = [];
    h.sup.supervise(h.args("community-messenger-home:meta:u", (s) => seen.push(s)));
    expect(h.live()).toHaveLength(1);
    h.live()[0]!.onStatus?.("SUBSCRIBED");
    expect(seen).toEqual(["SUBSCRIBED"]);
    expect(h.sup.state()).toBe("closed");
  });
  it("CLOSED 는 실패로 세지 않는다(래퍼 내부 재생성에서도 온다)", () => {
    const h = harness();
    h.sup.supervise(h.args("a"));
    for (let i = 0; i < 30; i++) h.fail(h.subs[0]!, "CLOSED");
    expect(h.sup.state()).toBe("closed");
  });
});

describe("차단", () => {
  it("60초 안 실패 6회 → 차단: 대상 전부 stop, 가입 0", () => {
    const h = harness();
    for (const n of ["a", "b", "c"]) h.sup.supervise(h.args(n));
    for (let i = 0; i < 6; i++) h.fail(h.subs[i % 3]!);
    expect(h.sup.state()).toBe("open");
    expect(h.live()).toHaveLength(0);
    expect(h.records).toContain("open");
  });
  it("5분 안 20회(분당 4회 꾸준히)도 차단", () => {
    const h = harness();
    h.sup.supervise(h.args("a"));
    h.sup.supervise(h.args("b"));
    for (let i = 0; i < 20; i++) {
      h.advance(14_000);
      h.fail(h.subs[h.subs.length - 1 - (i % 2)]!);
    }
    expect(h.sup.state()).toBe("open");
  });
  it("대기 30초 → 시험 1개 → 성공하면 닫힘, 나머지 300ms 간격", () => {
    const h = harness();
    h.sup.supervise(h.args("x"));
    h.sup.supervise(h.args("community-messenger-home:meta:u"));
    h.sup.supervise(h.args("y"));
    for (let i = 0; i < 6; i++) h.fail(h.subs[0]!);
    expect(h.live()).toHaveLength(0);
    h.advance(RT_SUPERVISOR_OPEN_DELAYS_MS[0] - 1);
    expect(h.live()).toHaveLength(0);
    h.advance(1);
    expect(h.sup.state()).toBe("half_open");
    expect(h.live().map((s) => s.name)).toEqual(["community-messenger-home:meta:u"]);
    h.live()[0]!.onStatus?.("SUBSCRIBED");
    expect(h.sup.state()).toBe("closed");
    h.advance(300);
    expect(h.live()).toHaveLength(2);
    h.advance(300);
    expect(h.live()).toHaveLength(3);
  });
  it("시험 실패·시간초과 → 대기 단계 증가 30→60→120→300→300", () => {
    const h = harness();
    h.sup.supervise(h.args("a"));
    for (let i = 0; i < 6; i++) h.fail(h.subs[0]!);
    for (const d of [30_000, 60_000, 120_000, 300_000, 300_000]) {
      h.advance(d - 1);
      expect(h.sup.state()).toBe("open");
      h.advance(1);
      expect(h.sup.state()).toBe("half_open");
      h.advance(RT_SUPERVISOR_PROBE_TIMEOUT_MS);
      expect(h.sup.state()).toBe("open");
    }
  });
  it("화면 숨김이면 대기가 끝나도 시험하지 않고, wake 때 시험", () => {
    let visible = false;
    const h = harness({ canProbe: () => visible });
    h.sup.supervise(h.args("a"));
    for (let i = 0; i < 6; i++) h.fail(h.subs[0]!);
    h.advance(10 * 60_000);
    expect(h.sup.state()).toBe("open");
    expect(h.live()).toHaveLength(0);
    visible = true;
    h.sup.wake();
    expect(h.sup.state()).toBe("half_open");
    expect(h.live()).toHaveLength(1);
  });
  it("차단 중 새로 등록한 채널은 가입하지 않고, 닫힐 때 가입", () => {
    const h = harness();
    h.sup.supervise(h.args("a"));
    for (let i = 0; i < 6; i++) h.fail(h.subs[0]!);
    h.sup.supervise(h.args("late"));
    expect(h.live()).toHaveLength(0);
    h.advance(30_000);
    h.live()[0]!.onStatus?.("SUBSCRIBED");
    h.advance(600);
    expect(h.live().map((s) => s.name).sort()).toEqual(["a", "late"]);
  });
});

describe("채널별 쉼", () => {
  it("한 채널 연속 6회 실패(차단 기준 미만 속도) → 그 채널만 쉼, wake 때 다시 가입", () => {
    const h = harness();
    h.sup.supervise(h.args("a"));
    h.sup.supervise(h.args("b"));
    for (let i = 0; i < 6; i++) {
      h.advance(61_000);
      h.fail(h.subs[0]!);
    }
    expect(h.sup.state()).toBe("closed");
    expect(h.live().map((s) => s.name)).toEqual(["b"]);
    expect(h.records).toContain("park");
    h.sup.wake();
    expect(h.live().map((s) => s.name).sort()).toEqual(["a", "b"]);
  });
  it("성공하면 연속 실패 수가 0으로", () => {
    const h = harness();
    h.sup.supervise(h.args("a"));
    for (let i = 0; i < 5; i++) {
      h.advance(61_000);
      h.fail(h.subs[0]!);
    }
    h.subs[0]!.onStatus?.("SUBSCRIBED");
    h.advance(61_000);
    h.fail(h.subs[0]!);
    expect(h.live()).toHaveLength(1);
  });
});

describe("자체 루프 대기·해제", () => {
  it("whenJoinAllowed: 닫힘 때 1번, 해제하면 안 불림", () => {
    const h = harness();
    h.sup.supervise(h.args("a"));
    for (let i = 0; i < 6; i++) h.fail(h.subs[0]!);
    const cb = vi.fn();
    const cb2 = vi.fn();
    h.sup.whenJoinAllowed(cb);
    const off = h.sup.whenJoinAllowed(cb2);
    off();
    h.advance(30_000);
    h.live()[0]!.onStatus?.("SUBSCRIBED");
    h.advance(1_000);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb2).not.toHaveBeenCalled();
  });
  it("stop 한 채널은 다시 가입하지 않는다", () => {
    const h = harness();
    const handle = h.sup.supervise(h.args("a"));
    h.sup.supervise(h.args("b"));
    for (let i = 0; i < 6; i++) h.fail(h.subs[1]!);
    handle.stop();
    h.advance(30_000);
    h.live()[0]!.onStatus?.("SUBSCRIBED");
    h.advance(1_000);
    expect(h.live().map((s) => s.name)).toEqual(["b"]);
  });
});

describe("11-26 재현 — 서버가 가입을 계속 거절하는 4시간", () => {
  it("감독 없음이면 채널 5개 × 10초마다 재가입 = 7,200회 / 감독이면 시험 가입만(100회 미만)", () => {
    const h = harness();
    for (const n of ["community-messenger-home:meta:u", "bundle", "notifications", "unread", "friend"]) h.sup.supervise(h.args(n));
    const FOUR_H = 4 * 60 * 60_000;
    let joinAttempts = 0;
    // 살아 있는 채널은 10초마다 가입 시도 → 거절(TIMED_OUT). 래퍼(subscribeWithRetry) 재시도를 흉내.
    for (let t = 0; t < FOUR_H; t += 10_000) {
      for (const s of h.live()) {
        joinAttempts += 1;
        h.fail(s);
      }
      h.advance(10_000);
    }
    expect(5 * (FOUR_H / 10_000)).toBe(7_200);
    expect(joinAttempts).toBeLessThan(100);
    expect(h.sup.state()).not.toBe("closed");
  });
});

describe("통화 경계 (통화 변경 규정)", () => {
  const root = process.cwd();
  const read = (p: string) => readFileSync(path.join(root, p), "utf8");
  it("통화 채널은 감독을 쓰지 않는다", () => {
    for (const f of [
      "components/community-messenger/CommunityMessengerCallClient.tsx",
      "lib/community-messenger/call-v4/call-v4-incoming-realtime-feed.ts",
      "lib/community-messenger/realtime/cm-incoming-call-realtime-holder.ts",
      "lib/community-messenger/call-history/use-community-call-history-realtime-sync.ts",
      "lib/community-messenger/use-community-messenger-group-call.ts",
    ]) {
      const src = read(f);
      expect(src).not.toContain("superviseMessengerChannel");
      expect(src).toContain("subscribeWithRetry(");
    }
  });
  it("대상 채널은 감독 입구만 쓴다", () => {
    for (const f of [
      "hooks/useSupabaseNotificationsRealtime.ts",
      "lib/chats/use-post-seller-listing-realtime.ts",
      "lib/chats/use-trade-chat-room-presence.ts",
      "lib/chats/use-trade-post-listing-broadcast.ts",
      "lib/community-messenger/home/use-community-messenger-trade-post-listing-realtime.ts",
      "lib/community-messenger/notifications/use-cm-participants-hub-sync.ts",
      "lib/community-messenger/realtime/community-messenger-home-realtime-channels.ts",
      "lib/community-messenger/realtime/global-messenger-room-bundle-channel.ts",
      "lib/community-messenger/realtime/use-global-friend-request-feed.ts",
      "lib/trade/listing-visibility/listing-visibility-client.ts",
    ]) {
      const src = read(f);
      expect(src).toContain("superviseMessengerChannel(");
      expect(src).not.toMatch(/\bsubscribeWithRetry\(/);
    }
  });
});
