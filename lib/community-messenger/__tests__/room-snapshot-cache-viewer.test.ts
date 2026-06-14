import { describe, expect, it } from "vitest";
import {
  clearAllRoomSnapshotCaches,
  isRoomSnapshotFreshWithin,
  peekRoomSnapshot,
  primeRoomSnapshot,
} from "@/lib/community-messenger/room-snapshot-cache";
import { buildClientShellPlaceholderSnapshot } from "@/lib/community-messenger/room/client-shell-placeholder-snapshot";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

function minimalSnapshot(roomId: string, viewerUserId: string): CommunityMessengerRoomSnapshot {
  return {
    viewerUserId,
    room: { id: roomId, title: "t" },
    members: [],
    messages: [],
    myRole: "member",
    activeCall: null,
  } as unknown as CommunityMessengerRoomSnapshot;
}

describe("peekRoomSnapshot viewer isolation", () => {
  it("returns null without viewerUserId", () => {
    clearAllRoomSnapshotCaches();
    primeRoomSnapshot("room-1", minimalSnapshot("room-1", "user-a"));
    expect(peekRoomSnapshot("room-1")).toBeNull();
    expect(peekRoomSnapshot("room-1", "")).toBeNull();
  });

  it("returns snapshot only for matching viewer", () => {
    clearAllRoomSnapshotCaches();
    primeRoomSnapshot("room-1", minimalSnapshot("room-1", "user-a"));
    expect(peekRoomSnapshot("room-1", "user-a")?.viewerUserId).toBe("user-a");
    expect(peekRoomSnapshot("room-1", "user-b")).toBeNull();
  });

  it("does not cache clientShellPlaceholder snapshots", () => {
    clearAllRoomSnapshotCaches();
    primeRoomSnapshot("room-1", buildClientShellPlaceholderSnapshot("room-1", "user-a"));
    expect(peekRoomSnapshot("room-1", "user-a")).toBeNull();
  });

  it("isRoomSnapshotFreshWithin is false without bootstrap-ready cache", () => {
    clearAllRoomSnapshotCaches();
    expect(isRoomSnapshotFreshWithin("room-2", 60_000, "user-a")).toBe(false);
    primeRoomSnapshot("room-2", minimalSnapshot("room-2", "user-a"));
    expect(isRoomSnapshotFreshWithin("room-2", 60_000, "user-a")).toBe(true);
  });
});
