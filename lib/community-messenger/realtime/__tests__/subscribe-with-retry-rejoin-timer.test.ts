// @vitest-environment jsdom
/**
 * 라이브러리 재가입이 래퍼 재시도보다 먼저 성공하면 래퍼 재시도를 지운다 (중복 재가입 금지).
 * 통화 영향 분석서 docs/audit/supabase-request-surge-2026-11-18/retry-timer-after-rejoin-call-impact-2026-11-27.md
 * (Owner 「구현 승인」 2026-11-27)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/wait-for-realtime-auth", () => ({
  waitForSupabaseRealtimeAuth: async () => true,
  syncSupabaseRealtimeAuthFromSession: async () => true,
}));

import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";

type FakeChannel = { name: string; cb: ((s: string) => void) | null; subscribe: (cb: (s: string) => void) => FakeChannel };

function fakeSb() {
  const channels: FakeChannel[] = [];
  const removed: FakeChannel[] = [];
  const sb = {
    channel(name: string) {
      const ch: FakeChannel = {
        name,
        cb: null,
        subscribe(cb) {
          ch.cb = cb;
          return ch;
        },
      };
      channels.push(ch);
      return ch;
    },
    removeChannel(ch: FakeChannel) {
      removed.push(ch);
      return Promise.resolve("ok");
    },
  };
  return { sb, channels, removed };
}

let seq = 0;
async function start() {
  const f = fakeSb();
  const statuses: string[] = [];
  const h = subscribeWithRetry({
    sb: f.sb as never,
    name: `test-rejoin-timer:${++seq}`,
    scope: `test-rejoin-timer:${seq}`,
    build: (c) => c,
    isCancelled: () => false,
    onStatus: (s) => statuses.push(s),
  });
  await vi.advanceTimersByTimeAsync(0);
  return { ...f, statuses, h };
}

describe("subscribeWithRetry — 라이브러리 재가입 뒤 래퍼 재시도", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("CHANNEL_ERROR → 라이브러리 재가입 SUBSCRIBED → 래퍼 재시도 없음 (채널 지우기·새 채널 0)", async () => {
    const t = await start();
    const ch = t.channels[0]!;
    ch.cb?.("SUBSCRIBED");
    ch.cb?.("CHANNEL_ERROR"); // 소켓 끊김
    ch.cb?.("SUBSCRIBED"); // realtime-js 가 스스로 다시 가입
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.channels).toHaveLength(1);
    expect(t.removed).toHaveLength(0);
    expect(t.statuses).toEqual(["SUBSCRIBED", "CHANNEL_ERROR", "SUBSCRIBED"]);
    t.h.stop();
  });

  it("CHANNEL_ERROR 뒤 재가입이 없으면 래퍼가 지우고 새로 가입 (지금과 같음)", async () => {
    const t = await start();
    const ch = t.channels[0]!;
    ch.cb?.("SUBSCRIBED");
    ch.cb?.("CHANNEL_ERROR");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.removed).toContain(ch);
    expect(t.channels.length).toBeGreaterThanOrEqual(2);
    t.h.stop();
  });

  it("서버 CLOSED → 래퍼가 새로 가입 (지금과 같음)", async () => {
    const t = await start();
    const ch = t.channels[0]!;
    ch.cb?.("SUBSCRIBED");
    ch.cb?.("CLOSED");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.channels.length).toBeGreaterThanOrEqual(2);
    t.h.stop();
  });

  it("재가입 성공 뒤 다시 CHANNEL_ERROR → 새 재시도가 걸린다", async () => {
    const t = await start();
    const ch = t.channels[0]!;
    ch.cb?.("SUBSCRIBED");
    ch.cb?.("CHANNEL_ERROR");
    ch.cb?.("SUBSCRIBED");
    ch.cb?.("CHANNEL_ERROR");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.removed).toContain(ch);
    expect(t.channels.length).toBeGreaterThanOrEqual(2);
    t.h.stop();
  });

  it("숨김 중(지연 분기) CHANNEL_ERROR → 보임 뒤 라이브러리 재가입 → 래퍼 재시도 없음 (실기 시나리오)", async () => {
    const t = await start();
    const ch = t.channels[0]!;
    ch.cb?.("SUBSCRIBED");
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    ch.cb?.("CHANNEL_ERROR");
    await vi.advanceTimersByTimeAsync(1_000);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    ch.cb?.("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.channels).toHaveLength(1);
    expect(t.removed).toHaveLength(0);
    t.h.stop();
  });

  it("CHANNEL_ERROR 2번(소켓 error 뒤 close) → 라이브러리 재가입 → 래퍼 재시도 없음", async () => {
    const t = await start();
    const ch = t.channels[0]!;
    ch.cb?.("SUBSCRIBED");
    ch.cb?.("CHANNEL_ERROR");
    ch.cb?.("CHANNEL_ERROR");
    ch.cb?.("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.channels).toHaveLength(1);
    expect(t.removed).toHaveLength(0);
    t.h.stop();
  });

  it("숨김 중 CHANNEL_ERROR 2번 → 재가입 없음 → 새 가입은 1번만", async () => {
    const t = await start();
    const ch = t.channels[0]!;
    ch.cb?.("SUBSCRIBED");
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    ch.cb?.("CHANNEL_ERROR");
    ch.cb?.("CHANNEL_ERROR");
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(t.channels).toHaveLength(2);
    expect(t.removed).toEqual([ch]);
    t.h.stop();
  });
});
