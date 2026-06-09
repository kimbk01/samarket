import { describe, expect, it } from "vitest";
import {
  mergeCommunityMessengerForegroundBootstrapIntoSnapshot,
  roomBootstrapTimelineFingerprint,
} from "@/lib/community-messenger/room/merge-community-messenger-foreground-bootstrap";
import type { CommunityMessengerCallSession, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

function callSession(partial: Partial<CommunityMessengerCallSession> & { id: string; status: CommunityMessengerCallSession["status"] }): CommunityMessengerCallSession {
  return {
    sessionMode: "group",
    callKind: "voice",
    roomId: "room-1",
    peerLabel: "Group",
    peerUserId: null,
    initiatorUserId: "u1",
    recipientUserId: null,
    isMineInitiator: true,
    startedAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    endedReason: null,
    participants: [],
    ...partial,
  };
}

function baseSnapshot(activeCall: CommunityMessengerRoomSnapshot["activeCall"]): CommunityMessengerRoomSnapshot {
  return {
    viewerUserId: "u1",
    myRole: "owner",
    room: {
      id: "room-1",
      title: "Test",
      roomType: "open_group",
      unreadCount: 0,
      lastMessage: "",
      lastMessageAt: new Date().toISOString(),
      memberCount: 2,
      roomStatus: "active",
      isReadonly: false,
      visibility: "public",
      joinPolicy: "password",
      identityPolicy: "alias_allowed",
      description: "",
      summary: null,
      isMuted: false,
      isPinned: false,
      isArchivedByViewer: false,
      allowMemberCall: true,
    },
    members: [],
    messages: [],
    bootstrapInitialMessageLimit: 40,
    hasMoreOlderMessages: false,
    activeCall,
  } as unknown as CommunityMessengerRoomSnapshot;
}

describe("mergeCommunityMessengerForegroundBootstrapIntoSnapshot activeCall", () => {
  it("clears activeCall when server returns null", () => {
    const prev = baseSnapshot(callSession({ id: "s1", status: "active", answeredAt: new Date().toISOString() }));
    const next = baseSnapshot(null);
    const merged = mergeCommunityMessengerForegroundBootstrapIntoSnapshot(prev, next);
    expect(merged.activeCall).toBeNull();
  });

  it("fingerprint changes when only activeCall changes", () => {
    const a = baseSnapshot(null);
    const b = baseSnapshot(callSession({ id: "s1", status: "ringing" }));
    expect(roomBootstrapTimelineFingerprint(a)).not.toBe(roomBootstrapTimelineFingerprint(b));
  });
});
