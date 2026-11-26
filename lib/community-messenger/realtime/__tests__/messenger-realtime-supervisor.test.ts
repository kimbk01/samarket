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
  /** 소켓 사건 n번(2초 묶음보다 넓게 3초 간격) */
  const storm = (n: number, pick: () => Sub) => {
    for (let i = 0; i < n; i++) {
      if (i > 0) advance(3_000);
      const s = pick();
      if (s) s.onStatus?.("TIMED_OUT");
    }
  };
  const fail = (s: Sub, status = "TIMED_OUT") => s.onStatus?.(status);
  return { sup, subs, live, records, advance, args, fail, storm, setNow: (n: number) => (now = n) };
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
  it("60초 안 소켓 사건 6번 → 차단: 대상 전부 stop, 가입 0, 호출부에 CLOSED 알림", () => {
    const h = harness();
    for (const n of ["a", "b", "c"]) h.sup.supervise(h.args(n));
    h.storm(6, () => h.subs[0]!);
    expect(h.sup.state()).toBe("open");
    expect(h.live()).toHaveLength(0);
    expect(h.records).toContain("open");
  });
  it("독립 감사 F1: 소켓 1번 끊김 — 채널 8개가 같은 순간 CHANNEL_ERROR·CLOSED → 차단 안 함", () => {
    const h = harness();
    for (let i = 0; i < 8; i++) h.sup.supervise(h.args(`c${i}`));
    for (const s of h.subs) {
      s.onStatus?.("CHANNEL_ERROR");
      s.onStatus?.("CLOSED");
    }
    expect(h.sup.state()).toBe("closed");
    expect(h.live()).toHaveLength(8);
  });
  it("독립 감사 F4: 차단으로 멈춘 채널의 호출부는 CLOSED 를 받는다(거래 presence 「연결됨」 해제)", () => {
    const h = harness();
    const seen: string[] = [];
    h.sup.supervise(h.args("trade-chat-presence:r", (st) => seen.push(st)));
    h.sup.supervise(h.args("b"));
    h.subs[0]!.onStatus?.("SUBSCRIBED");
    h.storm(6, () => h.subs[1]!);
    expect(h.sup.state()).toBe("open");
    expect(seen[seen.length - 1]).toBe("CLOSED");
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
    h.storm(6, () => h.subs[0]!);
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
    h.storm(6, () => h.subs[0]!);
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
    let visible = true;
    const h = harness({ canProbe: () => visible });
    h.sup.supervise(h.args("a"));
    h.storm(6, () => h.subs[0]!);
    visible = false; // 차단 뒤 화면이 숨겨짐
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
    h.storm(6, () => h.subs[0]!);
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
    h.storm(6, () => h.subs[0]!);
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
  it("독립 감사 F2: 시험 중 시험 채널이 stop 되면 곧바로 다른 채널로 시험", () => {
    const h = harness();
    const meta = h.sup.supervise(h.args("community-messenger-home:meta:u"));
    h.sup.supervise(h.args("other"));
    h.storm(6, () => h.subs[0]!);
    h.advance(30_000);
    expect(h.sup.state()).toBe("half_open");
    meta.stop();
    expect(h.sup.state()).toBe("half_open");
    expect(h.live().map((s) => s.name)).toEqual(["other"]);
    h.live()[0]!.onStatus?.("SUBSCRIBED");
    expect(h.sup.state()).toBe("closed");
  });
  it("대기자는 시험이 실패해 다시 차단되는 동안 불리지 않고, 실제로 닫힐 때 1번", () => {
    const h = harness();
    h.sup.supervise(h.args("a"));
    h.storm(6, () => h.subs[0]!);
    const cb = vi.fn();
    h.sup.whenJoinAllowed(cb);
    h.advance(30_000);
    h.live()[0]!.onStatus?.("TIMED_OUT"); // 시험 실패 → 다시 차단
    h.advance(1_000);
    expect(cb).not.toHaveBeenCalled();
    h.advance(60_000);
    h.live()[0]!.onStatus?.("SUBSCRIBED");
    h.advance(1_000);
    expect(cb).toHaveBeenCalledTimes(1);
  });
  it("stop 한 채널은 다시 가입하지 않는다", () => {
    const h = harness();
    const handle = h.sup.supervise(h.args("a"));
    h.sup.supervise(h.args("b"));
    h.storm(6, () => h.subs[1]!);
    handle.stop();
    h.advance(30_000);
    h.live()[0]!.onStatus?.("SUBSCRIBED");
    h.advance(1_000);
    expect(h.live().map((s) => s.name)).toEqual(["b"]);
  });
});

describe("2차 감사 반영", () => {
  it("F-B: 시험은 성공하지만 재가입이 다시 거절되면 대기가 30→60→120→300 으로 늘어난다(5분 안정 전에는 처음으로 안 돌아감)", () => {
    const h = harness();
    for (let i = 0; i < 6; i++) h.sup.supervise(h.args(i === 0 ? "community-messenger-home:meta:u" : `c${i}`));
    const waits: number[] = [];
    let lastOpenAt = 0;
    const origRecord = h.records;
    void origRecord;
    for (let cycle = 0; cycle < 5; cycle++) {
      // 첫 차단은 6번, 시험 통과로 닫힌 뒤 관찰 기간에는 2번이면 다시 차단
      h.storm(cycle === 0 ? 6 : 2, () => h.live()[h.live().length - 1]!);
      expect(h.sup.state()).toBe("open");
      lastOpenAt = 0;
      let waited = 0;
      while (h.sup.state() === "open") {
        h.advance(1_000);
        waited += 1_000;
      }
      waits.push(waited);
      void lastOpenAt;
      h.live()[0]!.onStatus?.("SUBSCRIBED"); // 시험 성공 → 닫힘
      h.advance(2_000); // 나머지 재가입
    }
    expect(waits).toEqual([30_000, 60_000, 120_000, 300_000, 300_000]);
  });
  it("F-B: 닫힌 상태가 5분 이어지면 대기 단계가 처음(30초)으로", () => {
    const h = harness();
    h.sup.supervise(h.args("a"));
    h.storm(6, () => h.subs[0]!);
    h.advance(30_000);
    h.live()[0]!.onStatus?.("SUBSCRIBED");
    h.advance(300_000);
    h.storm(6, () => h.live()[0]!);
    let waited = 0;
    while (h.sup.state() === "open") {
      h.advance(1_000);
      waited += 1_000;
    }
    expect(waited).toBe(30_000);
  });
  it("F-C: 시험할 채널이 없으면 닫고 자체 루프 대기자를 깨운다", () => {
    const h = harness();
    const only = h.sup.supervise(h.args("a"));
    h.storm(6, () => h.subs[0]!);
    const cb = vi.fn();
    h.sup.whenJoinAllowed(cb);
    only.stop();
    h.advance(30_000);
    expect(h.sup.state()).toBe("closed");
    h.advance(1_000);
    expect(cb).toHaveBeenCalledTimes(1);
  });
  it("F-D: 이 실패로 차단되면 호출부가 마지막에 받는 상태는 CLOSED", () => {
    const h = harness();
    const seen: string[] = [];
    h.sup.supervise(h.args("a", (st) => seen.push(st)));
    h.storm(6, () => h.subs[0]!);
    expect(seen[seen.length - 1]).toBe("CLOSED");
  });
  it("F-E: 자체 루프 실패도 같은 창에 세고, 차단이 열리면 onOpen 으로 알린다", () => {
    const h = harness();
    h.sup.supervise(h.args("a"));
    const opened = vi.fn();
    h.sup.onOpen(opened);
    for (let i = 0; i < 6; i++) {
      if (i > 0) h.advance(3_000);
      h.sup.noteSelfLoopFailure();
    }
    expect(h.sup.state()).toBe("open");
    expect(opened).toHaveBeenCalledTimes(1);
    expect(h.live()).toHaveLength(0);
  });
});

describe("실기 T4 반영 — 오프라인·숨김 중 실패는 세지 않는다", () => {
  it("오프라인 동안 실패가 계속돼도 차단·쉼 없음, 온라인이 되면 채널 그대로", () => {
    let online = false;
    const h = harness({ canProbe: () => online });
    for (const n of ["community-messenger-home:meta:u", "bundle", "notifications", "unread", "friend"]) h.sup.supervise(h.args(n));
    for (let i = 0; i < 7; i++) {
      for (const s of h.live()) s.onStatus?.("CHANNEL_ERROR");
      h.advance(10_000);
    }
    expect(h.sup.state()).toBe("closed");
    expect(h.live()).toHaveLength(5);
    expect(h.records).not.toContain("open");
    expect(h.records).not.toContain("park");
    online = true;
    h.storm(6, () => h.live()[0]!);
    expect(h.sup.state()).toBe("open");
  });
});

describe("경계 상황", () => {
  it("쉬는 채널이 있을 때 차단 → 닫힐 때 쉬던 채널도 다시 가입", () => {
    const h = harness();
    h.sup.supervise(h.args("p"));
    h.sup.supervise(h.args("q"));
    for (let i = 0; i < 6; i++) {
      h.advance(61_000);
      h.fail(h.subs[0]!);
    }
    expect(h.live().map((x) => x.name)).toEqual(["q"]);
    h.storm(6, () => h.live()[0]!);
    h.advance(30_000);
    h.live()[0]!.onStatus?.("SUBSCRIBED");
    h.advance(1_000);
    expect(h.live().map((x) => x.name).sort()).toEqual(["p", "q"]);
  });
  it("시험 중 wake 는 아무것도 안 한다(중복 시험 없음)", () => {
    const h = harness();
    h.sup.supervise(h.args("a"));
    h.sup.supervise(h.args("b"));
    h.storm(6, () => h.subs[0]!);
    h.advance(30_000);
    expect(h.sup.state()).toBe("half_open");
    const n = h.subs.length;
    h.sup.wake();
    expect(h.subs.length).toBe(n);
  });
  it("재가입 타이머가 남은 채 다시 차단되면 남은 재가입은 취소", () => {
    const h = harness();
    for (let i = 0; i < 12; i++) h.sup.supervise(h.args(`ch${i}`));
    h.storm(6, () => h.subs[0]!);
    h.advance(30_000);
    const probe = h.live()[0]!;
    probe.onStatus?.("SUBSCRIBED"); // 닫힘 → 나머지 11개 300ms 간격(300~3300ms) 예약
    probe.onStatus?.("TIMED_OUT");
    h.advance(2_100);
    probe.onStatus?.("TIMED_OUT"); // 관찰 기간 2번 → 다시 차단(아직 4개는 예약만 된 상태)
    expect(h.sup.state()).toBe("open");
    const n = h.subs.length;
    expect(n).toBe(12 + 1 + 7); // 처음 12 + 시험 1 + 2.1초 안 재가입 7 — 나머지 4개는 예약만
    h.advance(5_000);
    expect(h.subs.length).toBe(n);
    expect(h.live()).toHaveLength(0);
  });
});

describe("11-26 재현 — 서버가 가입을 거절하는 4시간 (시험 1개는 통과, 나머지는 가입 10초 뒤 거절)", () => {
  it("가입 시도: 감독 없음(채널 6개 × 10초마다) 8,640 → 감독 수백 이하", () => {
    const h = harness();
    for (let i = 0; i < 6; i++) h.sup.supervise(h.args(i === 0 ? "community-messenger-home:meta:u" : `c${i}`));
    const FOUR_H = 4 * 60 * 60_000;
    const joinedAt = new Map<Sub, number>();
    let joinAttempts = 0;
    for (let t = 0; t < FOUR_H; t += 1_000) {
      for (const s of h.live()) {
        if (!joinedAt.has(s)) {
          joinedAt.set(s, t);
          joinAttempts += 1;
        }
        const since = t - joinedAt.get(s)!;
        if (h.sup.state() === "half_open") {
          if (since === 0) s.onStatus?.("SUBSCRIBED"); // 시험은 통과
          continue;
        }
        if (since > 0 && since % 10_000 === 0) {
          joinAttempts += 1; // 래퍼 재시도 1번 = 가입 1번
          s.onStatus?.("TIMED_OUT");
        }
      }
      h.advance(1_000);
    }
    const withoutSupervisor = 6 * (FOUR_H / 10_000);
    expect(withoutSupervisor).toBe(8_640);
    expect(joinAttempts).toBeLessThan(withoutSupervisor / 10);
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
