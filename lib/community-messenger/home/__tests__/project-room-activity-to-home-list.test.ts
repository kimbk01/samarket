import { beforeEach, describe, expect, it } from "vitest";
import {
  clearBootstrapCache,
  peekBootstrapCache,
  primeBootstrapCache,
} from "@/lib/community-messenger/bootstrap-cache";
import { findHomeListRoomRow } from "@/lib/community-messenger/home-list-patch";
import {
  clearRoomActivityProjectionStateForTests,
  getRoomActivityProjectionStatsForTests,
  projectRoomActivityToHomeList,
  roomActivityFromMessageRow,
  wasRoomActivityEventProjected,
} from "@/lib/community-messenger/home/project-room-activity-to-home-list";
import { reconcileExitedRoomSummary } from "@/lib/community-messenger/home/reconcile-exited-room-summary";
import {
  applyIncomingMessageEvent,
  useMessengerRealtimeStore,
} from "@/lib/community-messenger/stores/messenger-realtime-store";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function room(
  partial: Partial<CommunityMessengerRoomSummary> & Pick<CommunityMessengerRoomSummary, "id">
): CommunityMessengerRoomSummary {
  const { id, ...rest } = partial;
  return {
    id,
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: "Peer",
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "old tip",
    lastMessageAt: "2026-01-01T00:00:00.000Z",
    lastMessageType: "text",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    chatDomain: "general_direct",
    domainIdentityKey: "gd:user-a:user-b",
    ...rest,
  };
}

function bootstrap(chats: CommunityMessengerRoomSummary[]): CommunityMessengerBootstrap {
  return {
    me: { id: "user-a" },
    tabs: { chats: chats.length, groups: 0, calls: 0, friends: 0 },
    chats,
    groups: [],
    friends: [],
    following: [],
    hidden: [],
    blocked: [],
    discoverableGroups: [],
    requests: [],
    calls: [],
  } as unknown as CommunityMessengerBootstrap;
}

describe("projectRoomActivityToHomeList", () => {
  beforeEach(() => {
    clearBootstrapCache();
    clearRoomActivityProjectionStateForTests();
    useMessengerRealtimeStore.setState({
      viewerUserId: "user-a",
      messagesByRoomId: {},
      lastReadByRoomId: {},
      activeRoomId: null,
    });
  });

  it("ACK tip: accepts once, echo no-ops, room moves to top", () => {
    primeBootstrapCache(
      bootstrap([
        room({ id: "room-b", lastMessageAt: "2026-07-01T12:00:00.000Z", lastMessage: "other" }),
        room({ id: "room-a", lastMessageAt: "2026-06-01T00:00:00.000Z", lastMessage: "old tip" }),
      ])
    );

    const first = projectRoomActivityToHomeList({
      roomId: "room-a",
      eventId: "msg-1",
      eventKind: "text",
      previewText: "hello ack",
      activityAt: "2026-07-01T12:30:00.000Z",
      lastMessageType: "text",
      boostUnread: false,
      source: "local_send_ack",
      viewerUserId: "user-a",
    });
    expect(first.accepted).toBe(true);
    expect(first.changedRoomCount).toBe(1);
    expect(wasRoomActivityEventProjected("msg-1")).toBe(true);

    const cache = peekBootstrapCache();
    expect(findHomeListRoomRow(cache, "room-a")?.lastMessage).toBe("hello ack");
    expect(cache?.chats[0]?.id).toBe("room-a");

    const echo = projectRoomActivityToHomeList({
      roomId: "room-a",
      eventId: "msg-1",
      eventKind: "text",
      previewText: "hello ack",
      activityAt: "2026-07-01T12:30:00.000Z",
      lastMessageType: "text",
      boostUnread: false,
      source: "remote_message_realtime",
      viewerUserId: "user-a",
    });
    expect(echo.accepted).toBe(false);
    expect(echo.reason).toBe("duplicate_event");
    expect(echo.changedRoomCount).toBe(0);

    const stats = getRoomActivityProjectionStatsForTests();
    expect(stats.accepted).toBe(1);
    expect(stats.dropped).toBe(1);
  });

  it("remote receive updates tip without Home React mount", () => {
    primeBootstrapCache(bootstrap([room({ id: "room-a" })]));
    const tip = roomActivityFromMessageRow({
      roomId: "room-a",
      messageRow: {
        id: "peer-1",
        content: "from peer",
        message_type: "text",
        created_at: "2026-07-01T13:00:00.000Z",
      },
      source: "remote_message_realtime",
      boostUnread: true,
      viewerUserId: "user-a",
    });
    expect(tip).not.toBeNull();
    const result = projectRoomActivityToHomeList(tip!);
    expect(result.accepted).toBe(true);
    expect(findHomeListRoomRow(peekBootstrapCache(), "room-a")?.lastMessage).toBe("from peer");
    expect(findHomeListRoomRow(peekBootstrapCache(), "room-a")?.unreadCount).toBe(1);
  });

  it("stale activityAt does not rollback", () => {
    primeBootstrapCache(
      bootstrap([
        room({
          id: "room-a",
          lastMessage: "new",
          lastMessageAt: "2026-07-01T14:00:00.000Z",
        }),
      ])
    );
    const result = projectRoomActivityToHomeList({
      roomId: "room-a",
      eventId: "old-1",
      eventKind: "text",
      previewText: "old",
      activityAt: "2026-07-01T10:00:00.000Z",
      boostUnread: true,
      source: "remote_message_realtime",
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("stale_activity_at");
    expect(findHomeListRoomRow(peekBootstrapCache(), "room-a")?.lastMessage).toBe("new");
  });

  it("reconcileExitedRoomSummary is no-op when tip already aligned", () => {
    primeBootstrapCache(
      bootstrap([
        room({
          id: "room-a",
          lastMessage: "aligned",
          lastMessageAt: "2026-07-01T15:00:00.000Z",
        }),
      ])
    );
    applyIncomingMessageEvent({
      viewerUserId: "user-a",
      roomId: "room-a",
      message: {
        id: "m-aligned",
        roomId: "room-a",
        senderId: "user-a",
        senderLabel: "me",
        messageType: "text",
        content: "aligned",
        createdAt: "2026-07-01T15:00:00.000Z",
        isMine: true,
      },
    });
    projectRoomActivityToHomeList({
      roomId: "room-a",
      eventId: "m-aligned",
      eventKind: "text",
      previewText: "aligned",
      activityAt: "2026-07-01T15:00:00.000Z",
      boostUnread: false,
      source: "local_send_ack",
      viewerUserId: "user-a",
    });
    clearRoomActivityProjectionStateForTests();

    const reconciled = reconcileExitedRoomSummary({ roomId: "room-a", viewerUserId: "user-a" });
    expect(reconciled.reconcile).toBe("noop_aligned");
    expect(reconciled.accepted).toBe(false);
  });

  it("reconcileExitedRoomSummary recovers one room when tip lags timeline", () => {
    primeBootstrapCache(
      bootstrap([
        room({
          id: "room-a",
          lastMessage: "stale tip",
          lastMessageAt: "2026-06-01T00:00:00.000Z",
        }),
        room({
          id: "room-b",
          lastMessage: "keep",
          lastMessageAt: "2026-07-01T12:00:00.000Z",
        }),
      ])
    );
    /** Seed timeline without tip projection (simulate B-path miss). */
    useMessengerRealtimeStore.setState({
      viewerUserId: "user-a",
      messagesByRoomId: {
        "room-a": [
          {
            id: "m-recover",
            roomId: "room-a",
            senderId: "user-b",
            senderLabel: "peer",
            messageType: "text",
            content: "timeline only",
            createdAt: "2026-07-01T16:00:00.000Z",
            isMine: false,
          },
        ],
      },
      lastReadByRoomId: {},
      activeRoomId: null,
    });

    const beforeB = findHomeListRoomRow(peekBootstrapCache(), "room-b");
    const reconciled = reconcileExitedRoomSummary({ roomId: "room-a", viewerUserId: "user-a" });
    expect(reconciled.reconcile).toBe("recovered");
    expect(reconciled.accepted).toBe(true);
    expect(reconciled.changedRoomCount).toBe(1);
    expect(findHomeListRoomRow(peekBootstrapCache(), "room-a")?.lastMessage).toBe("timeline only");
    expect(findHomeListRoomRow(peekBootstrapCache(), "room-b")).toBe(beforeB);
  });
});
