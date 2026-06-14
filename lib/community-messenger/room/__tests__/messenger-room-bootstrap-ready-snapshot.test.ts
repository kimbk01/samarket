import { describe, expect, it } from "vitest";
import { buildClientShellPlaceholderSnapshot } from "@/lib/community-messenger/room/client-shell-placeholder-snapshot";
import { isMessengerRoomBootstrapReadySnapshot } from "@/lib/community-messenger/room/messenger-room-initial-snapshot-authority";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

describe("isMessengerRoomBootstrapReadySnapshot", () => {
  it("placeholder 셸은 bootstrap-ready 가 아니다", () => {
    const shell = buildClientShellPlaceholderSnapshot("room-1", "user-1");
    expect(isMessengerRoomBootstrapReadySnapshot(shell)).toBe(false);
  });

  it("메시지 0건 실스냅샷은 bootstrap-ready 이다", () => {
    const snap = {
      viewerUserId: "user-1",
      myRole: "member" as const,
      room: {
        id: "room-1",
        roomType: "direct" as const,
        unreadCount: 0,
        lastMessage: "",
      },
      members: [],
      messages: [],
      activeCall: null,
    } as unknown as CommunityMessengerRoomSnapshot;
    expect(isMessengerRoomBootstrapReadySnapshot(snap)).toBe(true);
  });
});
