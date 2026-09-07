import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveGroupMessageRoomKind,
  resolveNotificationMessageRoomKind,
} from "@/lib/community-messenger/group/group-room-notification-policy";
import { buildCanonicalNotificationRoomHref } from "@/lib/chat-domain/push/canonical-notification-room-route";
import { eventTypeForMessageRoomKind } from "@/lib/notifications/core/notification-policy";
import { resolveNotificationDestination } from "@/lib/notifications/resolve-notification-destination";
import { resolvePushRouteFromFcmData } from "@/lib/push/resolve-push-route-from-fcm-data";
import { resolveMessageNotificationRouteUrl } from "@/lib/notifications/display/build-message-notification-display";

describe("group message notify roomKind resolve", () => {
  it("post-ack effects prefer stored chat_domain for classification", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/server/community-messenger-send-post-ack-effects.ts"),
      "utf8"
    );
    expect(src).toContain('select("chat_domain, room_type, direct_key")');
    expect(src).toContain("resolveNotificationMessageRoomKind");
    expect(src).not.toContain("resolveGroupMessageRoomKind(roomType, directKey)");
    expect(src).toContain("Notify classification authority = stored `chat_domain`");
  });

  it("legacy send fallback includes chatDomain on postAckEffects", () => {
    const service = readFileSync(join(process.cwd(), "lib/community-messenger/service.ts"), "utf8");
    expect(service).toContain(
      'select("id, room_status, is_readonly, direct_key, deleted_at, room_type, chat_domain")'
    );
    expect(service).toContain("chatDomain: chatDomainStr");
    expect(service).toContain("roomType: roomTypeStr");
  });
});

describe("notification classification chat_domain authority", () => {
  it("maps stored chat_domain before legacy room_type/direct_key", () => {
    expect(
      resolveNotificationMessageRoomKind({
        chatDomain: "group",
        roomType: "direct",
        directKey: "aa:bb",
      })
    ).toBe("group");
    expect(
      resolveNotificationMessageRoomKind({
        chatDomain: "trade",
        roomType: "direct",
        directKey: null,
      })
    ).toBe("trade");
    expect(
      resolveNotificationMessageRoomKind({
        chatDomain: "store_order",
        roomType: "direct",
        directKey: "aa:bb",
      })
    ).toBe("store_order");
    expect(
      resolveNotificationMessageRoomKind({
        chatDomain: "general_direct",
        roomType: "private_group",
        directKey: null,
      })
    ).toBe("direct");
  });

  it("falls back to legacy inference only when chat_domain absent", () => {
    expect(resolveNotificationMessageRoomKind({ roomType: "private_group" })).toBe("group");
    expect(
      resolveNotificationMessageRoomKind({
        roomType: "direct",
        directKey: "trade_pc:x",
      })
    ).toBe("trade");
    expect(resolveGroupMessageRoomKind("open_group", "trade_pc:abc")).toBe("group");
  });

  it("maps kinds to canonical notification event types", () => {
    expect(eventTypeForMessageRoomKind("direct")).toBe("chat_message");
    expect(eventTypeForMessageRoomKind("group")).toBe("group_message");
    expect(eventTypeForMessageRoomKind("trade")).toBe("trade_message");
    expect(eventTypeForMessageRoomKind("store_order")).toBe("store_order_message");
  });
});

describe("4-domain exact-room notification routing", () => {
  const rooms = {
    general: "cm-general-uuid",
    group: "cm-group-uuid",
    trade: "cm-trade-uuid",
    order: "cm-order-uuid",
  } as const;

  it("GROUP push/resolver never emit legacy /group-chat/{CM uuid}", () => {
    expect(resolvePushRouteFromFcmData({ type: "group_message", roomId: rooms.group })).toBe(
      `/community-messenger/rooms/${rooms.group}`
    );
    expect(
      resolveNotificationDestination({
        resolverKey: "group_room",
        roomId: rooms.group,
      }).href
    ).toBe(`/community-messenger/rooms/${rooms.group}`);
    expect(resolveMessageNotificationRouteUrl("group", rooms.group)).toBe(
      `/community-messenger/rooms/${rooms.group}`
    );
    expect(buildCanonicalNotificationRoomHref({ roomId: rooms.group, chatDomain: "group" })).toBe(
      `/community-messenger/rooms/${rooms.group}`
    );
    expect(resolvePushRouteFromFcmData({ type: "group_message", roomId: rooms.group })).not.toContain(
      "/group-chat/"
    );
  });

  it("domain matrix: classification kind → exact CM room", () => {
    const matrix: Array<{
      domain: string;
      kind: "direct" | "group" | "trade" | "store_order";
      event: string;
      roomId: string;
      resolver: "chat_room" | "group_room" | "trade_room" | "store_order_room";
    }> = [
      {
        domain: "general_direct",
        kind: "direct",
        event: "chat_message",
        roomId: rooms.general,
        resolver: "chat_room",
      },
      {
        domain: "group",
        kind: "group",
        event: "group_message",
        roomId: rooms.group,
        resolver: "group_room",
      },
      {
        domain: "trade",
        kind: "trade",
        event: "trade_message",
        roomId: rooms.trade,
        resolver: "trade_room",
      },
      {
        domain: "store_order",
        kind: "store_order",
        event: "store_order_message",
        roomId: rooms.order,
        resolver: "store_order_room",
      },
    ];

    for (const row of matrix) {
      expect(resolveNotificationMessageRoomKind({ chatDomain: row.domain })).toBe(row.kind);
      expect(eventTypeForMessageRoomKind(row.kind)).toBe(row.event);
      const href = resolveNotificationDestination({
        resolverKey: row.resolver,
        roomId: row.roomId,
      }).href;
      expect(href).toBe(`/community-messenger/rooms/${row.roomId}`);
      expect(href).not.toContain("/group-chat/");
    }
  });

  it("cross-domain: same peers do not collapse TRADE → GENERAL room", () => {
    const tradeHref = resolveNotificationDestination({
      resolverKey: "trade_room",
      roomId: rooms.trade,
    }).href;
    const generalHref = resolveNotificationDestination({
      resolverKey: "chat_room",
      roomId: rooms.general,
    }).href;
    expect(tradeHref).toBe(`/community-messenger/rooms/${rooms.trade}`);
    expect(generalHref).toBe(`/community-messenger/rooms/${rooms.general}`);
    expect(tradeHref).not.toBe(generalHref);
  });

  it("cross-domain: ORDER A room id does not resolve to ORDER B", () => {
    const orderA = "cm-order-a";
    const orderB = "cm-order-b";
    expect(
      resolveNotificationDestination({ resolverKey: "store_order_room", roomId: orderA }).href
    ).toBe(`/community-messenger/rooms/${orderA}`);
    expect(
      resolveNotificationDestination({ resolverKey: "store_order_room", roomId: orderB }).href
    ).toBe(`/community-messenger/rooms/${orderB}`);
  });
});
