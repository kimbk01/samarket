// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMessengerRoomBootstrapRefresh } from "@/lib/community-messenger/room/messenger-room-bootstrap-refresh";
import {
  markCmRoomEntryStarted,
  touchCmRoomForegroundLockFromSnapshot,
} from "@/lib/community-messenger/room/cm-room-bootstrap-lock";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

/**
 * 재감사 R2 정정 (docs/design/group-chat-reaudit-2026-11-13.md §7):
 * 운영 실기 FAIL(09:3x PHT · 그룹 2방×5회 방 정보 요청 0회) — 네트워크 없이 끝나는 진입 지점 6곳 중 3곳만 연결했었다.
 * ① 누락 방지: 새로고침에서 「캐시 재사용으로 끝남」 기록을 남기는 모든 지점은 return 전에 진입 확인을 부른다.
 * ② 실제 새로고침 함수로 「진입 판정 건너뜀 + 재사용」(Z5) 진입을 돌려 네트워크 요청을 센다.
 */
const REFRESH_SRC = "lib/community-messenger/room/messenger-room-bootstrap-refresh.ts";

describe("① 캐시 재사용으로 끝나는 모든 지점에 진입 확인", () => {
  it("기록 호출마다 다음 return 전에 requestGroupEntryIdentityAfterFirstPaint", () => {
    const src = readFileSync(REFRESH_SRC, "utf8");
    const marker = "logCmRoomReentryZeroFetchWithRegression({";
    const sites: number[] = [];
    for (let i = src.indexOf(marker); i >= 0; i = src.indexOf(marker, i + 1)) sites.push(i);
    expect(sites.length).toBe(4);
    for (const at of sites) {
      const ret = src.indexOf("return;", at);
      expect(ret).toBeGreaterThan(at);
      expect(src.slice(at, ret), `기록 위치 ${src.slice(0, at).split("\n").length}행`).toContain(
        "requestGroupEntryIdentityAfterFirstPaint({"
      );
    }
    /** 보강 건너뜀(Z3)은 기록 없이 끝나는 지점 — 따로 확인 */
    expect(src).toMatch(/if \(secondaryFresh\) \{\s*\/\*\*[^*]*\*\/\s*requestGroupEntryIdentityAfterFirstPaint/);
  });
});

function snap(roomId: string, roomType: string): CommunityMessengerRoomSnapshot {
  return {
    viewerUserId: "u1",
    room: { id: roomId, roomType, title: "B2B TEST", avatarUrl: null, lastMessage: "", unreadCount: 0 },
    members: [],
    messages: [],
  } as unknown as CommunityMessengerRoomSnapshot;
}

function makeRefresh(roomId: string) {
  const ref = <T,>(current: T) => ({ current });
  return createMessengerRoomBootstrapRefresh({
    roomId,
    viewerBootstrapDedupRef: ref("u1"),
    setSnapshot: () => {},
    setLoading: () => {},
    setRoomReadyForRealtime: () => {},
    loadedRef: ref(false),
    deferredMemberBootstrapRef: ref(false),
    silentRoomRefreshBusyRef: ref(false),
    silentRoomRefreshAgainRef: ref(false),
    silentBootstrapThrottleCoalesceTimerRef: ref(null),
    swrDeferredBootstrapTimerRef: ref(null),
  });
}

describe("② 실제 새로고침 — 진입 판정 건너뜀+재사용(Z5) 진입", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout"] });
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  const silentDeltaCalls = () =>
    fetchMock.mock.calls.filter((c) => String(c[0]).includes("snapshotTier=silent_delta")).length;

  it("그룹 방: 진입 때는 네트워크 0 → 첫 화면 뒤 silent_delta 1회", async () => {
    const roomId = "r2fix-group";
    markCmRoomEntryStarted(roomId);
    touchCmRoomForegroundLockFromSnapshot(roomId, snap(roomId, "private_group"));
    const refresh = makeRefresh(roomId);
    await refresh(false, { triggerReason: "lifecycle_reentry" });
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(40);
    expect(silentDeltaCalls()).toBe(1);
  });

  it("1:1 방: 같은 진입에서 요청 0", async () => {
    const roomId = "r2fix-direct";
    markCmRoomEntryStarted(roomId);
    touchCmRoomForegroundLockFromSnapshot(roomId, snap(roomId, "direct"));
    const refresh = makeRefresh(roomId);
    await refresh(false, { triggerReason: "lifecycle_reentry" });
    await vi.advanceTimersByTimeAsync(40);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
