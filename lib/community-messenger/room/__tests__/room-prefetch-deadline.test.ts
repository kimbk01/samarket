// @vitest-environment jsdom
/**
 * 방 프리페치 공유 요청 마감(A2) — 멈춘 프리페치는 마감 뒤 false 로 끝나고,
 * 그 프리페치에 합류해 기다리던 blocking 진입은 자기 요청으로 정상 진입한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installStallFetch, stallState } from "@/lib/http/__tests__/shared-flight-stall-harness";

const DEADLINE_PLUS = 12_050;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  installStallFetch({ ok: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function makeDeps(roomId: string) {
  const ref = <T,>(v: T) => ({ current: v });
  return {
    roomId,
    viewerBootstrapDedupRef: ref("viewer-1"),
    setSnapshot: vi.fn(),
    setLoading: vi.fn(),
    setRoomReadyForRealtime: vi.fn(),
    loadedRef: ref(false),
    deferredMemberBootstrapRef: ref(false),
    silentRoomRefreshBusyRef: ref(false),
    silentRoomRefreshAgainRef: ref(false),
    silentBootstrapThrottleCoalesceTimerRef: ref<ReturnType<typeof setTimeout> | null>(null),
    swrDeferredBootstrapTimerRef: ref<number | null>(null),
    setRoomMessages: vi.fn(),
    reportTimelineBootstrapOutcome: vi.fn(),
  };
}

function track(p: Promise<unknown>): { state: "pending" | "resolved" | "rejected" } {
  const o: { state: "pending" | "resolved" | "rejected" } = { state: "pending" };
  p.then(
    () => (o.state = "resolved"),
    () => (o.state = "rejected")
  );
  return o;
}

describe.each(["header_stall", "body_stall"] as const)("A2 프리페치 — %s", (kind) => {
  it("마감 안에 false 로 끝나고 재시도는 새 요청", async () => {
    const { prefetchCommunityMessengerRoomSnapshot } = await import("@/lib/community-messenger/room-snapshot-cache");
    stallState.behavior = kind;
    const o = track(prefetchCommunityMessengerRoomSnapshot("room-p1", { force: true }));
    await vi.advanceTimersByTimeAsync(DEADLINE_PLUS);
    expect(o.state).toBe("resolved");
    stallState.behavior = "ok";
    const retry = track(prefetchCommunityMessengerRoomSnapshot("room-p1", { force: true }));
    await vi.advanceTimersByTimeAsync(100);
    expect(retry.state).toBe("resolved");
    expect(stallState.fetchCalls).toBe(2);
  });

  it("프리페치 대기 중인 blocking 진입은 마감 뒤 자기 요청으로 정상 진입한다", async () => {
    const { prefetchCommunityMessengerRoomSnapshot } = await import("@/lib/community-messenger/room-snapshot-cache");
    const { createMessengerRoomBootstrapRefresh } = await import(
      "@/lib/community-messenger/room/messenger-room-bootstrap-refresh"
    );
    stallState.behavior = kind;
    void prefetchCommunityMessengerRoomSnapshot("room-p2", { force: true });
    await vi.advanceTimersByTimeAsync(10);
    stallState.behavior = "ok";
    stallState.body = { ok: true, viewerUserId: "viewer-1", room: { id: "room-p2" }, messages: [], members: [] };
    const deps = makeDeps("room-p2");
    const o = track(
      createMessengerRoomBootstrapRefresh(deps as never)(false, {
        forceForegroundBlock: true,
        triggerReason: "lifecycle_first_block",
      })
    );
    await vi.advanceTimersByTimeAsync(DEADLINE_PLUS);
    expect(o.state).toBe("resolved");
    expect(stallState.fetchCalls).toBe(2);
    expect(deps.setSnapshot).toHaveBeenCalled();
    expect(deps.setLoading).toHaveBeenCalledWith(false);
  });
});
