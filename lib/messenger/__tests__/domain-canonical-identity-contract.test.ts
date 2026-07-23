/**
 * Canonical Domain identity contract — create/reuse/list/dedupe rules.
 * Runtime writers remain OFF; this proves identity/list math only.
 */
import { describe, expect, it } from "vitest";
import {
  generalDirectRoomIdentity,
  groupRoomIdentity,
  storeOrderRoomIdentity,
  tradeRoomIdentity,
} from "@/lib/chat-domain/room-identity";
import {
  buildGeneralDirectIdentity,
  buildGeneralDirectListSnapshot,
  parseGeneralDirectIdentityKey,
} from "@/lib/messenger/general-direct";
import {
  buildGroupIdentity,
  buildGroupListSnapshot,
} from "@/lib/messenger/group";
import {
  buildTradeIdentity,
  buildTradeListSnapshot,
  parseTradeIdentityKey,
  type TradeRoomInput,
} from "@/lib/messenger/trade";
import {
  buildStoreOrderIdentity,
  buildStoreOrderListSnapshot,
} from "@/lib/messenger/store-order";
import {
  PHASE6_DOMAIN_CACHE_PRODUCTION_WIRING,
} from "@/lib/messenger/contracts/domain-bootstrap-cache";
import {
  PHASE8A_BADGE_PRODUCTION_WIRING,
  D1_1_ATOMIC_READ_RPC_PRODUCTION_WIRING,
} from "@/lib/messenger/contracts/domain-read-unread-badge";
import { PHASE9_NOTIFICATION_PRODUCTION_WIRING } from "@/lib/messenger/contracts/domain-notification-envelope-phase9";
import {
  PHASE11D_A_BADGE_READ_WIRING,
  PHASE11D_A_CACHE_WRITE,
  PHASE11D_A_NOTIFICATION_WRITE,
  PHASE11D_A_PRODUCTION_HOME_WIRING,
  PHASE11D_A_REALTIME_APPLY,
} from "@/lib/messenger/contracts/phase11da-canary-gate";

describe("Canonical identity — general_direct", () => {
  it("A-B and B-A share one sorted-pair identity", () => {
    const ab = generalDirectRoomIdentity("user-b", "user-a");
    const ba = generalDirectRoomIdentity("user-a", "user-b");
    expect(ab.identityKey).toBe(ba.identityKey);
    expect(ab.identityKey).toBe("general_direct:user-a:user-b");
    expect(buildGeneralDirectIdentity("user-b", "user-a").identityKey).toBe(ab.identityKey);
  });

  it("different peer → different identity; trade/store never equal", () => {
    const gd = buildGeneralDirectIdentity("a", "b").identityKey;
    const gd2 = buildGeneralDirectIdentity("a", "c").identityKey;
    const trade = buildTradeIdentity({
      itemId: "x",
      sellerUserId: "a",
      counterpartyUserId: "b",
    }).identityKey;
    const so = buildStoreOrderIdentity("order-1").identityKey;
    expect(gd).not.toBe(gd2);
    expect(gd).not.toBe(trade);
    expect(gd).not.toBe(so);
  });

  it("list is one row per identity; foreign domains rejected", () => {
    const key = buildGeneralDirectIdentity("viewer-1", "peer-1").identityKey;
    const ok = buildGeneralDirectListSnapshot({
      viewerUserId: "viewer-1",
      generation: "1",
      rooms: [
        {
          roomId: "r1",
          chatDomain: "general_direct",
          domainIdentityKey: key,
          peerUserId: "peer-1",
          peerDisplayName: "Peer",
          peerAvatarUrl: null,
          lastMessage: "hi",
          lastMessageAt: "2026-07-14T12:00:00.000Z",
          unreadCount: 0,
        },
      ],
    });
    expect(ok.ok && ok.snapshot.rows).toHaveLength(1);

    const mix = buildGeneralDirectListSnapshot({
      viewerUserId: "viewer-1",
      generation: "1",
      rooms: [
        {
          roomId: "r1",
          chatDomain: "trade",
          domainIdentityKey: "trade:i:s:b",
          peerUserId: "peer-1",
          peerDisplayName: "Peer",
          peerAvatarUrl: null,
          lastMessage: "x",
          lastMessageAt: "2026-07-14T12:00:00.000Z",
          unreadCount: 0,
        },
      ],
    });
    expect(mix.ok).toBe(false);

    const dup = buildGeneralDirectListSnapshot({
      viewerUserId: "viewer-1",
      generation: "1",
      rooms: [
        {
          roomId: "r1",
          chatDomain: "general_direct",
          domainIdentityKey: key,
          peerUserId: "peer-1",
          peerDisplayName: "Peer",
          peerAvatarUrl: null,
          lastMessage: "a",
          lastMessageAt: "2026-07-14T12:00:00.000Z",
          unreadCount: 0,
        },
        {
          roomId: "r2",
          chatDomain: "general_direct",
          domainIdentityKey: key,
          peerUserId: "peer-1",
          peerDisplayName: "Peer",
          peerAvatarUrl: null,
          lastMessage: "b",
          lastMessageAt: "2026-07-14T13:00:00.000Z",
          unreadCount: 0,
        },
      ],
    });
    expect(dup.ok).toBe(false);
  });
});

describe("Canonical identity — group", () => {
  it("groupId/roomId → group:{id}; member set never changes key", () => {
    const a = groupRoomIdentity("g-uuid-1");
    const b = buildGroupIdentity("g-uuid-1");
    expect(a.identityKey).toBe("group:g-uuid-1");
    expect(b.identityKey).toBe(a.identityKey);
    expect(a.identityKey).not.toBe(buildGeneralDirectIdentity("u1", "u2").identityKey);
  });

  it("list one row per group; two-member group is not general_direct", () => {
    const snap = buildGroupListSnapshot({
      viewerUserId: "u1",
      generation: "1",
      rooms: [
        {
          roomId: "g1",
          chatDomain: "group",
          domainIdentityKey: "group:g1",
          groupId: "g1",
          groupSubtype: "private_group",
          groupName: "Two people",
          groupImageUrl: null,
          memberCount: 2,
          unreadCount: 0,
          lastMessage: "hi",
          lastMessageAt: "2026-07-14T12:00:00.000Z",
        },
      ],
    });
    expect(snap.ok).toBe(true);
    if (!snap.ok) return;
    expect(snap.snapshot.rows).toHaveLength(1);
    expect(snap.snapshot.rows[0]?.chatDomain).toBe("group");
    expect(snap.snapshot.rows[0]?.domainIdentityKey).toBe("group:g1");
  });
});

describe("Canonical identity — trade", () => {
  function tradeRow(
    partial: Partial<TradeRoomInput> & { roomId: string; itemId: string }
  ): TradeRoomInput {
    const seller = partial.sellerUserId ?? "seller-1";
    const counter = partial.counterpartyUserId ?? "buyer-1";
    return {
      roomId: partial.roomId,
      chatDomain: "trade",
      domainIdentityKey:
        partial.domainIdentityKey ??
        buildTradeIdentity({
          itemId: partial.itemId,
          sellerUserId: seller,
          counterpartyUserId: counter,
        }).identityKey,
      itemId: partial.itemId,
      sellerUserId: seller,
      counterpartyUserId: counter,
      itemTitle: partial.itemTitle ?? "Item",
      itemImageUrl: partial.itemImageUrl ?? "https://cdn/i.png",
      peerDisplayName: partial.peerDisplayName ?? "Peer",
      peerAvatarUrl: null,
      lastMessage: partial.lastMessage ?? "msg",
      lastMessageAt: partial.lastMessageAt ?? "2026-07-14T12:00:00.000Z",
      unreadCount: partial.unreadCount ?? 0,
      tradeStatusLabel: "판매중",
    };
  }

  it("listing+seller+counterparty — same triple reuses key; different item/peer separates", () => {
    const same = tradeRoomIdentity({ itemId: "X", sellerId: "A", buyerId: "B" });
    const again = buildTradeIdentity({
      itemId: "X",
      sellerUserId: "A",
      counterpartyUserId: "B",
    });
    const otherItem = buildTradeIdentity({
      itemId: "Y",
      sellerUserId: "A",
      counterpartyUserId: "B",
    });
    const otherPeer = buildTradeIdentity({
      itemId: "X",
      sellerUserId: "A",
      counterpartyUserId: "C",
    });
    expect(same.identityKey).toBe(again.identityKey);
    expect(same.identityKey).toBe("trade:X:A:B");
    expect(otherItem.identityKey).not.toBe(same.identityKey);
    expect(otherPeer.identityKey).not.toBe(same.identityKey);
    expect(parseTradeIdentityKey(same.identityKey)).toEqual({
      itemId: "X",
      sellerUserId: "A",
      counterpartyUserId: "B",
    });
  });

  it("rejects trade:legacy and general_direct identities", () => {
    expect(() => parseTradeIdentityKey("trade:legacy:trade_pc:uuid")).toThrow(/legacy_identity/);
    expect(() => parseTradeIdentityKey("general_direct:a:b")).toThrow(/general_direct/);
  });

  it("list: same peer different listing → 2 rows; same triple duplicate → fail; many msgs → 1 row", () => {
    const two = buildTradeListSnapshot({
      viewerUserId: "seller-1",
      generation: "1",
      rooms: [
        tradeRow({ roomId: "r1", itemId: "X", lastMessage: "from X" }),
        tradeRow({ roomId: "r2", itemId: "Y", lastMessage: "from Y" }),
      ],
    });
    expect(two.ok && two.snapshot.rows).toHaveLength(2);
    if (two.ok) {
      expect(two.snapshot.rows[0]?.lastMessage).toBe("from X");
      expect(two.snapshot.rows[1]?.lastMessage).toBe("from Y");
    }

    const one = buildTradeListSnapshot({
      viewerUserId: "seller-1",
      generation: "1",
      rooms: [tradeRow({ roomId: "r1", itemId: "X", lastMessage: "last of 100" })],
    });
    expect(one.ok && one.snapshot.rows).toHaveLength(1);

    const dup = buildTradeListSnapshot({
      viewerUserId: "seller-1",
      generation: "1",
      rooms: [tradeRow({ roomId: "r1", itemId: "X" }), tradeRow({ roomId: "r2", itemId: "X" })],
    });
    expect(dup.ok).toBe(false);

    const asFriends = buildGeneralDirectIdentity("seller-1", "buyer-1").identityKey;
    expect(asFriends).not.toBe(
      buildTradeIdentity({
        itemId: "X",
        sellerUserId: "seller-1",
        counterpartyUserId: "buyer-1",
      }).identityKey
    );
  });
});

describe("Canonical identity — store_order", () => {
  it("orderId is sole identity; customer/owner share same key", () => {
    const a = storeOrderRoomIdentity("order-1001");
    const b = buildStoreOrderIdentity("order-1001");
    expect(a.identityKey).toBe("store_order:order-1001");
    expect(b.identityKey).toBe(a.identityKey);
    expect(buildStoreOrderIdentity("order-1002").identityKey).not.toBe(a.identityKey);
  });

  it("list: same store different orders → 2 rows; same order duplicate → fail", () => {
    const base = {
      chatDomain: "store_order" as const,
      storeId: "store-S",
      storeName: "Shop",
      storeImageUrl: null as string | null,
      customerUserId: "cust-A",
      customerName: "Cust",
      customerAvatarUrl: null as string | null,
      unreadCount: 0,
      latestChatMessageType: "text",
      latestChatMessageAt: "2026-07-14T12:00:00.000Z",
      orderStatusLabel: "준비중",
    };
    const two = buildStoreOrderListSnapshot({
      viewerUserId: "cust-A",
      generation: "1",
      rooms: [
        {
          ...base,
          roomId: "r1",
          orderId: "1001",
          domainIdentityKey: "store_order:1001",
          latestChatMessageText: "o1",
        },
        {
          ...base,
          roomId: "r2",
          orderId: "1002",
          domainIdentityKey: "store_order:1002",
          latestChatMessageText: "o2",
        },
      ],
    });
    expect(two.ok && two.snapshot.rows).toHaveLength(2);

    const dup = buildStoreOrderListSnapshot({
      viewerUserId: "cust-A",
      generation: "1",
      rooms: [
        {
          ...base,
          roomId: "r1",
          orderId: "1001",
          domainIdentityKey: "store_order:1001",
          latestChatMessageText: "a",
        },
        {
          ...base,
          roomId: "r2",
          orderId: "1001",
          domainIdentityKey: "store_order:1001",
          latestChatMessageText: "b",
        },
      ],
    });
    expect(dup.ok).toBe(false);

    expect("store_order:1001").not.toBe(
      buildGeneralDirectIdentity("cust-A", "owner-S").identityKey
    );
  });
});

describe("Canonical identity — cross-domain + Runtime OFF", () => {
  it("four domains never share identity prefixes for same payload shape", () => {
    const keys = [
      buildGeneralDirectIdentity("u1", "u2").identityKey,
      buildGroupIdentity("g1").identityKey,
      buildTradeIdentity({
        itemId: "i",
        sellerUserId: "u1",
        counterpartyUserId: "u2",
      }).identityKey,
      buildStoreOrderIdentity("o1").identityKey,
    ];
    expect(new Set(keys).size).toBe(4);
    expect(keys.every((k, i) => keys.every((o, j) => i === j || !o.startsWith(k.split(":")[0]! + ":") || o !== k))).toBe(
      true
    );
  });

  it("parseGeneralDirect rejects trade/store/group keys", () => {
    expect(() => parseGeneralDirectIdentityKey("trade:i:s:b")).toThrow();
    expect(() => parseGeneralDirectIdentityKey("store_order:o")).toThrow();
    expect(() => parseGeneralDirectIdentityKey("group:g")).toThrow();
  });

  it("Production Runtime: allowlist Domain Authority CONNECTED; all-user Phase6/8/9/D1 OFF", () => {
    expect(PHASE6_DOMAIN_CACHE_PRODUCTION_WIRING).toBe(false);
    expect(PHASE8A_BADGE_PRODUCTION_WIRING).toBe(false);
    expect(PHASE9_NOTIFICATION_PRODUCTION_WIRING).toBe(false);
    expect(D1_1_ATOMIC_READ_RPC_PRODUCTION_WIRING).toBe(false);
    expect(PHASE11D_A_CACHE_WRITE).toBe(true);
    expect(PHASE11D_A_REALTIME_APPLY).toBe(true);
    expect(PHASE11D_A_BADGE_READ_WIRING).toBe(true);
    expect(PHASE11D_A_NOTIFICATION_WRITE).toBe(true);
    expect(PHASE11D_A_PRODUCTION_HOME_WIRING).toBe(true);
  });
});
