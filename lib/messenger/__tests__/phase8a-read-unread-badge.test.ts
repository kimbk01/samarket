/**
 * Phase 8A — Domain Read / Unread / Badge Architecture 테스트 (§12 A–H).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  D1_1_ATOMIC_READ_RPC_OPEN,
  D1_2_APP_ICON_UNIT_OPEN,
  PHASE8A_BADGE_PRODUCTION_WIRING,
  assertCountUnitsNotMixed,
  buildDomainReadTransactionPlan,
} from "@/lib/messenger/contracts/domain-read-unread-badge";
import {
  assertMessengerNavRejectsHubDomains,
  composePhase8aBadgeShell,
  shellConvertUnreadMessageToRoom,
  shellSetAppIconBadge,
} from "@/lib/messenger/contracts/badge-shell-phase8a";
import {
  applyRealtimeEventToUnreadContribution,
  assertNoDoubleBadgeDecrement,
} from "@/lib/messenger/contracts/realtime-unread-adapter";
import { MESSENGER_DOMAIN_EVENT_SCHEMA_VERSION } from "@/lib/messenger/contracts/domain-event-envelope";
import { PHASE1_DEFAULT_CUTOVER } from "@/lib/messenger/contracts/cutover";
import { MESSENGER_DOMAIN_BUILD_PHASE_ORDER } from "@/lib/messenger/contracts/phase-order";
import {
  createGeneralDirectReadPort,
  buildGeneralDirectUnreadContribution,
  buildGeneralDirectRowBadge,
  buildGeneralDirectAppIconContribution,
} from "@/lib/messenger/general-direct/phase8a-read-unread-badge";
import { buildGeneralDirectIdentity } from "@/lib/messenger/general-direct/identity";
import { GENERAL_DIRECT_DOMAIN, type GeneralDirectListItem } from "@/lib/messenger/general-direct/types";
import {
  createGroupReadPort,
  buildGroupUnreadContribution,
  buildGroupRowBadge,
} from "@/lib/messenger/group/phase8a-read-unread-badge";
import { GROUP_DOMAIN, type GroupListItem } from "@/lib/messenger/group/types";
import {
  createTradeReadPort,
  buildTradeUnreadContribution,
  buildTradeHubBadgeFromUnread,
  buildTradeRowBadge,
} from "@/lib/messenger/trade/phase8a-read-unread-badge";
import { buildTradeIdentity } from "@/lib/messenger/trade/identity";
import { TRADE_DOMAIN, type TradeListItem } from "@/lib/messenger/trade/types";
import {
  createStoreOrderReadPort,
  buildStoreOrderUnreadContribution,
  buildStoreOrderHubBadgeFromUnread,
  buildStoreOrderRowBadge,
  assertSameStoreOwnerContributions,
} from "@/lib/messenger/store-order/phase8a-read-unread-badge";
import { STORE_ORDER_DOMAIN, type StoreOrderListItem } from "@/lib/messenger/store-order/types";
import {
  createGeneralDirectRealtimeApplyPort,
  emptyGeneralDirectHarnessSnapshot,
} from "@/lib/messenger/general-direct/phase7-realtime";

function gdIdentity() {
  return buildGeneralDirectIdentity("viewer-1", "peer-1").identityKey;
}

function gdItem(unread = 2): GeneralDirectListItem {
  return {
    roomId: "r-gd",
    chatDomain: GENERAL_DIRECT_DOMAIN,
    domainIdentityKey: gdIdentity(),
    peerUserId: "peer-1",
    peerDisplayName: "친구",
    peerAvatarUrl: null,
    lastMessage: "hi",
    lastMessageAt: "2026-07-14T10:00:00.000Z",
    unreadCount: unread,
    updatedAt: "2026-07-14T10:00:00.000Z",
    generation: "1",
  };
}

function groupItem(unread = 1): GroupListItem {
  return {
    roomId: "g1",
    chatDomain: GROUP_DOMAIN,
    domainIdentityKey: "group:g1",
    groupId: "g1",
    groupSubtype: "private_group",
    groupName: "동네",
    groupImageUrl: null,
    memberCount: 2,
    lastMessage: "모임",
    lastMessageAt: "2026-07-14T10:00:00.000Z",
    unreadCount: unread,
    updatedAt: "2026-07-14T10:00:00.000Z",
    generation: "1",
  };
}

function tradeItem(unread = 3): TradeListItem {
  const id = buildTradeIdentity({
    itemId: "item-a",
    sellerUserId: "viewer-1",
    counterpartyUserId: "buyer-1",
  });
  return {
    roomId: "tr1",
    chatDomain: TRADE_DOMAIN,
    domainIdentityKey: id.identityKey,
    itemId: "item-a",
    sellerUserId: "viewer-1",
    counterpartyUserId: "buyer-1",
    viewerRole: "seller",
    itemTitle: "자전거",
    itemImageUrl: null,
    peerDisplayName: "구매자",
    peerAvatarUrl: null,
    productChatId: null,
    lastMessage: "문의",
    lastMessageIsSystem: false,
    lastMessageAt: "2026-07-14T10:00:00.000Z",
    unreadCount: unread,
    tradeStatusLabel: "판매중",
    updatedAt: "2026-07-14T10:00:00.000Z",
    generation: "1",
  };
}

function orderItem(partial?: Partial<StoreOrderListItem>): StoreOrderListItem {
  return {
    roomId: "or1",
    chatDomain: STORE_ORDER_DOMAIN,
    domainIdentityKey: "store_order:ord-1",
    orderId: "ord-1",
    storeId: "store-1",
    storeName: "맛집",
    storeImageUrl: null,
    customerUserId: "cust-1",
    customerName: "고객",
    customerAvatarUrl: null,
    latestChatMessageText: "주문",
    latestChatMessageType: "text",
    latestChatMessageAt: "2026-07-14T10:00:00.000Z",
    unreadCount: 2,
    orderStatusLabel: "준비중",
    fulfillmentType: null,
    generation: "1",
    ...partial,
  };
}

const allOk = {
  participant_cursor: "ok" as const,
  badge_target: "ok" as const,
  notification_event: "ok" as const,
};

describe("Phase 8A A — Cross-domain", () => {
  it("domain read cannot mutate foreign domain", () => {
    const gd = createGeneralDirectReadPort();
    const group = createGroupReadPort();
    gd.seedRooms(
      [{ roomId: "r-gd", domainIdentityKey: gdIdentity(), unreadMessageCount: 2, generation: 1 }],
      "test"
    );
    group.seedRooms(
      [{ roomId: "g1", domainIdentityKey: "group:g1", unreadMessageCount: 5, generation: 1 }],
      "test"
    );
    expect(() => gd.mutateForeignDomain(GROUP_DOMAIN)).toThrow(/foreign_domain/);
    expect(() => group.mutateForeignDomain(GENERAL_DIRECT_DOMAIN)).toThrow(/foreign_domain/);

    const beforeGroup = group.buildUnreadContribution({ viewerUserId: "viewer-1" });
    gd.applyRead(
      {
        chatDomain: GENERAL_DIRECT_DOMAIN,
        domainIdentityKey: gdIdentity(),
        roomId: "r-gd",
        viewerUserId: "viewer-1",
        generation: 2,
        idempotencyKey: "read-gd-1",
        lastReadMessageId: "m1",
      },
      allOk,
      "test"
    );
    expect(group.buildUnreadContribution({ viewerUserId: "viewer-1" }).unreadMessageCount).toBe(
      beforeGroup.unreadMessageCount
    );

    const trade = createTradeReadPort();
    expect(() => trade.mutateForeignDomain(GENERAL_DIRECT_DOMAIN)).toThrow(/foreign/);
  });
});

describe("Phase 8A B — Row/Hub/Nav", () => {
  it("composes nav/hub correctly and rejects hub domains on messengerNav", () => {
    const general = buildGeneralDirectUnreadContribution({
      viewerUserId: "viewer-1",
      rows: [gdItem(2)],
      generation: 1,
    });
    const group = buildGroupUnreadContribution({
      viewerUserId: "viewer-1",
      rows: [groupItem(1)],
      generation: 1,
    });
    const trade = buildTradeUnreadContribution({
      viewerUserId: "viewer-1",
      rows: [tradeItem(3)],
      generation: 1,
    });
    const storeOrder = buildStoreOrderUnreadContribution({
      viewerUserId: "cust-1",
      surfaceRole: "customer",
      storeId: "store-1",
      rows: [orderItem()],
      generation: 1,
    });

    expect(buildGeneralDirectRowBadge(gdItem(2))).toBe(2);
    expect(buildGroupRowBadge(groupItem(1))).toBe(1);
    expect(buildTradeRowBadge(tradeItem(3))).toBe(3);
    expect(buildStoreOrderRowBadge(orderItem())).toBe(2);
    expect(buildTradeHubBadgeFromUnread(trade)).toBe(1);
    expect(buildStoreOrderHubBadgeFromUnread(storeOrder)).toBe(1);

    expect(() => assertMessengerNavRejectsHubDomains([trade])).toThrow(/forbids_hub/);
    expect(() => assertMessengerNavRejectsHubDomains([storeOrder])).toThrow(/forbids_hub/);

    const shell = composePhase8aBadgeShell({
      generalDirect: general,
      group,
      trade,
      storeOrder,
      orderStatus: {
        kind: "order_status",
        viewerUserId: "cust-1",
        orderStatusCount: 4,
        actionableOrderIdentityKeys: [
          "store_order:ord-1",
          "store_order:ord-2",
          "store_order:ord-3",
          "store_order:ord-4",
        ],
        generation: 1,
        computedAt: new Date().toISOString(),
      },
    });
    expect(shell.messengerNav.unreadRoomCount).toBe(2); // 1 gd room + 1 group room
    expect(shell.messengerNav.domains).toEqual(["general_direct", "group"]);
    expect(shell.tradeHub.unreadRoomCount).toBe(1);
    expect(shell.storeOrderHub.unreadRoomCount).toBe(1);
    expect(shell.deliveryNav.orderStatusCount).toBe(4);
    expect(shell.deliveryNav.storeOrderUnreadRoomCount).toBe(1);
    expect(shell.navTrade.wiredToUi).toBe(false);
  });
});

describe("Phase 8A C — Count units", () => {
  it("keeps message/room separate; shell conversion throws", () => {
    const c = buildGeneralDirectUnreadContribution({
      viewerUserId: "viewer-1",
      rows: [gdItem(5), { ...gdItem(0), roomId: "r2", domainIdentityKey: buildGeneralDirectIdentity("viewer-1", "peer-2").identityKey, peerUserId: "peer-2", unreadCount: 0 }],
      generation: 1,
    });
    expect(c.unreadMessageCount).toBe(5);
    expect(c.unreadRoomCount).toBe(1);
    expect(() => assertCountUnitsNotMixed({ labeledAs: "message", valueUsedAs: "room" })).toThrow(
      /unit_mixed/
    );
    expect(() => shellConvertUnreadMessageToRoom(3)).toThrow(/unit_conversion/);
  });
});

describe("Phase 8A D — Consistency", () => {
  it("consistent / partial / stale / forbidden", () => {
    const port = createGeneralDirectReadPort();
    port.seedRooms(
      [{ roomId: "r-gd", domainIdentityKey: gdIdentity(), unreadMessageCount: 2, generation: 5 }],
      "test"
    );
    const reqBase = {
      chatDomain: GENERAL_DIRECT_DOMAIN,
      domainIdentityKey: gdIdentity(),
      roomId: "r-gd",
      viewerUserId: "viewer-1",
      generation: 6,
      idempotencyKey: "k-ok",
      lastReadMessageId: "m1",
    };
    const plan = buildDomainReadTransactionPlan(reqBase);
    expect(plan.atomicRpcName).toBe("dibay_messenger_domain_atomic_mark_read");
    expect(plan.d1_1Open).toBe(false);
    expect(plan.d1_1Implemented).toBe(true);
    expect(plan.productionWiring).toBe(false);

    const ok = port.applyRead(reqBase, allOk, "test");
    expect(ok.status).toBe("consistent");
    if (ok.status === "consistent") {
      expect(ok.unreadRoomCleared).toBe(true);
      expect(ok.plan.atomicRpcName).toBe("dibay_messenger_domain_atomic_mark_read");
    }

    const partial = port.applyRead(
      { ...reqBase, idempotencyKey: "k-partial", generation: 7 },
      { participant_cursor: "ok", badge_target: "fail", notification_event: "ok" },
      "test"
    );
    expect(partial.status).toBe("partial");
    if (partial.status === "partial") {
      expect(partial.treatedAsSuccess).toBe(false);
      expect(partial.failedAuthorities).toContain("badge_target");
    }

    const stale = port.applyRead(
      { ...reqBase, idempotencyKey: "k-stale", generation: 1 },
      allOk,
      "test"
    );
    expect(stale.status).toBe("stale");

    const forbidden = port.applyRead(
      {
        ...reqBase,
        idempotencyKey: "k-forbid",
        generation: 8,
        chatDomain: TRADE_DOMAIN,
      },
      allOk,
      "test"
    );
    expect(forbidden.status).toBe("forbidden");

    const eventFail = port.applyRead(
      { ...reqBase, idempotencyKey: "k-ev", generation: 8 },
      { participant_cursor: "ok", badge_target: "ok", notification_event: "fail" },
      "test"
    );
    expect(eventFail.status).toBe("partial");
  });
});

describe("Phase 8A E — Idempotency", () => {
  it("same read key applies once; realtime duplicate no double decrement", () => {
    const port = createGeneralDirectReadPort();
    port.seedRooms(
      [{ roomId: "r-gd", domainIdentityKey: gdIdentity(), unreadMessageCount: 4, generation: 1 }],
      "test"
    );
    const req = {
      chatDomain: GENERAL_DIRECT_DOMAIN,
      domainIdentityKey: gdIdentity(),
      roomId: "r-gd",
      viewerUserId: "viewer-1",
      generation: 2,
      idempotencyKey: "same-key",
      lastReadMessageId: "m1",
    };
    expect(port.applyRead(req, allOk, "test").status).toBe("consistent");
    const dup = port.applyRead(req, allOk, "test");
    expect(dup.status).toBe("duplicate");

    const rt = createGeneralDirectRealtimeApplyPort({ viewerUserId: "viewer-1" });
    rt.seedForHarness(
      emptyGeneralDirectHarnessSnapshot("viewer-1", [gdItem(2)]),
      "test"
    );
    const evt = {
      schemaVersion: MESSENGER_DOMAIN_EVENT_SCHEMA_VERSION,
      domain: GENERAL_DIRECT_DOMAIN,
      identityKey: gdIdentity(),
      roomId: "r-gd",
      viewerUserId: "viewer-1",
      eventId: "rt-1",
      generation: 1,
      occurredAt: "2026-07-14T12:00:00.000Z",
      eventType: "room_read",
      payload: {},
    };
    const a1 = applyRealtimeEventToUnreadContribution({
      domain: GENERAL_DIRECT_DOMAIN,
      viewerUserId: "viewer-1",
      port: rt,
      rawEvent: evt,
      ctx: "test",
    });
    const a2 = applyRealtimeEventToUnreadContribution({
      domain: GENERAL_DIRECT_DOMAIN,
      viewerUserId: "viewer-1",
      port: rt,
      rawEvent: evt,
      ctx: "test",
    });
    expect(a1.status).toBe("patched");
    expect(a2.status).toBe("noop_duplicate");
    if (a1.status === "patched") {
      assertNoDoubleBadgeDecrement(2, a1.contribution.unreadRoomCount, a1.contribution.unreadRoomCount);
    }
  });
});

describe("Phase 8A F — Store Order", () => {
  it("separates customer/owner; rejects cross-store owner aggregate", () => {
    const customer = buildStoreOrderUnreadContribution({
      viewerUserId: "cust-1",
      surfaceRole: "customer",
      storeId: "store-1",
      rows: [orderItem({ unreadCount: 2 })],
      generation: 1,
    });
    const owner = buildStoreOrderUnreadContribution({
      viewerUserId: "owner-1",
      surfaceRole: "owner",
      storeId: "store-1",
      rows: [
        orderItem({ unreadCount: 1 }),
        orderItem({
          roomId: "or2",
          orderId: "ord-2",
          domainIdentityKey: "store_order:ord-2",
          unreadCount: 1,
        }),
      ],
      generation: 1,
    });
    expect(customer.surfaceRole).toBe("customer");
    expect(owner.surfaceRole).toBe("owner");
    expect(owner.unreadRoomCount).toBe(2);

    expect(() =>
      assertSameStoreOwnerContributions([
        owner,
        {
          ...owner,
          storeId: "store-OTHER",
        },
      ])
    ).toThrow(/cross_store/);

    expect(() =>
      buildStoreOrderUnreadContribution({
        viewerUserId: "owner-1",
        surfaceRole: "owner",
        storeId: "store-1",
        rows: [orderItem({ storeId: "store-OTHER" })],
        generation: 1,
      })
    ).toThrow(/foreign_store/);

    const soPort = createStoreOrderReadPort({
      surfaceRole: "owner",
      ownerUserIds: ["owner-1"],
      customerUserId: "cust-1",
    });
    soPort.seedRooms(
      [
        {
          roomId: "or1",
          domainIdentityKey: "store_order:ord-1",
          unreadMessageCount: 2,
          generation: 1,
        },
      ],
      "test"
    );
    expect(
      soPort.applyRead(
        {
          chatDomain: STORE_ORDER_DOMAIN,
          domainIdentityKey: "store_order:ord-1",
          roomId: "or1",
          viewerUserId: "stranger",
          generation: 2,
          idempotencyKey: "so-forbid",
        },
        allOk,
        "test"
      ).status
    ).toBe("forbidden");
  });
});

describe("Phase 8A G — App Icon", () => {
  it("emits contribution only; no setter; D1-2 unit LOCKED to notificationEventCount", () => {
    expect(D1_2_APP_ICON_UNIT_OPEN).toBe(false);
    const unread = buildGeneralDirectUnreadContribution({
      viewerUserId: "viewer-1",
      rows: [gdItem(2)],
      generation: 1,
    });
    const icon = buildGeneralDirectAppIconContribution(unread, 7);
    expect(icon.d1_2UnitSelection).toBe("notificationEventCount");
    expect(icon.d1_2Open).toBe(false);
    expect(icon.unreadMessageCount).toBe(2);
    expect(icon.unreadRoomCount).toBe(1);
    expect(icon.notificationEventCount).toBe(7);
    expect(() => shellSetAppIconBadge(9)).toThrow(/app_icon_setter_forbidden/);

    const shell = composePhase8aBadgeShell({
      generalDirect: unread,
      group: buildGroupUnreadContribution({ viewerUserId: "viewer-1", rows: [], generation: 0 }),
      trade: buildTradeUnreadContribution({ viewerUserId: "viewer-1", rows: [], generation: 0 }),
      storeOrder: buildStoreOrderUnreadContribution({
        viewerUserId: "viewer-1",
        surfaceRole: "customer",
        storeId: null,
        rows: [],
        generation: 0,
      }),
      orderStatus: {
        kind: "order_status",
        viewerUserId: "viewer-1",
        orderStatusCount: 0,
        actionableOrderIdentityKeys: [],
        generation: 0,
        computedAt: new Date().toISOString(),
      },
    });
    expect(shell.shellDoesNotSetAppIcon).toBe(true);
    expect(shell.appIconInputs).toHaveLength(4);
    expect(shell.d1_2Open).toBe(false);
  });
});

describe("Phase 8A H — Runtime isolation", () => {
  it("wiring flags off; no production imports; D1-1 implemented pending cutover; phase 8 done", () => {
    expect(PHASE8A_BADGE_PRODUCTION_WIRING).toBe(false);
    expect(D1_1_ATOMIC_READ_RPC_OPEN).toBe(false);
    expect(PHASE1_DEFAULT_CUTOVER.every((c) => c.mode === "off")).toBe(true);
    expect(MESSENGER_DOMAIN_BUILD_PHASE_ORDER.find((p) => p.phase === 8)?.status).toBe("done");
    expect(
      MESSENGER_DOMAIN_BUILD_PHASE_ORDER.find((p) => p.phase === 8)?.domain
    ).toBe("read_unread_badge_architecture_8a_8b");

    const root = path.resolve(__dirname, "../../..");
    for (const relDir of ["app/(main)", "lib/community-messenger"]) {
      const abs = path.join(root, relDir);
      if (!fs.existsSync(abs)) continue;
      const walk = (dir: string): string[] => {
        const out: string[] = [];
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, ent.name);
          if (ent.isDirectory()) {
            if (ent.name === "node_modules" || ent.name === ".next") continue;
            out.push(...walk(p));
          } else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
        }
        return out;
      };
      for (const file of walk(abs)) {
        const rel = path.relative(root, file).replace(/\\/g, "/");
        if (rel.startsWith("app/api/messenger/")) continue;
        const src = fs.readFileSync(file, "utf8");
        if (/from\s+["']@\/lib\/messenger\//.test(src)) {
          throw new Error(`forbidden messenger import: ${rel}`);
        }
        if (/Badge\.setAppIcon|setApplicationIconBadgeNumber/.test(src) && rel.includes("phase8a")) {
          throw new Error(`app icon setter in ${rel}`);
        }
      }
    }

    // no new migration for 8a in this change set expectation
    expect(D1_1_ATOMIC_READ_RPC_OPEN).toBe(false);
  });
});
