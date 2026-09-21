// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CUT-2C: rooms-in message INSERT must reach messageInsertHintRef even when the
 * target room sits past the historical 180/90-chunk boundary (264 rooms, idx 202).
 * Root config defect: FILTER_MAX=90 produced ~3kB `in.(…)` strings that exceed
 * Realtime subscription btree (~2704B) while channel still reports SUBSCRIBED.
 */

type ChannelBuilder = (channel: {
  on: (
    type: string,
    filter: { event: string; schema: string; table: string; filter?: string },
    callback: (payload: unknown) => void
  ) => unknown;
}) => unknown;

type CapturedSub = {
  name: string;
  scope: string;
  chunkOffset: number | null | undefined;
  onStatus?: (status: string) => void;
  build: ChannelBuilder;
  messageInsertHandler: ((payload: unknown) => void) | null;
  messagesFilter: string | null;
};

const captured: CapturedSub[] = [];
const scheduleSpy = vi.fn();

vi.mock("@/lib/community-messenger/realtime/subscribe-with-retry", () => ({
  subscribeWithRetry: (args: {
    name: string;
    scope: string;
    onStatus?: (status: string) => void;
    hs4Context?: { chunkOffset?: number };
    build: ChannelBuilder;
  }) => {
    let messageInsertHandler: ((payload: unknown) => void) | null = null;
    let messagesFilter: string | null = null;
    const channel = {
      on(
        _type: string,
        filter: { event: string; schema: string; table: string; filter?: string },
        callback: (payload: unknown) => void
      ) {
        if (filter.table === "community_messenger_messages") {
          messageInsertHandler = callback;
          messagesFilter = filter.filter ?? null;
        }
        return channel;
      },
    };
    args.build(channel);
    captured.push({
      name: args.name,
      scope: args.scope,
      chunkOffset: args.hs4Context?.chunkOffset,
      onStatus: args.onStatus,
      build: args.build,
      messageInsertHandler,
      messagesFilter,
    });
    return { channel: {}, stop: () => {}, markSignal: () => {} };
  },
}));

vi.mock("@/lib/community-messenger/realtime/community-messenger-realtime-schedulers", () => ({
  createRefreshScheduler: () => ({ schedule: scheduleSpy, cancel: () => {} }),
}));

import {
  COMMUNITY_MESSENGER_HOME_ROOMS_IN_FILTER_BTREE_SAFE_BYTES,
  COMMUNITY_MESSENGER_HOME_ROOMS_IN_FILTER_MAX,
  bindCommunityMessengerHomeRealtimeChannels,
  buildCommunityMessengerHomeRoomsInFilters,
} from "@/lib/community-messenger/realtime/community-messenger-home-realtime-channels";
import {
  clearRoomActivityProjectionStateForTests,
  projectRoomActivityToHomeList,
  roomActivityFromMessageRow,
} from "@/lib/community-messenger/home/project-room-activity-to-home-list";
import {
  clearBootstrapCache,
  peekBootstrapCache,
  primeBootstrapCache,
} from "@/lib/community-messenger/bootstrap-cache";
import { findHomeListRoomRow } from "@/lib/community-messenger/home-list-patch";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

/** Deterministic UUIDs matching CUT-2B scale (264 membership). */
function makeRoomIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const hex = i.toString(16).padStart(12, "0");
    return `aaaaaaaa-bbbb-4ccc-8ddd-${hex}`;
  });
}

function seedBootstrap(roomId: string): void {
  const row = {
    id: roomId,
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
    unreadCount: 3,
    lastMessage: "stale old tip",
    lastMessageAt: "2026-09-21T09:59:09.730Z",
    lastMessageType: "text",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    chatDomain: "general_direct",
    domainIdentityKey: "gd:a:b",
  } as CommunityMessengerRoomSummary;
  primeBootstrapCache({
    me: { id: "viewer-cut2c" },
    tabs: { chats: 1, groups: 0, calls: 0, friends: 0 },
    chats: [row],
    groups: [],
    friends: [],
    following: [],
    hidden: [],
    blocked: [],
    discoverableGroups: [],
    requests: [],
    calls: [],
  } as unknown as CommunityMessengerBootstrap);
}

describe("CUT-2C home rooms-in filter chunk (btree-safe)", () => {
  beforeEach(() => {
    captured.length = 0;
    scheduleSpy.mockClear();
    clearBootstrapCache();
    clearRoomActivityProjectionStateForTests();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("keeps FILTER_MAX at the global-safe 50 (not legacy 90)", () => {
    expect(COMMUNITY_MESSENGER_HOME_ROOMS_IN_FILTER_MAX).toBe(50);
    expect(COMMUNITY_MESSENGER_HOME_ROOMS_IN_FILTER_MAX).toBeLessThanOrEqual(50);
  });

  it("legacy 90-UUID filter exceeds Realtime subscription btree safe bytes", () => {
    const legacy = makeRoomIds(90);
    const { messagesFilter } = buildCommunityMessengerHomeRoomsInFilters(legacy);
    expect(messagesFilter.length).toBeGreaterThan(COMMUNITY_MESSENGER_HOME_ROOMS_IN_FILTER_BTREE_SAFE_BYTES);
  });

  it("current max chunk filter stays under btree safe bytes", () => {
    const chunk = makeRoomIds(COMMUNITY_MESSENGER_HOME_ROOMS_IN_FILTER_MAX);
    const { messagesFilter, roomsFilter } = buildCommunityMessengerHomeRoomsInFilters(chunk);
    expect(messagesFilter.length).toBeLessThanOrEqual(COMMUNITY_MESSENGER_HOME_ROOMS_IN_FILTER_BTREE_SAFE_BYTES);
    expect(roomsFilter.length).toBeLessThanOrEqual(COMMUNITY_MESSENGER_HOME_ROOMS_IN_FILTER_BTREE_SAFE_BYTES);
  });

  it("CUT-2B scale: 264 rooms / idx 202 delivers INSERT into messageInsertHintRef → projector → patch", () => {
    const ROOM_COUNT = 264;
    const TARGET_IDX = 202;
    const roomIds = makeRoomIds(ROOM_COUNT);
    const targetRoomId = roomIds[TARGET_IDX]!;
    // Historical (MAX=90) chunk for this idx was :180 — must still be covered after MAX=50.
    const historicalChunkOffset = Math.floor(TARGET_IDX / 90) * 90;
    expect(historicalChunkOffset).toBe(180);

    const messageInsertHint = vi.fn();
    bindCommunityMessengerHomeRealtimeChannels({
      sb: { channel: () => ({}), removeChannel: () => {} } as never,
      userId: "viewer-cut2c",
      isCancelled: () => false,
      roomIdsFingerprint: roomIds.join("\0"),
      channelBindRole: "home_rooms_in",
      includeMeta: false,
      messageInsertHintRef: { current: messageInsertHint },
      messageUpdateHintRef: { current: undefined },
      roomTipUpdateHintRef: { current: undefined },
      participantUnreadDeltaRef: { current: undefined },
      onRefreshRef: { current: () => {} },
    });

    const roomsIn = captured.filter((c) => c.scope === "community-messenger-home:rooms-in");
    expect(roomsIn.length).toBe(Math.ceil(ROOM_COUNT / COMMUNITY_MESSENGER_HOME_ROOMS_IN_FILTER_MAX));

    const expectedOffset =
      Math.floor(TARGET_IDX / COMMUNITY_MESSENGER_HOME_ROOMS_IN_FILTER_MAX) *
      COMMUNITY_MESSENGER_HOME_ROOMS_IN_FILTER_MAX;
    expect(expectedOffset).toBe(200);

    const targetSub = roomsIn.find((c) => c.chunkOffset === expectedOffset);
    expect(targetSub).toBeTruthy();
    expect(targetSub!.messagesFilter).toContain(targetRoomId);
    expect(targetSub!.messagesFilter!.length).toBeLessThanOrEqual(
      COMMUNITY_MESSENGER_HOME_ROOMS_IN_FILTER_BTREE_SAFE_BYTES
    );
    expect(targetSub!.messageInsertHandler).toBeTypeOf("function");

    const messageId = "msg-cut2c-202";
    const createdAt = "2026-09-21T10:06:45.836+00:00";
    const content = "cut2c exact tip";
    const newRecord = {
      id: messageId,
      room_id: targetRoomId,
      sender_id: "peer-1",
      content,
      message_type: "text",
      created_at: createdAt,
    };
    targetSub!.messageInsertHandler!({
      eventType: "INSERT",
      new: newRecord,
    });

    expect(messageInsertHint).toHaveBeenCalledTimes(1);
    const hint = messageInsertHint.mock.calls[0]![0] as {
      roomId: string;
      newRecord: Record<string, unknown>;
    };
    expect(hint.roomId).toBe(targetRoomId);
    expect(hint.newRecord.id).toBe(messageId);

    seedBootstrap(targetRoomId);
    const activity = roomActivityFromMessageRow({
      roomId: targetRoomId,
      messageRow: newRecord,
      source: "remote_message_realtime",
      boostUnread: true,
      viewerUserId: "viewer-cut2c",
      chatDomain: "general_direct",
    });
    expect(activity).not.toBeNull();
    const projected = projectRoomActivityToHomeList(activity!);
    expect(projected.accepted).toBe(true);
    expect(findHomeListRoomRow(peekBootstrapCache(), targetRoomId)?.lastMessage).toBe(content);
  });

  it("does not schedule full sync on first SUBSCRIBED of rooms-in chunks (warm path cold-bind)", () => {
    const roomIds = makeRoomIds(264);
    bindCommunityMessengerHomeRealtimeChannels({
      sb: { channel: () => ({}), removeChannel: () => {} } as never,
      userId: "viewer-cut2c",
      isCancelled: () => false,
      roomIdsFingerprint: roomIds.join("\0"),
      channelBindRole: "home_rooms_in",
      includeMeta: true,
      messageInsertHintRef: { current: undefined },
      messageUpdateHintRef: { current: undefined },
      roomTipUpdateHintRef: { current: undefined },
      participantUnreadDeltaRef: { current: undefined },
      onRefreshRef: { current: () => {} },
    });
    for (const sub of captured) sub.onStatus?.("SUBSCRIBED");
    expect(scheduleSpy).not.toHaveBeenCalled();
  });
});
