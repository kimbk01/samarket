// @vitest-environment jsdom
/**
 * 감사 2026-11-26 D2·D2-R — 시작 목적지가 채팅방이면 게이트와 같은 함수로 1회 미리 받는다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const fetchRoom = vi.fn(async () => null);
const warm = vi.fn();
vi.mock("@/lib/community-messenger/room/fetch-community-messenger-room-bootstrap-client", () => ({
  fetchCommunityMessengerRoomBootstrapClient: fetchRoom,
}));
vi.mock("@/lib/community-messenger/room/cm-room-route-chunk-warm", () => ({
  warmCommunityMessengerRoomRouteChunks: warm,
}));

const ROOM = "/community-messenger/rooms/1de13b3e-ba94-49bf-b611-582ef3f39ab9";
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

afterEach(async () => {
  (await import("@/lib/startup/launch-room-prefetch")).__resetLaunchRoomPrefetchForTests();
  fetchRoom.mockClear();
  warm.mockClear();
});

describe("prefetchLaunchRoomEntry", () => {
  it("채팅방이면 예열(출처 표시) + 데이터 1회 · 같은 방 두 번째는 무동작", async () => {
    const { prefetchLaunchRoomEntry } = await import("@/lib/startup/launch-room-prefetch");
    expect(prefetchLaunchRoomEntry(`${ROOM}?cm_list=1`, "lifecycle_restore")).toBe(true);
    expect(prefetchLaunchRoomEntry(ROOM, "launch_push")).toBe(false);
    await flush();
    expect(warm).toHaveBeenCalledWith("lifecycle_restore");
    expect(fetchRoom).toHaveBeenCalledTimes(1);
    expect(fetchRoom).toHaveBeenCalledWith("1de13b3e-ba94-49bf-b611-582ef3f39ab9");
  });
  it("채팅방이 아니면(통화 기록·목록·홈·없음) 무동작", async () => {
    const { prefetchLaunchRoomEntry } = await import("@/lib/startup/launch-room-prefetch");
    for (const p of ["/community-messenger/calls/logs", "/community-messenger", "/home", null]) {
      expect(prefetchLaunchRoomEntry(p, "lifecycle_restore")).toBe(false);
    }
    await flush();
    expect(fetchRoom).not.toHaveBeenCalled();
  });
});
