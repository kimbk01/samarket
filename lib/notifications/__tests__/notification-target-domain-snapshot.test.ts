import { describe, expect, it } from "vitest";
import { buildMessengerChatRoomUnreadTargetRoomIds } from "@/lib/messenger/contracts/chat-room-unread-from-notification-targets";
import {
  buildNotificationBadgeProjection,
  EMPTY_NON_CHAT_EVENT_ATTENTION,
} from "@/lib/notifications/build-notification-badge-projection";
import {
  classifyExistingTargetDomainPair,
  decideNotificationTargetDomainSnapshot,
  isRoomBasedNotificationTargetType,
  resolveRoomDomainEnvelopeForTargetSnapshot,
} from "@/lib/notifications/notification-target-domain-snapshot";

const GD_ROOM = {
  id: "11111111-1111-1111-1111-111111111111",
  chat_domain: "general_direct",
  domain_identity_key: "general_direct:aaa:bbb",
};

const GROUP_ROOM = {
  id: "22222222-2222-2222-2222-222222222222",
  chat_domain: "group",
  domain_identity_key: "group:g1",
};

const TRADE_ROOM = {
  id: "33333333-3333-3333-3333-333333333333",
  chat_domain: "trade",
  domain_identity_key: "trade:item1:seller1:buyer1",
};

const SO_ROOM = {
  id: "44444444-4444-4444-4444-444444444444",
  chat_domain: "store_order",
  domain_identity_key: "store_order:order-1",
};

describe("notification-target-domain-snapshot (A–O)", () => {
  it("A. 신규 GD — write general_direct pair", () => {
    const room = resolveRoomDomainEnvelopeForTargetSnapshot(GD_ROOM);
    const d = decideNotificationTargetDomainSnapshot({
      targetType: "chat_room",
      existing: null,
      roomEnvelope: room,
    });
    expect(d).toEqual({
      action: "write",
      chatDomain: "general_direct",
      domainIdentityKey: "general_direct:aaa:bbb",
      reason: "insert",
    });
  });

  it("B. 신규 Group — write group pair", () => {
    const d = decideNotificationTargetDomainSnapshot({
      targetType: "chat_room",
      existing: null,
      roomEnvelope: resolveRoomDomainEnvelopeForTargetSnapshot(GROUP_ROOM),
    });
    expect(d.action).toBe("write");
    if (d.action === "write") {
      expect(d.chatDomain).toBe("group");
      expect(d.domainIdentityKey).toBe("group:g1");
    }
  });

  it("C. 신규 Trade — write trade pair", () => {
    const d = decideNotificationTargetDomainSnapshot({
      targetType: "trade",
      existing: null,
      roomEnvelope: resolveRoomDomainEnvelopeForTargetSnapshot(TRADE_ROOM),
    });
    expect(d.action).toBe("write");
    if (d.action === "write") expect(d.chatDomain).toBe("trade");
  });

  it("D. 신규 Store Order — write store_order pair", () => {
    const d = decideNotificationTargetDomainSnapshot({
      targetType: "buyer_order",
      existing: null,
      roomEnvelope: resolveRoomDomainEnvelopeForTargetSnapshot(SO_ROOM),
    });
    expect(d.action).toBe("write");
    if (d.action === "write") expect(d.chatDomain).toBe("store_order");
  });

  it("E. 기존 Domain 모두 NULL — fill_null_pair", () => {
    const d = decideNotificationTargetDomainSnapshot({
      targetType: "chat_room",
      existing: { chatDomain: null, domainIdentityKey: null },
      roomEnvelope: resolveRoomDomainEnvelopeForTargetSnapshot(GD_ROOM),
    });
    expect(d).toMatchObject({ action: "write", reason: "fill_null_pair" });
  });

  it("F. 기존 Domain 일치 — keep", () => {
    const d = decideNotificationTargetDomainSnapshot({
      targetType: "chat_room",
      existing: {
        chatDomain: "general_direct",
        domainIdentityKey: "general_direct:aaa:bbb",
      },
      roomEnvelope: resolveRoomDomainEnvelopeForTargetSnapshot(GD_ROOM),
    });
    expect(d).toEqual({ action: "keep", reason: "already_matched" });
  });

  it("G. 기존 Domain 불일치 — overwrite 금지", () => {
    const d = decideNotificationTargetDomainSnapshot({
      targetType: "chat_room",
      existing: {
        chatDomain: "group",
        domainIdentityKey: "group:other",
      },
      roomEnvelope: resolveRoomDomainEnvelopeForTargetSnapshot(GD_ROOM),
    });
    expect(d.action).toBe("skip");
    if (d.action === "skip" && d.reason === "domain_mismatch") {
      expect(d.existing.chatDomain).toBe("group");
      expect(d.room.chatDomain).toBe("general_direct");
    } else {
      expect.fail("expected domain_mismatch");
    }
  });

  it("H. partial Domain — 자동 복구 금지", () => {
    expect(classifyExistingTargetDomainPair({ chatDomain: "general_direct", domainIdentityKey: null })).toBe(
      "partial"
    );
    const d = decideNotificationTargetDomainSnapshot({
      targetType: "chat_room",
      existing: { chatDomain: "general_direct", domainIdentityKey: null },
      roomEnvelope: resolveRoomDomainEnvelopeForTargetSnapshot(GD_ROOM),
    });
    expect(d).toEqual({ action: "skip", reason: "partial_existing" });
  });

  it("I. room Domain 불완전 — snapshot 금지", () => {
    const room = resolveRoomDomainEnvelopeForTargetSnapshot({
      id: GD_ROOM.id,
      chat_domain: "general_direct",
      domain_identity_key: null,
      domain_identity: null,
    });
    expect(room).toBeNull();
    const d = decideNotificationTargetDomainSnapshot({
      targetType: "chat_room",
      existing: null,
      roomEnvelope: room,
    });
    expect(d).toEqual({ action: "skip", reason: "room_incomplete" });
  });

  it("J. room 없음 — snapshot 금지", () => {
    const d = decideNotificationTargetDomainSnapshot({
      targetType: "chat_room",
      existing: null,
      roomEnvelope: null,
    });
    expect(d).toEqual({ action: "skip", reason: "room_incomplete" });
  });

  it("K. non-room notification — Domain skip", () => {
    expect(isRoomBasedNotificationTargetType("store_review")).toBe(false);
    const d = decideNotificationTargetDomainSnapshot({
      targetType: "store_review",
      existing: null,
      roomEnvelope: resolveRoomDomainEnvelopeForTargetSnapshot(GD_ROOM),
    });
    expect(d).toEqual({ action: "skip", reason: "non_room_target" });
  });

  it("L. retry/idempotency — matched keep (identity 불변)", () => {
    const first = decideNotificationTargetDomainSnapshot({
      targetType: "chat_room",
      existing: null,
      roomEnvelope: resolveRoomDomainEnvelopeForTargetSnapshot(GD_ROOM),
    });
    expect(first.action).toBe("write");
    const second = decideNotificationTargetDomainSnapshot({
      targetType: "chat_room",
      existing: {
        chatDomain: "general_direct",
        domainIdentityKey: "general_direct:aaa:bbb",
      },
      roomEnvelope: resolveRoomDomainEnvelopeForTargetSnapshot(GD_ROOM),
    });
    expect(second).toEqual({ action: "keep", reason: "already_matched" });
  });

  it("M. consumer — snapshot GD target included in loader set builder", () => {
    const ids = buildMessengerChatRoomUnreadTargetRoomIds(
      [
        {
          target_id: GD_ROOM.id,
          chat_domain: "general_direct",
          target_type: "chat_room",
          is_unread: true,
        },
        {
          target_id: "null-domain-room",
          chat_domain: null,
          target_type: "chat_room",
          is_unread: true,
        },
      ],
      ["general_direct"]
    );
    expect(ids.has(GD_ROOM.id)).toBe(true);
    expect(ids.has("null-domain-room")).toBe(false);
  });

  it("N. Bottom 경계 — GD/group only in Bell bottomChat", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 1, trade: 2, store_order: 3 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
    });
    expect(p.bottomChat).toBe(2);
    expect(p.tradeHub).toBe(2);
    expect(p.storeOrderHub).toBe(3);
  });

  it("O. Bell Phase B — room facts alone do not set Bell; NotificationAttention does", () => {
    const roomsOnly = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 1, trade: 1, store_order: 1 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
    });
    expect(roomsOnly.bellTotal).toBe(0);
    expect(roomsOnly.bottomChat).toBe(2);
    const withEvents = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 1, trade: 1, store_order: 1 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      notificationAttentionTotal: 4,
    });
    expect(withEvents.bellTotal).toBe(4);
  });

  it("rejects peer invent / unsorted GD identity", () => {
    expect(
      resolveRoomDomainEnvelopeForTargetSnapshot({
        id: "r1",
        chat_domain: "general_direct",
        domain_identity_key: "general_direct:zzz:aaa",
      })
    ).toBeNull();
  });
});
