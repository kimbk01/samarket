import { describe, expect, it, beforeEach } from "vitest";
import {
  clearLocalReadGuardsForTests,
  setLocalReadGuard,
} from "@/lib/community-messenger/read/local-read-guard";
import {
  clearMessengerConsistencyStateForTests,
  bumpRoomTruthVersion,
} from "@/lib/community-messenger/consistency/messenger-consistency-version";
import { coalesceRoomSummarySnapshotRow } from "@/lib/community-messenger/consistency/messenger-consistency-merge";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function room(partial: Partial<CommunityMessengerRoomSummary> & { id: string }): CommunityMessengerRoomSummary {
  const { id, ...rest } = partial;
  return {
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: "Room",
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "",
    lastMessageAt: "2026-06-01T00:00:00.000Z",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    messengerDirectKey: null,
    contextMeta: null,
    ...rest,
    id,
  };
}

describe("messenger-consistency snapshot coalesce", () => {
  beforeEach(() => {
    clearMessengerConsistencyStateForTests();
    clearLocalReadGuardsForTests();
  });

  it("drops stale unread snapshot before merge (no unread resurrection)", () => {
    const prev = room({
      id: "room-a",
      unreadCount: 0,
      lastMessageAt: "2026-06-05T12:00:00.000Z",
    });
    bumpRoomTruthVersion("room-a", Date.parse("2026-06-05T12:00:00.000Z"), "realtime");

    const stale = room({
      id: "room-a",
      unreadCount: 2,
      lastMessageAt: "2026-06-05T11:00:00.000Z",
    });

    const merged = coalesceRoomSummarySnapshotRow(prev, stale, {
      surface: "room_list",
      roomId: "room-a",
      source: "bootstrap_apply_full",
      eventType: "bootstrap_apply_full",
    });

    expect(merged).toBe(prev);
    expect(merged.unreadCount).toBe(0);
  });

  it("accepts newer snapshot unread when version is newer than truth", () => {
    const prev = room({
      id: "room-b",
      unreadCount: 0,
      lastMessageAt: "2026-06-05T11:00:00.000Z",
    });
    bumpRoomTruthVersion("room-b", Date.parse("2026-06-05T11:00:00.000Z"), "realtime");

    const newer = room({
      id: "room-b",
      unreadCount: 1,
      lastMessageAt: "2026-06-05T12:00:00.000Z",
    });

    const merged = coalesceRoomSummarySnapshotRow(prev, newer, {
      surface: "home_sync",
      roomId: "room-b",
      source: "home_sync_replace",
      eventType: "replace",
    });

    expect(merged.unreadCount).toBe(1);
  });

  it("drops unread resurrection when local read guard is active", () => {
    const prev = room({
      id: "room-c",
      unreadCount: 0,
      lastMessageAt: "2026-06-05T12:00:00.000Z",
    });
    setLocalReadGuard({
      roomId: "room-c",
      referenceLastMessageAt: "2026-06-05T12:00:00.000Z",
      source: "manual",
    });

    const stale = room({
      id: "room-c",
      unreadCount: 1,
      lastMessageAt: "2026-06-05T12:00:00.000Z",
    });

    const merged = coalesceRoomSummarySnapshotRow(prev, stale, {
      surface: "home_sync",
      roomId: "room-c",
      source: "home_sync_replace",
      eventType: "replace",
    });

    expect(merged).toBe(prev);
    expect(merged.unreadCount).toBe(0);
  });
});
