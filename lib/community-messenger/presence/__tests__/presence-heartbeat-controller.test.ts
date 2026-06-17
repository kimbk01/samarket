/**
 * presence heartbeat singleton — 중복·backoff·hidden
 * 실행: npx vitest run lib/community-messenger/presence/__tests__/presence-heartbeat-controller.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stubBrowserGlobals() {
  const doc = {
    visibilityState: "visible",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", {
    location: { pathname: "/community-messenger" },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("navigator", { sendBeacon: vi.fn() });
}

describe("presence-heartbeat-controller", () => {
  beforeEach(() => {
    stubBrowserGlobals();
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
  });

  afterEach(async () => {
    const mod = await import("@/lib/community-messenger/presence/presence-heartbeat-controller");
    mod.resetPresenceHeartbeatControllerForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("inFlight 중복 요청 방지", async () => {
    let resolveFirst: (() => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirst = () => resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("@/lib/community-messenger/presence/presence-heartbeat-controller");
    const signals = { documentVisible: true, channelSubscribed: true, lastActivityMs: Date.now() };
    const p1 = mod.sendPresenceHeartbeat({ force: true, signals });
    const p2 = mod.sendPresenceHeartbeat({ force: true, signals });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFirst?.();
    await Promise.all([p1, p2]);
  });

  it("same payload 20초 이내 재전송 스킵", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const mod = await import("@/lib/community-messenger/presence/presence-heartbeat-controller");
    const signals = { documentVisible: true, channelSubscribed: true, lastActivityMs: Date.now() };
    await mod.sendPresenceHeartbeat({ force: true, signals });
    await mod.sendPresenceHeartbeat({ signals });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(21_000);
    await mod.sendPresenceHeartbeat({ signals });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("5xx backoff 적용 — 즉시 재시도 없음", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("err", { status: 504 }))
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const mod = await import("@/lib/community-messenger/presence/presence-heartbeat-controller");
    const signals = { documentVisible: true, channelSubscribed: true, lastActivityMs: Date.now() };
    await mod.sendPresenceHeartbeat({ force: true, signals });
    await mod.sendPresenceHeartbeat({ force: true, signals });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(31_000);
    await mod.sendPresenceHeartbeat({ force: true, signals });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("visibility hidden 시 heartbeat loop 중지", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const mod = await import("@/lib/community-messenger/presence/presence-heartbeat-controller");
    const signals = () => ({ documentVisible: true, channelSubscribed: true, lastActivityMs: Date.now() });
    mod.startPresenceHeartbeatLoop(signals);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    mod.pausePresenceHeartbeatOnHidden();
    vi.advanceTimersByTime(mod.PRESENCE_HEARTBEAT_INTERVAL_MS + 1_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    mod.stopPresenceHeartbeatLoop();
  });

  it("interval 중복 생성 방지", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const mod = await import("@/lib/community-messenger/presence/presence-heartbeat-controller");
    const signals = () => ({ documentVisible: true, channelSubscribed: true, lastActivityMs: Date.now() });
    mod.startPresenceHeartbeatLoop(signals);
    mod.startPresenceHeartbeatLoop(signals);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    mod.stopPresenceHeartbeatLoop();
  });
});
