import { beforeEach, describe, expect, it } from "vitest";
import { roomBootstrapTimelineFingerprint } from "@/lib/community-messenger/room/merge-community-messenger-foreground-bootstrap";
import {
  clearAllRoomSnapshotCaches,
  getRoomSnapshotCacheAgeMs,
  patchRoomPeerReadReceiptInSnapshotCache,
  peekRoomSnapshot,
  primeRoomSnapshot,
} from "@/lib/community-messenger/room-snapshot-cache";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

/** 1단계 결함 D-12 (2026-10-26): 상대가 읽은 위치가 바뀐 응답·실시간 갱신을 버리지 않는다. */

const ROOM = "c202326f-8109-4ce4-aa61-394f0a799e7d";
const VIEWER = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const PEER = "edc8c2f0-2673-4ca8-9d63-92a609d556f4";
const OLD = "00000000-0000-4000-8000-000000000001";
const NEW = "00000000-0000-4000-8000-000000000002";

function snap(peerReadId: string): CommunityMessengerRoomSnapshot {
  return {
    viewerUserId: VIEWER,
    myRole: "member",
    room: { id: ROOM, title: "w", roomType: "direct", unreadCount: 0, lastMessage: "S1lat0210", lastMessageAt: "2026-10-26T02:10:00Z" },
    members: [],
    messages: [
      { id: OLD, roomId: ROOM, senderId: VIEWER, senderLabel: "나", messageType: "text", content: "a", createdAt: "2026-10-26T02:09:00Z", isMine: true },
      { id: NEW, roomId: ROOM, senderId: VIEWER, senderLabel: "나", messageType: "text", content: "S1lat0210", createdAt: "2026-10-26T02:10:00Z", isMine: true },
    ],
    readReceipt: { roomId: ROOM, readerUserId: PEER, lastReadAt: "2026-10-26T02:09:30Z", lastReadMessageId: peerReadId },
  } as unknown as CommunityMessengerRoomSnapshot;
}

describe("D-12 상대 읽음 반영", () => {
  beforeEach(() => clearAllRoomSnapshotCaches());

  it("부트스트랩 지문: 상대 읽음 위치만 달라도 다른 지문(새 응답을 버리지 않음)", () => {
    expect(roomBootstrapTimelineFingerprint(snap(OLD))).not.toBe(roomBootstrapTimelineFingerprint(snap(NEW)));
  });

  it("방 캐시: 상대 읽음 갱신 반영, 캐시 신선도 시각은 그대로", () => {
    primeRoomSnapshot(ROOM, snap(OLD));
    const ageBefore = getRoomSnapshotCacheAgeMs(ROOM, VIEWER);
    patchRoomPeerReadReceiptInSnapshotCache({
      roomId: ROOM,
      viewerUserId: VIEWER,
      lastReadMessageId: NEW,
      lastReadAt: "2026-10-26T02:10:08Z",
    });
    const after = peekRoomSnapshot(ROOM, VIEWER);
    expect(after?.readReceipt?.lastReadMessageId).toBe(NEW);
    expect(after?.readReceipt?.lastReadAt).toBe("2026-10-26T02:10:08Z");
    const ageAfter = getRoomSnapshotCacheAgeMs(ROOM, VIEWER);
    expect(ageAfter).not.toBeNull();
    expect(ageAfter!).toBeGreaterThanOrEqual(ageBefore ?? 0);
  });
});
