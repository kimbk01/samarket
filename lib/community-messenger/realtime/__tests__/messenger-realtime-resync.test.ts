/**
 * D2 R2 — 재연결 1번 = 재동기화 1번 (Owner 「개정안 승인」 2026-11-26)
 */
import { describe, expect, it, vi } from "vitest";
import {
  MESSENGER_RESYNC_MAX_WAIT_MS,
  MESSENGER_RESYNC_QUIET_MS,
  createMessengerResyncCoordinator,
} from "@/lib/community-messenger/realtime/messenger-realtime-resync";

function harness() {
  let now = 0;
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
  });
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
  return { c, advance };
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
