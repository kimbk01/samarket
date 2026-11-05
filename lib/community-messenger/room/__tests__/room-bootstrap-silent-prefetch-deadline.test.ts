// @vitest-environment jsdom
/**
 * 방 silent bootstrap 공유 요청 마감(A1).
 * - silent 마감 초과는 기존 silent 실패 응답과 같다: 스냅샷·loading 을 건드리지 않는다(통화 정리 effect 비발화).
 * - foreground(blocking) 마감은 `room-bootstrap-foreground-deadline.test.ts`.
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

type Outcome = { state: "pending" | "resolved" | "rejected"; error?: unknown };

function track(p: Promise<unknown>): Outcome {
  const o: Outcome = { state: "pending" };
  p.then(
    () => (o.state = "resolved"),
    (e) => {
      o.state = "rejected";
      o.error = e;
    }
  );
  return o;
}

async function loadRefresh() {
  const m = await import("@/lib/community-messenger/room/messenger-room-bootstrap-refresh");
  return m.createMessengerRoomBootstrapRefresh;
}

function fetchInit(i: number): RequestInit {
  return ((fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[i]?.[1] ?? {}) as RequestInit;
}

describe.each(["header_stall", "body_stall"] as const)("A1 silent bootstrap — %s", (kind) => {
  it("마감 안에 resolve(reject 누출 없음) · busy 해제 · 스냅샷/loading 미변경", async () => {
    const create = await loadRefresh();
    stallState.behavior = kind;
    const deps = makeDeps("room-s1");
    deps.loadedRef.current = true;
    const refresh = create(deps as never);
    const o = track(refresh(true, { forceSilentNetwork: true, triggerReason: "group_settings_saved" }));
    await vi.advanceTimersByTimeAsync(DEADLINE_PLUS);
    expect(o.state).toBe("resolved");
    expect(stallState.fetchCalls).toBe(1);
    expect(fetchInit(0).signal).toBeInstanceOf(AbortSignal);
    expect(fetchInit(0).signal?.aborted).toBe(true);
    expect(deps.silentRoomRefreshBusyRef.current).toBe(false);
    expect(deps.setSnapshot).not.toHaveBeenCalled();
    expect(deps.setLoading).not.toHaveBeenCalled();
  });

  it("오류 후 재시도: 다음 silent refresh 는 새 요청을 보낸다", async () => {
    const create = await loadRefresh();
    stallState.behavior = kind;
    const deps = makeDeps("room-s2");
    deps.loadedRef.current = true;
    const refresh = create(deps as never);
    void refresh(true, { forceSilentNetwork: true, triggerReason: "group_settings_saved" });
    await vi.advanceTimersByTimeAsync(DEADLINE_PLUS);
    stallState.behavior = "ok";
    const o = track(refresh(true, { forceSilentNetwork: true, triggerReason: "group_notice_saved" }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(o.state).toBe("resolved");
    expect(stallState.fetchCalls).toBe(2);
  });

  it("공유 호출자(다른 인스턴스 합류)도 resolve · reject 누출 없음", async () => {
    const create = await loadRefresh();
    stallState.behavior = kind;
    const depsA = makeDeps("room-s3");
    const depsB = makeDeps("room-s3");
    depsA.loadedRef.current = true;
    depsB.loadedRef.current = true;
    const a = track(create(depsA as never)(true, { forceSilentNetwork: true, triggerReason: "rt" }));
    await vi.advanceTimersByTimeAsync(1_000);
    const b = track(create(depsB as never)(true, { triggerReason: "rt" }));
    await vi.advanceTimersByTimeAsync(DEADLINE_PLUS);
    expect(a.state).toBe("resolved");
    expect(b.state).toBe("resolved");
    expect(stallState.fetchCalls).toBe(1);
    expect(depsA.setSnapshot).not.toHaveBeenCalled();
    expect(depsB.setSnapshot).not.toHaveBeenCalled();
    expect(depsB.setLoading).not.toHaveBeenCalled();
  });

  it("room lock 해제: 마감 뒤 같은 방 blocking 진입은 새 요청으로 끝난다", async () => {
    const create = await loadRefresh();
    stallState.behavior = kind;
    const deps = makeDeps("room-s4");
    deps.loadedRef.current = true;
    void create(deps as never)(true, { forceSilentNetwork: true, triggerReason: "rt" });
    await vi.advanceTimersByTimeAsync(DEADLINE_PLUS);
    stallState.behavior = "ok";
    const deps2 = makeDeps("room-s4");
    const o = track(
      create(deps2 as never)(false, { forceForegroundBlock: true, triggerReason: "lifecycle_first_block" })
    );
    await vi.advanceTimersByTimeAsync(1_000);
    expect(o.state).toBe("resolved");
    expect(stallState.fetchCalls).toBe(2);
    expect(deps2.setLoading).toHaveBeenCalledWith(false);
  });
});

describe("A1 정상 경로 보존", () => {
  it("silent 정상 응답은 기존처럼 스냅샷을 갱신한다", async () => {
    stallState.body = { ok: true, viewerUserId: "viewer-1", room: { id: "room-n1" }, messages: [], members: [] };
    const create = await loadRefresh();
    const deps = makeDeps("room-n1");
    deps.loadedRef.current = true;
    const o = track(create(deps as never)(true, { forceSilentNetwork: true, triggerReason: "rt" }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(o.state).toBe("resolved");
    expect(deps.setSnapshot).toHaveBeenCalled();
    expect(deps.setLoading).not.toHaveBeenCalled();
    expect(deps.silentRoomRefreshBusyRef.current).toBe(false);
  });
});
