import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { patchCallV4ConnectedWithRetry } from "@/lib/community-messenger/call-v4/call-v4-phase-bridge";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import {
  isCallSessionMediaConnectedForHeartbeat,
  markCallSessionMediaConnectedForHeartbeat,
  patchCallSessionHeartbeat,
  resetCallSessionMediaConnectedForHeartbeatForTests,
} from "@/lib/call/call-server-heartbeat-client";

function seedConnected(callId = "c1") {
  useCallV4Store.getState().resetToIdle();
  useCallV4Store.getState().setIdentity({
    callId,
    roomId: "r1",
    callerUserId: "u1",
    calleeUserId: "u2",
    direction: "outgoing",
    mediaType: "audio",
    createdAt: new Date().toISOString(),
  });
  useCallV4Store.setState({ phase: "connected", connectedAt: Date.now() });
}

const noSleep = async () => undefined;

describe("C-14 — connected PATCH 최대 3회 재시도", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    seedConnected();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    useCallV4Store.getState().resetToIdle();
  });

  it("일시 실패 후 성공하면 그 시점에서 멈춘다", async () => {
    const patch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "call_session_update_failed" })
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: true });
    const sleep = vi.fn(noSleep);
    await expect(patchCallV4ConnectedWithRetry("c1", { patch, sleep })).resolves.toBe(true);
    expect(patch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1_000, 2_000]);
  });

  it("최초 1회 + 재시도 3회(1s·2s·4s) 후 포기", async () => {
    const patch = vi.fn().mockResolvedValue({ ok: false });
    const sleep = vi.fn(noSleep);
    await expect(patchCallV4ConnectedWithRetry("c1", { patch, sleep })).resolves.toBe(false);
    expect(patch).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1_000, 2_000, 4_000]);
  });

  it("재시도해도 같은 서버 거절(bad_action 등)이면 즉시 중단", async () => {
    const patch = vi.fn().mockResolvedValue({ ok: false, error: "bad_action" });
    await patchCallV4ConnectedWithRetry("c1", { patch, sleep: noSleep });
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("통화가 끝났거나 다른 통화로 바뀌면 재시도하지 않는다", async () => {
    const patch = vi.fn().mockResolvedValue({ ok: false });
    const sleep = vi.fn(async () => {
      useCallV4Store.getState().resetToIdle();
    });
    await patchCallV4ConnectedWithRetry("c1", { patch, sleep });
    expect(patch).toHaveBeenCalledTimes(1);
  });
});

describe("C-14 — heartbeat PATCH 에 mediaConnected 동봉", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    resetCallSessionMediaConnectedForHeartbeatForTests();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function lastBody(): Record<string, unknown> {
    const init = fetchMock.mock.calls.at(-1)?.[1] as { body: string };
    return JSON.parse(init.body) as Record<string, unknown>;
  }

  it("미디어 연결 전에는 보내지 않고, 연결 후에는 mediaConnected:true", async () => {
    await patchCallSessionHeartbeat("c1");
    expect(lastBody()).not.toHaveProperty("mediaConnected");
    markCallSessionMediaConnectedForHeartbeat("c1");
    expect(isCallSessionMediaConnectedForHeartbeat("c1")).toBe(true);
    await patchCallSessionHeartbeat("c1");
    expect(lastBody()).toMatchObject({ action: "heartbeat", mediaConnected: true });
    await patchCallSessionHeartbeat("c2");
    expect(lastBody()).not.toHaveProperty("mediaConnected");
  });
});
