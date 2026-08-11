import { beforeEach, describe, expect, it } from "vitest";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import {
  mergeCommunityMessengerForegroundBootstrapIntoSnapshot,
  mergeCommunityMessengerMessageLists,
} from "@/lib/community-messenger/room/merge-community-messenger-foreground-bootstrap";
import { retainDeletedForEveryoneAt } from "@/lib/community-messenger/room/messenger-message-merge-authority";
import { mergePrimedTimelineSeedIntoExisting } from "@/lib/community-messenger/room/merge-primed-timeline-seed";
import { clearAllRoomSnapshotCaches, peekRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import {
  applyIncomingMessageEvent,
  getMessengerRealtimeRoomMessages,
  resetMessengerRealtimeStore,
  seedMessengerRealtimeFromRoomSnapshot,
} from "@/lib/community-messenger/stores/messenger-realtime-store";
import type { CommunityMessengerMessage, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

const ROOM_ID = "a4b49e55-a95f-4872-88a5-cc309f3d9814";
const VIEWER = "11111111-1111-1111-1111-111111111111";

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function msg(n: number, extra?: Partial<CommunityMessengerMessage>): CommunityMessengerMessage {
  return {
    id: uuid(n),
    roomId: ROOM_ID,
    senderId: extra?.isMine === false ? "22222222-2222-2222-2222-222222222222" : VIEWER,
    senderLabel: "User",
    messageType: extra?.messageType ?? "text",
    content: extra?.content ?? `m${n}`,
    createdAt: `2026-08-11T00:00:${String(n).padStart(2, "0")}.000Z`,
    clientMessageId: extra?.clientMessageId ?? null,
    isMine: extra?.isMine ?? true,
    ...extra,
  };
}

function bootstrapWindow(count: number): CommunityMessengerMessage[] {
  return Array.from({ length: count }, (_, i) => msg(i + 1));
}

function snapshotOf(messages: CommunityMessengerMessage[]): CommunityMessengerRoomSnapshot {
  return {
    viewerUserId: VIEWER,
    myRole: "member",
    room: {
      id: ROOM_ID,
      title: "Test",
      roomType: "direct",
      unreadCount: 0,
      lastMessage: messages.at(-1)?.content ?? "",
      lastMessageAt: messages.at(-1)?.createdAt ?? "2026-08-11T00:00:00.000Z",
      memberCount: 2,
      roomStatus: "active",
      isReadonly: false,
      visibility: "private",
      joinPolicy: "invite",
      identityPolicy: "real_name",
      description: "",
      summary: null,
      isMuted: false,
      isPinned: false,
    },
    members: [],
    messages,
    activeCall: null,
  } as unknown as CommunityMessengerRoomSnapshot;
}

describe("T1/T2 messenger timeline monotonic merge", () => {
  beforeEach(() => {
    resetMessengerRealtimeStore();
    clearAllRoomSnapshotCaches();
  });

  it("T1 outbound confirmed survives stale bootstrap-20 seed on re-entry", () => {
    const boot20 = bootstrapWindow(20);
    seedMessengerRealtimeFromRoomSnapshot(snapshotOf(boot20));
    applyIncomingMessageEvent({
      viewerUserId: VIEWER,
      roomId: ROOM_ID,
      message: msg(21),
    });
    expect(getMessengerRealtimeRoomMessages(ROOM_ID).map((m) => m.id)).toContain(uuid(21));

    seedMessengerRealtimeFromRoomSnapshot(snapshotOf(boot20));
    const afterStaleSeed = getMessengerRealtimeRoomMessages(ROOM_ID).map((m) => m.id);
    expect(afterStaleSeed).toContain(uuid(21));
    expect(afterStaleSeed).toHaveLength(21);

    const remount = mergePrimedTimelineSeedIntoExisting({
      roomId: ROOM_ID,
      prev: [],
      seed: boot20,
    });
    expect(remount.map((m) => m.id)).toContain(uuid(21));
    expect(peekRoomSnapshot(ROOM_ID, VIEWER)?.messages.map((m) => m.id)).toContain(uuid(21));
  });

  it("T2 inbound realtime survives stale seed apply", () => {
    const boot20 = bootstrapWindow(20);
    seedMessengerRealtimeFromRoomSnapshot(snapshotOf(boot20));
    applyIncomingMessageEvent({
      viewerUserId: VIEWER,
      roomId: ROOM_ID,
      message: msg(31, { isMine: false, content: "from peer" }),
    });
    seedMessengerRealtimeFromRoomSnapshot(snapshotOf(boot20));
    const remount = mergePrimedTimelineSeedIntoExisting({
      roomId: ROOM_ID,
      prev: [],
      seed: boot20,
    });
    expect(remount.map((m) => m.id)).toContain(uuid(31));
    expect(remount.find((m) => m.id === uuid(31))?.content).toBe("from peer");
  });

  it("T5 optimistic + confirmed + realtime echo + catch-up is one id", () => {
    const clientMessageId = "cid-t5";
    const optimistic = {
      ...msg(21),
      id: "pending:local",
      pending: true,
      clientMessageId,
    };
    const server = msg(21, { clientMessageId, content: "hello" });
    const afterOptimistic = mergeRoomMessages([], [optimistic]);
    const afterAck = mergeRoomMessages(afterOptimistic, [server]);
    const afterEcho = mergeRoomMessages(afterAck, [server]);
    const afterCatchUp = mergeRoomMessages(afterEcho, [server]);
    expect(afterCatchUp).toHaveLength(1);
    expect(afterCatchUp[0]?.id).toBe(uuid(21));
    expect(afterCatchUp[0]?.pending).toBeFalsy();
  });

  it("T6 older pagination union does not delete newer delta rows", () => {
    const newer = [msg(20), msg(21), msg(22)];
    const older = [msg(1), msg(2), msg(3)];
    const merged = mergeRoomMessages(newer, older);
    expect(merged.map((m) => m.id)).toEqual([
      uuid(1),
      uuid(2),
      uuid(3),
      uuid(20),
      uuid(21),
      uuid(22),
    ]);
  });

  it("T7 general/group/trade/store_order rows survive stale general bootstrap", () => {
    const boot20 = bootstrapWindow(20);
    const extras: CommunityMessengerMessage[] = [
      msg(21, { content: "general" }),
      msg(22, {
        messageType: "system",
        content: "주문 접수",
        metadata: { domain: "store_order", orderStatus: "accepted" },
        isMine: false,
      }),
      msg(23, {
        messageType: "system",
        content: "예약 확정",
        metadata: { domain: "trade", lineKind: "status" },
        isMine: false,
      }),
    ];
    const prevSnap = snapshotOf([...boot20, ...extras]);
    const staleBoot = snapshotOf(boot20);
    const merged = mergeCommunityMessengerForegroundBootstrapIntoSnapshot(prevSnap, staleBoot);
    const ids = merged.messages.map((m) => m.id);
    expect(ids).toContain(uuid(21));
    expect(ids).toContain(uuid(22));
    expect(ids).toContain(uuid(23));
    expect(merged.messages.find((m) => m.id === uuid(22))?.metadata).toEqual({
      domain: "store_order",
      orderStatus: "accepted",
    });
  });

  it("T10 tombstone survives stale seed without deletedForEveryoneAt", () => {
    const live = msg(21, { deletedForEveryoneAt: "2026-08-11T00:01:00.000Z", content: "" });
    const stale = msg(21, { content: "should not resurrect" });
    const merged = mergeCommunityMessengerMessageLists([live], [stale]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.deletedForEveryoneAt).toBe("2026-08-11T00:01:00.000Z");
    expect(retainDeletedForEveryoneAt("2026-08-11T00:01:00.000Z", null)).toBe("2026-08-11T00:01:00.000Z");
    const viaRoom = mergeRoomMessages([live], [stale]);
    expect(viaRoom[0]?.deletedForEveryoneAt).toBe("2026-08-11T00:01:00.000Z");
  });

  it("T11 edited row is authoritative on same id", () => {
    const original = msg(21, { content: "hello" });
    const edited = msg(21, { content: "hello (edited)" });
    const merged = mergeCommunityMessengerMessageLists([original], [edited]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.content).toBe("hello (edited)");
  });

  it("T12 older pagination and newer catch-up coexist", () => {
    const newest20 = bootstrapWindow(20).concat([msg(21), msg(22), msg(23)]);
    const olderPage = Array.from({ length: 20 }, (_, i) => msg(i + 24));
    const older = olderPage.map((m, i) => ({
      ...m,
      id: uuid(i + 1),
      createdAt: `2026-08-10T00:00:${String(i + 1).padStart(2, "0")}.000Z`,
      content: `old${i + 1}`,
    }));
    const afterCatchUp = mergeRoomMessages(newest20, [msg(21), msg(22), msg(23)]);
    const afterOlder = mergeRoomMessages(afterCatchUp, older);
    const ids = afterOlder.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(uuid(1));
    expect(ids).toContain(uuid(23));
    expect(afterOlder[0]?.id).toBe(uuid(1));
    expect(afterOlder.at(-1)?.id).toBe(uuid(23));
  });
});
