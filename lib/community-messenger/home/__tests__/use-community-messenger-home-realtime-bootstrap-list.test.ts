import { beforeEach, describe, expect, it } from "vitest";
import { coalesceRoomSummarySnapshotRow } from "@/lib/community-messenger/consistency/messenger-consistency-merge";
import {
  bumpRoomTruthVersion,
  clearMessengerConsistencyStateForTests,
} from "@/lib/community-messenger/consistency/messenger-consistency-version";
import {
  applyHomeListSummaryPatchUnread,
  clearHomeListServerUnreadIncreaseForTests,
  mergeParticipantUnreadDeltaIntoHomeListRoom,
  shouldBlockStaleHomeListUnreadZero,
} from "@/lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list";
import {
  mergeMessengerRoomSummaryForHomeSyncReplace,
} from "@/lib/community-messenger/merge-critical-home-sync-room-summary";
import {
  clearLocalReadGuardsForTests,
  setLocalReadGuard,
} from "@/lib/community-messenger/read/local-read-guard";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function room(partial: Partial<CommunityMessengerRoomSummary> & Pick<CommunityMessengerRoomSummary, "id">): CommunityMessengerRoomSummary {
  const { id, ...restPartial } = partial;
  return {
    id,
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: "상대",
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "",
    lastMessageAt: "2026-01-01T00:00:00.000Z",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    ...restPartial,
  };
}

describe("mergeParticipantUnreadDeltaIntoHomeListRoom", () => {
  beforeEach(() => {
    clearLocalReadGuardsForTests();
    clearMessengerConsistencyStateForTests();
    clearHomeListServerUnreadIncreaseForTests();
  });

  it("participant_unread_delta accepts server unread increase at same lastMessageAt despite read guard", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    setLocalReadGuard({ roomId: "r1", referenceLastMessageAt: ts, source: "manual" });
    const prev = room({ id: "r1", lastMessageAt: ts, unreadCount: 0 });
    const out = mergeParticipantUnreadDeltaIntoHomeListRoom(prev, {
      roomId: "r1",
      unreadCount: 5,
      lastReadAt: null,
      lastReadMessageId: null,
    });
    expect(out.unreadCount).toBe(5);
  });

  it("does not resurrect unread when list row lastMessageAt is older than truth version", () => {
    const prev = room({
      id: "r1",
      unreadCount: 0,
      lastMessageAt: "2026-06-05T11:00:00.000Z",
    });
    bumpRoomTruthVersion("r1", Date.parse("2026-06-05T12:00:00.000Z"), "realtime");
    const out = mergeParticipantUnreadDeltaIntoHomeListRoom(prev, {
      roomId: "r1",
      unreadCount: 5,
      lastReadAt: null,
      lastReadMessageId: null,
    });
    expect(out.unreadCount).toBe(0);
  });

  it("home_sync replace accepts server unread increase at same lastMessageAt despite read guard", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    setLocalReadGuard({ roomId: "r1", referenceLastMessageAt: ts, source: "manual" });
    const prev = room({ id: "r1", lastMessageAt: ts, unreadCount: 0 });
    const incoming = room({ id: "r1", lastMessageAt: ts, unreadCount: 5 });
    const out = mergeMessengerRoomSummaryForHomeSyncReplace(prev, incoming);
    expect(out.unreadCount).toBe(5);
  });

  it("low-level coalesce home_sync_replace still suppresses stale positive unread under read guard", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    setLocalReadGuard({ roomId: "r1", referenceLastMessageAt: ts, source: "manual" });
    const prev = room({ id: "r1", lastMessageAt: ts, unreadCount: 0 });
    const incoming = room({ id: "r1", lastMessageAt: ts, unreadCount: 5 });
    const out = coalesceRoomSummarySnapshotRow(prev, incoming, {
      surface: "home_sync",
      roomId: "r1",
      source: "home_sync_replace",
      eventType: "replace",
    });
    expect(out).toBe(prev);
    expect(out.unreadCount).toBe(0);
  });
});

describe("applyHomeListSummaryPatchUnread", () => {
  beforeEach(() => {
    clearHomeListServerUnreadIncreaseForTests();
  });

  it("summary_patch suppresses stale unread under local-read-guard", () => {
    clearLocalReadGuardsForTests();
    const ts = "2026-01-02T00:00:00.000Z";
    setLocalReadGuard({ roomId: "r1", referenceLastMessageAt: ts, source: "manual" });
    const prev = room({ id: "r1", lastMessageAt: ts, unreadCount: 0 });
    const out = applyHomeListSummaryPatchUnread(prev, 5);
    expect(out.unreadCount).toBe(0);
  });

  it("summary_patch admits unread when lastMessageAt is newer than guard", () => {
    clearLocalReadGuardsForTests();
    setLocalReadGuard({
      roomId: "r1",
      referenceLastMessageAt: "2026-01-02T00:00:00.000Z",
      source: "manual",
    });
    const prev = room({
      id: "r1",
      lastMessageAt: "2026-01-02T01:00:00.000Z",
      unreadCount: 0,
    });
    const out = applyHomeListSummaryPatchUnread(prev, 5);
    expect(out.unreadCount).toBe(5);
  });
});

describe("shouldBlockStaleHomeListUnreadZero", () => {
  beforeEach(() => {
    clearLocalReadGuardsForTests();
    clearMessengerConsistencyStateForTests();
    clearHomeListServerUnreadIncreaseForTests();
  });

  it("blocks stale local_unread(0) after server unread increase was applied to list state", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    setLocalReadGuard({ roomId: "r1", referenceLastMessageAt: ts, source: "manual" });
    const prev = room({ id: "r1", lastMessageAt: ts, unreadCount: 0 });
    const out = mergeParticipantUnreadDeltaIntoHomeListRoom(prev, {
      roomId: "r1",
      unreadCount: 5,
      lastReadAt: null,
      lastReadMessageId: null,
    });
    expect(out.unreadCount).toBe(5);
    expect(
      shouldBlockStaleHomeListUnreadZero({
        busType: "cm.room.local_unread",
        roomId: "r1",
        incomingUnread: 0,
        existingUnread: 5,
      })
    ).toBe(true);
  });

  it("allows cm.room.read zero when lastReadMessageId proves real mark_read", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    setLocalReadGuard({ roomId: "r1", referenceLastMessageAt: ts, source: "manual" });
    const prev = room({ id: "r1", lastMessageAt: ts, unreadCount: 0 });
    mergeParticipantUnreadDeltaIntoHomeListRoom(prev, {
      roomId: "r1",
      unreadCount: 5,
      lastReadAt: null,
      lastReadMessageId: null,
    });
    expect(
      shouldBlockStaleHomeListUnreadZero({
        busType: "cm.room.read",
        roomId: "r1",
        incomingUnread: 0,
        existingUnread: 5,
        lastReadMessageId: "msg-read-1",
      })
    ).toBe(false);
  });
});
