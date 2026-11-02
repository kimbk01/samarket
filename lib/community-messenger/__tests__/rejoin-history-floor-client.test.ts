/**
 * S-2 H 실기 FAIL 수정 (2026-11-02 21:53 PHT 샤오미): 나간 뒤 같은 앱 실행 안에서 다시 참가하면
 * 기기 실시간 저장소의 옛 메시지가 서버 응답과 합쳐져 다시 보이던 것. 기기도 서버 하한을 따른다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { filterMessagesByHistoryFloor } from "@/lib/community-messenger/room/message-history-floor";
import {
  clearRoomLeftLocally,
  isRoomLeftLocally,
  markRoomLeftLocally,
  peekHotRoomSnapshot,
  primeHotRoomSnapshot,
} from "@/lib/community-messenger/room-snapshot-cache";
import {
  getMessengerRealtimeRoomMessages,
  purgeMessengerRealtimeRoom,
  useMessengerRealtimeStore,
} from "@/lib/community-messenger/stores/messenger-realtime-store";
import { mergePrimedTimelineSeedIntoExisting } from "@/lib/community-messenger/room/merge-primed-timeline-seed";

const ROOM = "a7c0ca62-1845-4419-bae2-5685b10b414e";
const msg = (id: string, createdAt: string) =>
  ({ id, roomId: ROOM, senderId: "u", senderLabel: "u", messageType: "text", content: id, createdAt, isMine: false }) as never;

describe("client history floor", () => {
  it("drops rows at/below the floor, keeps newer and leaves list untouched without floor", () => {
    const rows = [msg("old", "2026-11-02T13:48:00Z"), msg("new", "2026-11-02T13:52:29Z")];
    expect(filterMessagesByHistoryFloor(rows, "2026-11-02T13:52:28.004Z").map((m: { id: string }) => m.id)).toEqual(["new"]);
    expect(filterMessagesByHistoryFloor(rows, null)).toBe(rows);
  });

  it("merge with realtime store leftovers no longer resurrects pre-floor rows", () => {
    useMessengerRealtimeStore.setState({ messagesByRoomId: { [ROOM]: [msg("old", "2026-11-02T13:48:00Z")] } } as never);
    const merged = mergePrimedTimelineSeedIntoExisting({
      roomId: ROOM,
      prev: [],
      seed: [msg("new", "2026-11-02T13:52:29Z")],
      historyFloorAt: "2026-11-02T13:52:28.004Z",
    });
    expect(merged.map((m) => m.id)).toEqual(["new"]);
  });

  it("purge drops the room's realtime copy", () => {
    useMessengerRealtimeStore.setState({ messagesByRoomId: { [ROOM]: [msg("old", "2026-11-02T13:48:00Z")] } } as never);
    purgeMessengerRealtimeRoom(ROOM);
    expect(getMessengerRealtimeRoomMessages(ROOM)).toEqual([]);
  });

  it("left-room marker blocks hot-cache refill until the room is reopened", () => {
    const snap = {
      room: { id: ROOM, roomType: "direct" },
      viewerUserId: "viewer-1",
      messages: [msg("old", "2026-11-02T13:48:00Z")],
      members: [],
      myRole: "member",
      activeCall: null,
    } as never;
    markRoomLeftLocally(ROOM);
    expect(isRoomLeftLocally(ROOM)).toBe(true);
    primeHotRoomSnapshot(ROOM, snap);
    expect(peekHotRoomSnapshot(ROOM, "viewer-1")).toBeNull();
    clearRoomLeftLocally(ROOM);
    expect(isRoomLeftLocally(ROOM)).toBe(false);
  });
});

describe("contract", () => {
  const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
  it("server sends the viewer floor and an empty peer read receipt for a peer-left 1:1", () => {
    const svc = read("lib/community-messenger/service.ts");
    expect(svc).toContain("viewerHistoryFloorAt: participantHistoryFloorIso(meParticipant) ?? null,");
    expect(svc).toContain('summary.roomType === "direct" && peerUserId && summary.directPeerParticipating === false');
  });
  it("every timeline merge passes the floor; in-room leave also removes the room from the mounted home list", () => {
    expect(read("lib/community-messenger/room/use-messenger-room-client-phase1.ts").match(/historyFloorAt: snap(shot)?\.viewerHistoryFloorAt/g)?.length).toBe(2);
    expect(read("lib/community-messenger/room/messenger-room-bootstrap-refresh.ts")).toContain("historyFloorAt: primed.viewerHistoryFloorAt");
    expect(read("lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts")).toContain("applyMessengerRoomLeftFromRoomScreen(streamRoomId)");
    const leave = read("lib/community-messenger/home/messenger-home-room-leave-client.ts");
    expect(leave).toContain("purgeMessengerRealtimeRoom(rid);");
    expect(leave).toContain('reason: "leave",');
  });
});
