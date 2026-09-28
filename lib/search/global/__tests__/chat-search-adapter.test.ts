import { describe, expect, it } from "vitest";
import {
  classifyGlobalSearchChatRoom,
  filterMembershipRoomsForGlobalSearch,
} from "@/lib/search/global/adapters/chat-search-adapter";
import { parseCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { buildSearchHighlightSegments } from "@/lib/search/global/semantics/highlight";

function room(
  overrides: Partial<CommunityMessengerRoomSummary> & Pick<CommunityMessengerRoomSummary, "id" | "title">
): CommunityMessengerRoomSummary {
  return {
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
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
    ...overrides,
  } as CommunityMessengerRoomSummary;
}

describe("global chat search adapter", () => {
  it("splits direct / group / trade / order and hides archived", () => {
    const rooms = [
      room({ id: "d1", title: "치킨 direct", roomType: "direct", chatDomain: "general_direct" }),
      room({ id: "g1", title: "치킨 group", roomType: "private_group", chatDomain: "group" }),
      room({ id: "t1", title: "치킨 trade", roomType: "direct", chatDomain: "trade" }),
      room({ id: "o1", title: "치킨 order", roomType: "direct", chatDomain: "store_order" }),
      room({
        id: "a1",
        title: "치킨 archived",
        roomType: "direct",
        chatDomain: "general_direct",
        isArchivedByViewer: true,
      }),
    ];
    const hits = filterMembershipRoomsForGlobalSearch(rooms, "치킨");
    expect(hits.map((h) => `${h.kind}:${h.room.id}`)).toEqual([
      "direct:d1",
      "group:g1",
      "trade:t1",
      "order:o1",
    ]);
    expect(classifyGlobalSearchChatRoom(rooms[4]!)).toBeNull();
  });

  it("does not match message-body-only text outside allowed preview fields", () => {
    const rooms = [
      room({
        id: "secret",
        title: "peer",
        subtitle: "",
        summary: "",
        lastMessage: "",
        roomType: "direct",
        chatDomain: "general_direct",
      }),
    ];
    expect(filterMembershipRoomsForGlobalSearch(rooms, "secret-body")).toEqual([]);
    expect(
      filterMembershipRoomsForGlobalSearch(
        [
          room({
            id: "ok",
            title: "peer",
            lastMessage: "secret-body preview",
            roomType: "direct",
            chatDomain: "general_direct",
          }),
        ],
        "secret-body"
      )
    ).toHaveLength(1);
  });
});

const DELIVERY_ENVELOPE = JSON.stringify({
  v: 1,
  kind: "delivery",
  headline: "나의 오른손쌀빵",
  storeOrderId: "ord-internal-오른",
});

describe("C1–C7 chat structured message search", () => {
  it("C1 — plain lastMessage matches 오른 without JSON", () => {
    const hits = filterMembershipRoomsForGlobalSearch(
      [
        room({
          id: "plain",
          title: "친구",
          lastMessage: "오늘 오른쪽에서 만나요",
          chatDomain: "general_direct",
        }),
      ],
      "오른"
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.matchedField).toBe("lastMessage");
    expect(hits[0]?.preview).toContain("오른쪽에서");
    expect(hits[0]?.preview).not.toContain("{");
  });

  it("C2 — delivery envelope headline is searchable and preview is canonical display", () => {
    const contextMeta = parseCommunityMessengerRoomContextMeta(DELIVERY_ENVELOPE);
    const hits = filterMembershipRoomsForGlobalSearch(
      [
        room({
          id: "order-1",
          title: "테스트1",
          summary: DELIVERY_ENVELOPE,
          lastMessage: DELIVERY_ENVELOPE,
          lastMessageType: "text",
          contextMeta,
          chatDomain: "store_order",
        }),
      ],
      "오른"
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe("order");
    expect(hits[0]?.preview).toBe("나의 오른손쌀빵");
    expect(hits[0]?.preview).not.toContain('"kind"');
    expect(hits[0]?.preview).not.toContain("{");
    expect(hits[0]?.matchedField).toBe("summary");
  });

  it("C3 — query only in envelope metadata is not a match", () => {
    const raw = JSON.stringify({
      v: 1,
      kind: "delivery",
      headline: "주문 확인",
      storeOrderId: "ord-오른-hidden",
    });
    const hits = filterMembershipRoomsForGlobalSearch(
      [
        room({
          id: "meta-only",
          title: "테스트1",
          summary: raw,
          lastMessage: raw,
          contextMeta: parseCommunityMessengerRoomContextMeta(raw),
          chatDomain: "store_order",
        }),
      ],
      "오른"
    );
    expect(hits).toEqual([]);
  });

  it("C4 — JSON key tokens kind/delivery do not match", () => {
    const contextMeta = parseCommunityMessengerRoomContextMeta(DELIVERY_ENVELOPE);
    const rooms = [
      room({
        id: "json-keys",
        title: "테스트1",
        summary: DELIVERY_ENVELOPE,
        lastMessage: DELIVERY_ENVELOPE,
        contextMeta,
        chatDomain: "store_order",
      }),
    ];
    expect(filterMembershipRoomsForGlobalSearch(rooms, "kind")).toEqual([]);
    expect(filterMembershipRoomsForGlobalSearch(rooms, "delivery")).toEqual([]);
  });

  it("C5 — highlight 오른 inside canonical display text", () => {
    const contextMeta = parseCommunityMessengerRoomContextMeta(DELIVERY_ENVELOPE);
    const hits = filterMembershipRoomsForGlobalSearch(
      [
        room({
          id: "hl",
          title: "테스트1",
          summary: DELIVERY_ENVELOPE,
          contextMeta,
          chatDomain: "store_order",
        }),
      ],
      "오른"
    );
    expect(hits[0]?.preview).toBe("나의 오른손쌀빵");
    const segments = buildSearchHighlightSegments(hits[0]!.preview, "오른");
    expect(segments.some((s) => s.matched && s.text === "오른")).toBe(true);
    expect(segments.map((s) => s.text).join("")).toBe("나의 오른손쌀빵");
  });

  it("C6 — same room id appears once even if chats+groups duplicate the row", () => {
    const contextMeta = parseCommunityMessengerRoomContextMeta(DELIVERY_ENVELOPE);
    const dup = room({
      id: "same-room",
      title: "테스트1",
      summary: DELIVERY_ENVELOPE,
      contextMeta,
      chatDomain: "store_order",
    });
    const hits = filterMembershipRoomsForGlobalSearch([dup, { ...dup }], "오른");
    expect(hits.map((h) => h.room.id)).toEqual(["same-room"]);
  });

  it("C7 — distinct room ids with the same title are both allowed", () => {
    const contextMeta = parseCommunityMessengerRoomContextMeta(DELIVERY_ENVELOPE);
    const hits = filterMembershipRoomsForGlobalSearch(
      [
        room({
          id: "r-a",
          title: "테스트1",
          summary: DELIVERY_ENVELOPE,
          contextMeta,
          chatDomain: "store_order",
        }),
        room({
          id: "r-b",
          title: "테스트1",
          summary: DELIVERY_ENVELOPE,
          contextMeta,
          chatDomain: "store_order",
        }),
      ],
      "오른"
    );
    expect(hits.map((h) => h.room.id)).toEqual(["r-a", "r-b"]);
  });
});
