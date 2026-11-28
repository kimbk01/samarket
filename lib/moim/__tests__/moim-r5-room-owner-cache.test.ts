import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * 모임 R5 A §2-2 — 모임 방 판정 캐시 (A11 · A12 결정 1 · A13 · A22).
 * 고치기 전: 실패를 「판정 끝」(resolved true)으로 보고 메뉴를 보였다 · 성공한 답은 앱 종료까지 남아
 * 모임 삭제·역할 변경·계정 전환이 화면에 안 보였다(실기 16:20).
 */

const registered: Array<{ id: string; lane: string; auth: string; minHiddenMs?: number; run: (ctx: unknown) => unknown }> = [];
vi.mock("@/lib/app-resume/app-resume-coordinator.client", () => ({
  registerAppResumeTask: (task: (typeof registered)[number]) => {
    registered.push(task);
    return () => {};
  },
}));

import {
  __ensureMoimRoomOwnerResumeTaskForTests,
  __resetMoimRoomOwnerCacheForTests,
  __subscribeMoimRoomOwnersForTests,
  clearMoimRoomOwnerCacheForAuthChange,
  markMoimRoomOwnersStale,
  peekMoimRoomOwner,
  peekMoimRoomOwnerResolved,
  peekMoimRoomOwnerState,
  requestMoimRoomOwners,
  revalidateMoimRoomOwner,
} from "@/lib/moim/use-moim-room-owner";
import { resolveMoimRoomSurface } from "@/lib/moim/moim-room-surface-policy";

type Resp = { status: number; body: unknown };

function stubFetch(queue: Resp[]) {
  const urls: string[] = [];
  const fn = vi.fn(async (url: string) => {
    urls.push(url);
    const next = queue.shift() ?? { status: 200, body: { ok: true, owners: {} } };
    return { ok: next.status >= 200 && next.status < 300, json: async () => next.body };
  });
  vi.stubGlobal("fetch", fn);
  return { fn, urls };
}

const owner = (roles: Record<string, string> = {}) => ({
  moimId: "m1",
  kind: "moim",
  moimName: "M",
  moimStatus: "active",
  homeOpen: true,
  readonlyReason: null,
  scheduleStartsAt: null,
  memberRoles: roles,
  canStartDm: true,
});

const surfaceOf = (roomId: string) => {
  const s = peekMoimRoomOwnerState(roomId);
  return resolveMoimRoomSurface({ roomType: "private_group", owner: s.owner, ownerStatus: s.status, viewerUserId: "u" });
};

beforeEach(() => {
  __resetMoimRoomOwnerCacheForTests();
  registered.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-28T00:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  __resetMoimRoomOwnerCacheForTests();
});

describe("결정 1 — 실패는 판정 끝이 아니다", () => {
  it("응답 503 → resolved false · 표면 pending(메뉴 숨김) (고치기 전: true · 메뉴 보임)", async () => {
    stubFetch([{ status: 503, body: { ok: false, error: "moim_rooms_unavailable" } }]);
    requestMoimRoomOwners(["r1"]);
    await vi.advanceTimersByTimeAsync(200);
    expect(peekMoimRoomOwnerResolved("r1")).toBe(false);
    expect(peekMoimRoomOwnerState("r1").status).toBe("failed");
    expect(surfaceOf("r1").state).toBe("pending");
    expect(surfaceOf("r1").messengerManagement).toBe(false);
  });

  it("실패 30초 안에는 다시 묻지 않고, 30초 뒤 다시 구독하면 묻고 성공하면 moim", async () => {
    const f = stubFetch([
      { status: 503, body: { ok: false } },
      { status: 200, body: { ok: true, owners: { r1: owner() } } },
    ]);
    requestMoimRoomOwners(["r1"]);
    await vi.advanceTimersByTimeAsync(200);
    requestMoimRoomOwners(["r1"]);
    await vi.advanceTimersByTimeAsync(200);
    expect(f.fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    requestMoimRoomOwners(["r1"]);
    expect(surfaceOf("r1").state).toBe("pending");
    await vi.advanceTimersByTimeAsync(200);
    expect(f.fn).toHaveBeenCalledTimes(2);
    expect(surfaceOf("r1").state).toBe("moim");
  });

  it("fetch 자체가 던져도 failed (판정 끝 아님)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    requestMoimRoomOwners(["r1"]);
    await vi.advanceTimersByTimeAsync(200);
    expect(peekMoimRoomOwnerState("r1").status).toBe("failed");
  });
});

describe("A13 — 다시 묻기 (예전 값 유지)", () => {
  it("받은 지 61초 된 방을 열면 1회 다시 묻고, 그 사이 예전 값이 유지된다 · 60초 안이면 묻지 않음", async () => {
    let resolveSecond: (v: unknown) => void = () => {};
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, owners: { r1: owner() } }) })
      .mockImplementationOnce(() => new Promise((r) => (resolveSecond = r)));
    vi.stubGlobal("fetch", fn);
    requestMoimRoomOwners(["r1"]);
    await vi.advanceTimersByTimeAsync(200);
    revalidateMoimRoomOwner("r1");
    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(61_000);
    revalidateMoimRoomOwner("r1");
    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(2);
    /** 응답 전: 예전 값 그대로 · 상태 resolved(깜빡이지 않음) */
    expect(peekMoimRoomOwnerState("r1").status).toBe("resolved");
    expect(peekMoimRoomOwner("r1")?.moimId).toBe("m1");
    resolveSecond({ ok: true, json: async () => ({ ok: true, owners: { r1: { ...owner(), moimStatus: "deleted", homeOpen: false } } }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(peekMoimRoomOwner("r1")?.homeOpen).toBe(false);
  });

  it("역할 맵이 바뀐 응답 → 값이 바뀐다 (A13 재현: 고치기 전에는 다시 묻지 않아 안 바뀜)", async () => {
    stubFetch([
      { status: 200, body: { ok: true, owners: { r1: owner({ u: "staff" }) } } },
      { status: 200, body: { ok: true, owners: { r1: owner({}) } } },
    ]);
    requestMoimRoomOwners(["r1"]);
    await vi.advanceTimersByTimeAsync(200);
    expect(surfaceOf("r1").viewerRoleKey).toBe("moim_role_staff");
    await vi.advanceTimersByTimeAsync(61_000);
    revalidateMoimRoomOwner("r1");
    await vi.advanceTimersByTimeAsync(200);
    expect(surfaceOf("r1").viewerRoleKey).toBe("moim_role_member");
  });

  it("모임 쓰기 뒤(markMoimRoomOwnersStale) 구독 중인 방만 다시 묻는다", async () => {
    const f = stubFetch([
      { status: 200, body: { ok: true, owners: { r1: owner(), r2: owner() } } },
      { status: 200, body: { ok: true, owners: { r1: owner() } } },
    ]);
    requestMoimRoomOwners(["r1", "r2"]);
    await vi.advanceTimersByTimeAsync(200);
    const unsub = __subscribeMoimRoomOwnersForTests(["r1"]);
    markMoimRoomOwnersStale();
    await vi.advanceTimersByTimeAsync(200);
    expect(f.fn).toHaveBeenCalledTimes(2);
    expect(f.urls[1]).toBe("/api/moim/rooms?ids=r1");
    unsub();
  });

  it("로그아웃·계정 전환 정리 뒤 캐시가 빈다 · 그 전에 나간 답은 버린다", async () => {
    let resolveLate: (v: unknown) => void = () => {};
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, owners: { r1: owner() } }) })
      .mockImplementationOnce(() => new Promise((r) => (resolveLate = r)));
    vi.stubGlobal("fetch", fn);
    requestMoimRoomOwners(["r1"]);
    await vi.advanceTimersByTimeAsync(200);
    expect(peekMoimRoomOwner("r1")).not.toBeNull();
    requestMoimRoomOwners(["r2"]);
    await vi.advanceTimersByTimeAsync(200);
    clearMoimRoomOwnerCacheForAuthChange();
    expect(peekMoimRoomOwner("r1")).toBeNull();
    expect(peekMoimRoomOwnerState("r1").status).toBe("none");
    resolveLate({ ok: true, json: async () => ({ ok: true, owners: { r2: owner() } }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(peekMoimRoomOwner("r2")).toBeNull();
  });

  it("정리 뒤 화면에 남아 있는 방은 새 계정으로 다시 묻는다 (R5 재감사 · 로그인 직후 pending 고정 방지)", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, owners: { r1: owner() } }) });
    vi.stubGlobal("fetch", fn);
    const unsub = __subscribeMoimRoomOwnersForTests(["r1"]);
    await vi.advanceTimersByTimeAsync(200);
    const before = fn.mock.calls.length;
    clearMoimRoomOwnerCacheForAuthChange();
    expect(peekMoimRoomOwnerState("r1").status).toBe("none");
    await vi.advanceTimersByTimeAsync(200);
    expect(fn.mock.calls.length).toBe(before + 1);
    expect(peekMoimRoomOwner("r1")).not.toBeNull();
    unsub();
  });

  it("구조 확인 — wipeClientSessionState 의 메모리 정리 목록이 캐시 정리를 부른다 (동작 시험 아님)", () => {
    const src = readFileSync("lib/auth/client-session-wipe.ts", "utf8");
    const start = src.indexOf("function resetInMemoryClientStores");
    const end = src.indexOf("\n}\n", start);
    expect(src.slice(start, end)).toContain("clearMoimRoomOwnerCacheForAuthChange();");
  });
});

describe("앱 복귀 작업", () => {
  it("복귀 작업 1개: background · 로그인 필요 · 60초 이상 숨김 · 구독 중인 방을 한 요청으로", async () => {
    const f = stubFetch([
      { status: 200, body: { ok: true, owners: { r1: owner(), r2: owner() } } },
      { status: 200, body: { ok: true, owners: { r1: owner(), r2: owner() } } },
    ]);
    __ensureMoimRoomOwnerResumeTaskForTests();
    __ensureMoimRoomOwnerResumeTaskForTests();
    expect(registered).toHaveLength(1);
    expect(registered[0]).toMatchObject({ id: "moim-room-owner-revalidate", lane: "background", auth: "required", minHiddenMs: 60_000 });
    const unsub = __subscribeMoimRoomOwnersForTests(["r1", "r2"]);
    requestMoimRoomOwners(["r1", "r2"]);
    await vi.advanceTimersByTimeAsync(200);
    await registered[0].run({});
    await vi.advanceTimersByTimeAsync(200);
    expect(f.fn).toHaveBeenCalledTimes(2);
    expect(f.urls[1]).toBe("/api/moim/rooms?ids=r1,r2");
    unsub();
  });
});
