import { describe, expect, it } from "vitest";
import {
  clearAllRoomSnapshotCaches,
  peekHotRoomSnapshot,
  primeHotRoomSnapshot,
  removeMessageFromRoomSnapshotCache,
} from "@/lib/community-messenger/room-snapshot-cache";

/** PR #433 검토 4 — 음성 영구 삭제(hard_deleted) 수신 시 방 캐시(hot)에서도 제거 → 재진입 때 되살아나지 않음 */
describe("removeMessageFromRoomSnapshotCache", () => {
  it("removes only the deleted id from the hot snapshot", () => {
    clearAllRoomSnapshotCaches();
    const snap = {
      viewerUserId: "v1",
      room: { id: "r1" },
      messages: [{ id: "m1" }, { id: "m2" }],
    } as never;
    primeHotRoomSnapshot("r1", snap);
    expect(peekHotRoomSnapshot("r1", "v1")?.messages?.map((m) => m.id)).toEqual(["m1", "m2"]);
    removeMessageFromRoomSnapshotCache({ roomId: "r1", viewerUserId: "v1", messageId: "m2" });
    expect(peekHotRoomSnapshot("r1", "v1")?.messages?.map((m) => m.id)).toEqual(["m1"]);
    /** 없는 id 는 무변화 */
    removeMessageFromRoomSnapshotCache({ roomId: "r1", viewerUserId: "v1", messageId: "zz" });
    expect(peekHotRoomSnapshot("r1", "v1")?.messages?.map((m) => m.id)).toEqual(["m1"]);
  });
});
