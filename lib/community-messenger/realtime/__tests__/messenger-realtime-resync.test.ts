/**
 * D2 R2 — 재연결 1번 = 재동기화 1번 (Owner 「개정안 승인」 2026-11-26)
 */
import { describe, expect, it, vi } from "vitest";
import {
  MESSENGER_RESYNC_ALL_LIVE_MAX_WAIT_MS,
  MESSENGER_RESYNC_MAX_WAIT_MS,
  MESSENGER_RESYNC_QUIET_MS,
  createMessengerResyncCoordinator,
} from "@/lib/community-messenger/realtime/messenger-realtime-resync";

function harness(allLiveMode = false) {
  let now = 0;
  let live = false;
  const liveListeners = new Set<() => void>();
  const timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let id = 1;
  const c = createMessengerResyncCoordinator({
    now: () => now,
    setTimer: (fn, ms) => {
      const t = { at: now + ms, fn, id: id++ };
      timers.push(t);
      return t.id;
    },
    clearTimer: (x) => {
      const i = timers.findIndex((t) => t.id === x);
      if (i >= 0) timers.splice(i, 1);
    },
    allLive: allLiveMode
      ? {
          isAllLive: () => live,
          onAllLive: (cb) => {
            liveListeners.add(cb);
            return () => {
              liveListeners.delete(cb);
            };
          },
        }
      : null,
  });
  const setLive = (v: boolean) => {
    live = v;
    if (v) for (const cb of [...liveListeners]) cb();
  };
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
  return { c, advance, setLive, liveListenerCount: () => liveListeners.size, timerCount: () => timers.length };
}

describe("재동기화 묶음", () => {
  it("채널 12개가 0.3초 간격으로 재가입 → 받는 쪽마다 1번", () => {
    const h = harness();
    const room = vi.fn();
    const badge = vi.fn();
    h.c.onResynced(room);
    h.c.onResynced(badge);
    for (let i = 0; i < 12; i++) {
      h.c.noteResubscribed();
      h.advance(300);
    }
    h.advance(MESSENGER_RESYNC_QUIET_MS);
    expect(room).toHaveBeenCalledTimes(1);
    expect(badge).toHaveBeenCalledTimes(1);
  });
  it("재가입이 계속 이어져도 첫 재가입부터 최대 5초 안에 1번", () => {
    const h = harness();
    const cb = vi.fn();
    h.c.onResynced(cb);
    for (let i = 0; i < 30; i++) {
      h.c.noteResubscribed();
      h.advance(500);
      if (i === 9) expect(cb).toHaveBeenCalledTimes(1); // 5초 시점
    }
    expect(MESSENGER_RESYNC_MAX_WAIT_MS).toBe(5_000);
  });
  it("해제한 받는 쪽은 안 불림 · 받는 쪽 오류가 다른 쪽을 막지 않음", () => {
    const h = harness();
    const a = vi.fn(() => {
      throw new Error("x");
    });
    const b = vi.fn();
    const off = h.c.onResynced(vi.fn());
    off();
    h.c.onResynced(a);
    h.c.onResynced(b);
    h.c.noteResubscribed();
    h.advance(2_000);
    expect(b).toHaveBeenCalledTimes(1);
  });
});

describe("재동기화 1묶음 — 감독 채널 모두 연결 순간 또는 최대 8초 (설계 resume-reconnect-wait-design-2026-11-27 §3-2)", () => {
  it("Samsung 실측처럼 채널이 +0·+2.4초에 흩어져 붙어도 모두 붙는 순간 1번", () => {
    const h = harness(true);
    const cb = vi.fn();
    h.c.onResynced(cb);
    h.c.noteResubscribed(); // 일부만 붙음
    h.advance(2_400);
    expect(cb).toHaveBeenCalledTimes(0); // 예전 규칙이면 1초 조용 뒤 1번 → 여기서 1
    h.setLive(true); // 마지막 채널 SUBSCRIBED → 모두 연결 알림
    h.c.noteResubscribed(); // 그 채널의 재가입 알림(같은 순간)
    h.advance(0);
    expect(cb).toHaveBeenCalledTimes(1);
    h.advance(20_000);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(h.liveListenerCount()).toBe(0);
    expect(h.timerCount()).toBe(0);
  });
  it("모두 연결 알림이 재가입 알림보다 늦게 와도 1번", () => {
    const h = harness(true);
    const cb = vi.fn();
    h.c.onResynced(cb);
    h.c.noteResubscribed();
    h.c.noteResubscribed();
    h.advance(500);
    h.setLive(true);
    h.advance(0);
    expect(cb).toHaveBeenCalledTimes(1);
  });
  it("채널 하나가 끝내 안 붙으면 첫 재가입부터 8초에 1번", () => {
    const h = harness(true);
    const cb = vi.fn();
    h.c.onResynced(cb);
    expect(MESSENGER_RESYNC_ALL_LIVE_MAX_WAIT_MS).toBe(8_000);
    h.c.noteResubscribed();
    h.advance(3_000);
    h.c.noteResubscribed();
    h.advance(4_999);
    expect(cb).toHaveBeenCalledTimes(0);
    expect(h.c.isPending()).toBe(true);
    h.advance(1);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(h.c.isPending()).toBe(false);
    expect(h.liveListenerCount()).toBe(0);
  });
  it("이미 모두 연결인 상태의 재가입(채널 하나만 재가입) → 바로 1번", () => {
    const h = harness(true);
    const cb = vi.fn();
    h.c.onResynced(cb);
    h.setLive(true);
    h.c.noteResubscribed();
    h.advance(0);
    expect(cb).toHaveBeenCalledTimes(1);
  });
  it("실행 뒤 다음 재연결은 새 묶음 1번", () => {
    const h = harness(true);
    const cb = vi.fn();
    h.c.onResynced(cb);
    h.c.noteResubscribed();
    h.setLive(true);
    h.advance(0);
    h.setLive(false);
    h.c.noteResubscribed();
    h.advance(1_000);
    h.setLive(true);
    h.advance(0);
    expect(cb).toHaveBeenCalledTimes(2);
  });
  it("감독이 없으면(allLive 없음) 예전 규칙 — 흩어져 붙으면 1초 조용 뒤마다", () => {
    const h = harness(false);
    const cb = vi.fn();
    h.c.onResynced(cb);
    h.c.noteResubscribed();
    h.advance(2_400);
    h.c.noteResubscribed();
    h.advance(MESSENGER_RESYNC_QUIET_MS);
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
