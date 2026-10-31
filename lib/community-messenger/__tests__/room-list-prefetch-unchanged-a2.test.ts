import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllRoomSnapshotCaches,
  isRoomSnapshotCurrentForListActivity,
  prefetchCommunityMessengerRoomSnapshot,
  primeRoomSnapshot,
} from "@/lib/community-messenger/room-snapshot-cache";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

/**
 * A2 — 목록 미리 받기는 「그 사이 새 메시지가 온 방」만 다시 받는다.
 * 받아 둔 방 데이터의 마지막 메시지 시각 ≥ 목록의 마지막 메시지 시각이면 나이(60초 TTL)와 상관없이 다시 받지 않는다.
 */
const T1 = "2026-10-31T17:23:54.31+00:00";
const T2 = "2026-10-31T17:30:00.000+00:00";

function snap(roomId: string, lastMessageAt: string): CommunityMessengerRoomSnapshot {
  return {
    viewerUserId: "user-a",
    room: { id: roomId, title: "t", lastMessageAt },
    members: [],
    messages: [],
    myRole: "member",
    activeCall: null,
  } as unknown as CommunityMessengerRoomSnapshot;
}

describe("A2 isRoomSnapshotCurrentForListActivity", () => {
  beforeEach(() => clearAllRoomSnapshotCaches());

  it("받아 둔 데이터가 없으면 false (기존처럼 받는다)", () => {
    expect(isRoomSnapshotCurrentForListActivity("r1", T1)).toBe(false);
  });

  it("목록 시각을 모르면 false", () => {
    primeRoomSnapshot("r1", snap("r1", T1));
    expect(isRoomSnapshotCurrentForListActivity("r1", null)).toBe(false);
    expect(isRoomSnapshotCurrentForListActivity("r1", "")).toBe(false);
  });

  it("같은 시각 → true, 목록이 더 최신(새 메시지) → false", () => {
    primeRoomSnapshot("r1", snap("r1", T1));
    expect(isRoomSnapshotCurrentForListActivity("r1", T1)).toBe(true);
    expect(isRoomSnapshotCurrentForListActivity("r1", T2)).toBe(false);
  });

  it("다른 방의 데이터로 판정하지 않는다", () => {
    primeRoomSnapshot("r1", snap("r1", T2));
    expect(isRoomSnapshotCurrentForListActivity("r2", T1)).toBe(false);
  });
});

describe("A2 prefetchCommunityMessengerRoomSnapshot", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    clearAllRoomSnapshotCaches();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: false, json: async () => null });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("60초가 지났어도 새 메시지가 없으면 다시 받지 않는다", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-10-31T17:24:00Z") });
    primeRoomSnapshot("p1", snap("p1", T1));
    vi.setSystemTime(Date.parse("2026-10-31T17:26:30Z")); // 150초 뒤 — TTL(60s) 지남, 캐시(5분)는 유지
    const ok = await prefetchCommunityMessengerRoomSnapshot("p1", { listLastMessageAt: T1 });
    expect(ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("새 메시지가 왔으면(목록 시각이 더 최신) 다시 받는다", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-10-31T17:24:00Z") });
    primeRoomSnapshot("p2", snap("p2", T1));
    vi.setSystemTime(Date.parse("2026-10-31T17:26:30Z"));
    await prefetchCommunityMessengerRoomSnapshot("p2", { listLastMessageAt: T2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("목록 시각 없이 부르면 기존 판정 그대로 (60초 지나면 받는다)", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-10-31T17:24:00Z") });
    primeRoomSnapshot("p3", snap("p3", T1));
    vi.setSystemTime(Date.parse("2026-10-31T17:26:30Z"));
    await prefetchCommunityMessengerRoomSnapshot("p3");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("force 는 그대로 강제로 받는다", async () => {
    primeRoomSnapshot("p4", snap("p4", T1));
    await prefetchCommunityMessengerRoomSnapshot("p4", { force: true, listLastMessageAt: T1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
