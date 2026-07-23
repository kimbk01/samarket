import { describe, expect, it } from "vitest";
import {
  buildTradeUnreadTargetIdentityKeys,
  resolveTradeListUnreadCount,
  TRADE_UNREAD_TARGET_TYPE,
} from "@/lib/messenger/trade/unread-from-notification-targets";

describe("trade unread from notification_targets", () => {
  it("exposes the target type used by hub-bundle chat_domain_trade axis", () => {
    expect(TRADE_UNREAD_TARGET_TYPE).toBe("trade");
  });

  describe("match key = domain_identity_key (NOT target_id)", () => {
    it("zeros stale participant unread when room's identity has no trade target", () => {
      const keys = new Set(["trade:item-1:seller-a:buyer-b"]);
      expect(
        resolveTradeListUnreadCount({
          domainIdentityKey: "trade:item-2:seller-x:buyer-y",
          unreadTargetIdentityKeys: keys,
          participantUnreadCount: 29,
        })
      ).toBe(0);
    });

    it("keeps message magnitude when identity key present", () => {
      const keys = new Set(["trade:item-1:seller-a:buyer-b"]);
      expect(
        resolveTradeListUnreadCount({
          domainIdentityKey: "trade:item-1:seller-a:buyer-b",
          unreadTargetIdentityKeys: keys,
          participantUnreadCount: 3,
        })
      ).toBe(3);
      expect(
        resolveTradeListUnreadCount({
          domainIdentityKey: "trade:item-1:seller-a:buyer-b",
          unreadTargetIdentityKeys: keys,
          participantUnreadCount: 0,
        })
      ).toBe(1);
    });

    it("does not match on the bare target_id shape (postId:sellerId:buyerId, no trade: prefix)", () => {
      // target_id for trade is buildTradeTargetId(postId, sellerId, buyerId) — no "trade:" prefix.
      // A caller must never index by that value; only domain_identity_key.
      const targetIdShapedKeys = new Set(["item-1:seller-a:buyer-b"]);
      expect(
        resolveTradeListUnreadCount({
          domainIdentityKey: "trade:item-1:seller-a:buyer-b",
          unreadTargetIdentityKeys: targetIdShapedKeys,
          participantUnreadCount: 5,
        })
      ).toBe(0);
    });
  });

  it("buildTradeUnreadTargetIdentityKeys filters type/domain/is_unread", () => {
    const keys = buildTradeUnreadTargetIdentityKeys([
      {
        domain_identity_key: "trade:item-1:seller-a:buyer-b",
        target_type: "trade",
        chat_domain: "trade",
        is_unread: true,
      },
      {
        domain_identity_key: "trade:item-2:seller-c:buyer-d",
        target_type: "trade",
        chat_domain: "trade",
        is_unread: false,
      },
      {
        domain_identity_key: "general_direct:a:b",
        target_type: "chat_room",
        chat_domain: "general_direct",
        is_unread: true,
      },
      {
        domain_identity_key: "trade:item-3:seller-e:buyer-f",
        target_type: "buyer_order",
        chat_domain: "trade",
        is_unread: true,
      },
    ]);
    expect([...keys]).toEqual(["trade:item-1:seller-a:buyer-b"]);
  });
});
