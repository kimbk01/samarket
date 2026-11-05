// @vitest-environment jsdom
/**
 * B1 — foreground(blocking) 방 bootstrap 마감.
 * - 멈춘 blocking 요청은 마감 안에 끝나고 room lock·loading 이 풀린다.
 * - 스냅샷을 비우지 않는다(방·메시지 보존). 기존 타임라인 실패·다시 시도 UI 로 넘긴다.
 * - 마감은 통화 종료가 아니다 — 최소화 통화·dock 플래그를 건드리지 않는다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installStallFetch, stallState } from "@/lib/http/__tests__/shared-flight-stall-harness";

const DEADLINE_PLUS = 12_050;
const OK_BODY = { ok: true, viewerUserId: "viewer-1", room: { id: "room" }, messages: [], members: [] };

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  installStallFetch(OK_BODY);
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

async function load() {
  const refreshMod = await import("@/lib/community-messenger/room/messenger-room-bootstrap-refresh");
  const calls = await import("@/lib/community-messenger/call-presentation-ownership");
  return { create: refreshMod.createMessengerRoomBootstrapRefresh, ...calls };
}

const BLOCK = { forceForegroundBlock: true, triggerReason: "lifecycle_blocking_first" } as const;
const FAILED = expect.objectContaining({ ok: false });

describe.each(["header_stall", "body_stall"] as const)("B1 foreground bootstrap — %s", (kind) => {
  it("마감 안에 resolve · loading 해제 · 스냅샷 미변경 · 실패 UI 보고", async () => {
    const { create } = await load();
    stallState.behavior = kind;
    const deps = makeDeps("room-b1");
    const o = track(create(deps as never)(false, BLOCK));
    await vi.advanceTimersByTimeAsync(DEADLINE_PLUS);
    expect(o.state).toBe("resolved");
    expect(stallState.fetchCalls).toBe(1);
    expect(deps.setLoading).toHaveBeenLastCalledWith(false);
    expect(deps.setSnapshot).not.toHaveBeenCalled();
    expect(deps.reportTimelineBootstrapOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, shouldBlock: true, silent: false })
    );
  });

  it("통화 보호: 마감 뒤 최소화 통화·dock 플래그 유지", async () => {
    const { create, attachDetachedCommunityCall, peekDetachedCommunityCallSessionId, writeDockedCallSession, readDockedCallSessionId } =
      await load();
    const cleanup = vi.fn(async () => {});
    attachDetachedCommunityCall("call-1", cleanup);
    writeDockedCallSession("call-1", "room-b2");
    stallState.behavior = kind;
    const deps = makeDeps("room-b2");
    void create(deps as never)(false, BLOCK);
    await vi.advanceTimersByTimeAsync(DEADLINE_PLUS);
    expect(cleanup).not.toHaveBeenCalled();
    expect(peekDetachedCommunityCallSessionId()).toBe("call-1");
    expect(readDockedCallSessionId()).toBe("call-1");
  });

  it("오류 후 재시도: 새 요청 · 성공 시 스냅샷 반영", async () => {
    const { create } = await load();
    stallState.behavior = kind;
    const deps = makeDeps("room-b3");
    const refresh = create(deps as never);
    void refresh(false, BLOCK);
    await vi.advanceTimersByTimeAsync(DEADLINE_PLUS);
    stallState.behavior = "ok";
    const o = track(refresh(false, { forceForegroundBlock: true, triggerReason: "timeline_bootstrap_retry" }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(o.state).toBe("resolved");
    expect(stallState.fetchCalls).toBe(2);
    expect(deps.setSnapshot).toHaveBeenCalled();
  });

  it("합류한 foreground 호출자도 resolve · 스냅샷 미변경 · reject 누출 없음", async () => {
    const { create } = await load();
    stallState.behavior = kind;
    const a = makeDeps("room-b4");
    const b = makeDeps("room-b4");
    const oa = track(create(a as never)(false, { triggerReason: "legacy" }));
    await vi.advanceTimersByTimeAsync(1_000);
    const ob = track(create(b as never)(false, { triggerReason: "legacy" }));
    await vi.advanceTimersByTimeAsync(DEADLINE_PLUS);
    expect(oa.state).toBe("resolved");
    expect(ob.state).toBe("resolved");
    expect(a.setSnapshot).not.toHaveBeenCalled();
    expect(b.setSnapshot).not.toHaveBeenCalled();
  });

  it("화면 이탈 뒤 이전 요청 마감은 다른 방(현재 화면) 상태를 바꾸지 않는다", async () => {
    const { create } = await load();
    stallState.behavior = kind;
    const old = makeDeps("room-old");
    void create(old as never)(false, BLOCK);
    await vi.advanceTimersByTimeAsync(1_000);
    stallState.behavior = "ok";
    const current = makeDeps("room-new");
    void create(current as never)(false, BLOCK);
    await vi.advanceTimersByTimeAsync(DEADLINE_PLUS);
    expect(old.reportTimelineBootstrapOutcome).toHaveBeenCalledWith(FAILED);
    expect(current.reportTimelineBootstrapOutcome).not.toHaveBeenCalledWith(FAILED);
    expect(current.setSnapshot).toHaveBeenCalled();
  });
});

describe("B1 정상 경로 보존", () => {
  it("정상 blocking 응답: 스냅샷 반영 · loading 해제 · 실패 보고 없음", async () => {
    const { create } = await load();
    const deps = makeDeps("room-n1");
    const o = track(create(deps as never)(false, BLOCK));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(o.state).toBe("resolved");
    expect(deps.setSnapshot).toHaveBeenCalled();
    expect(deps.setLoading).toHaveBeenLastCalledWith(false);
    expect(deps.reportTimelineBootstrapOutcome).not.toHaveBeenCalledWith(FAILED);
  });

  it("HTTP 실패 응답은 기존 계약 그대로(스냅샷 null)", async () => {
    stallState.body = { ok: false };
    const { create } = await load();
    const deps = makeDeps("room-n2");
    const o = track(create(deps as never)(false, BLOCK));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(o.state).toBe("resolved");
    expect(deps.setSnapshot).toHaveBeenCalledWith(null);
  });
});
