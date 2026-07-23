/**
 * Phase 7 — Domain Realtime / Multi-tab 계약 테스트 (§14 A–I).
 * production channel/bus wiring · dual subscriber 없음.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  MESSENGER_DOMAIN_EVENT_SCHEMA_VERSION,
  PHASE7_DOMAIN_REALTIME_PRODUCTION_WIRING,
  parseMessengerDomainEventEnvelope,
  DomainEventEnvelopeError,
} from "@/lib/messenger/contracts/domain-event-envelope";
import {
  createIsolatedDomainMultiTabBus,
} from "@/lib/messenger/contracts/multi-tab-domain-bus";
import { PHASE1_DEFAULT_CUTOVER, assertNoDualWrite } from "@/lib/messenger/contracts/cutover";
import { MESSENGER_DOMAIN_BUILD_PHASE_ORDER } from "@/lib/messenger/contracts/phase-order";
import { createDomainPersistentCachePort } from "@/lib/messenger/contracts/persistent-cache-port";
import {
  createGeneralDirectRealtimeApplyPort,
  emptyGeneralDirectHarnessSnapshot,
} from "@/lib/messenger/general-direct/phase7-realtime";
import { buildGeneralDirectIdentity } from "@/lib/messenger/general-direct/identity";
import { GENERAL_DIRECT_DOMAIN, type GeneralDirectListItem } from "@/lib/messenger/general-direct/types";
import {
  createGroupRealtimeApplyPort,
  emptyGroupHarnessSnapshot,
} from "@/lib/messenger/group/phase7-realtime";
import { GROUP_DOMAIN, type GroupListItem } from "@/lib/messenger/group/types";
import {
  createTradeRealtimeApplyPort,
  emptyTradeHarnessSnapshot,
} from "@/lib/messenger/trade/phase7-realtime";
import { buildTradeIdentity } from "@/lib/messenger/trade/identity";
import { TRADE_DOMAIN, type TradeListItem } from "@/lib/messenger/trade/types";
import {
  createStoreOrderRealtimeApplyPort,
  emptyStoreOrderHarnessSnapshot,
} from "@/lib/messenger/store-order/phase7-realtime";
import { STORE_ORDER_DOMAIN, type StoreOrderListItem } from "@/lib/messenger/store-order/types";
import { composeMessengerInboxRows } from "@/lib/messenger/shell/home-compose";

function gdRow(): GeneralDirectListItem {
  return {
    roomId: "r-gd",
    chatDomain: GENERAL_DIRECT_DOMAIN,
    domainIdentityKey: buildGeneralDirectIdentity("viewer-1", "peer-1").identityKey,
    peerUserId: "peer-1",
    peerDisplayName: "친구",
    peerAvatarUrl: null,
    lastMessage: "안녕",
    lastMessageAt: "2026-07-14T10:00:00.000Z",
    unreadCount: 1,
    updatedAt: "2026-07-14T10:00:00.000Z",
    generation: "0",
  };
}

function groupRow(): GroupListItem {
  return {
    roomId: "g1",
    chatDomain: GROUP_DOMAIN,
    domainIdentityKey: "group:g1",
    groupId: "g1",
    groupSubtype: "private_group",
    groupName: "동네",
    groupImageUrl: null,
    memberCount: 3,
    lastMessage: "모임",
    lastMessageAt: "2026-07-14T10:00:00.000Z",
    unreadCount: 0,
    updatedAt: "2026-07-14T10:00:00.000Z",
    generation: "0",
  };
}

function tradeRow(): TradeListItem {
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
    itemTitle: "자전거",
    itemImageUrl: null,
    peerDisplayName: "구매자",
    peerAvatarUrl: null,
    productChatId: null,
    lastMessage: "문의",
    lastMessageAt: "2026-07-14T10:00:00.000Z",
    unreadCount: 1,
    tradeStatusLabel: "판매중",
    updatedAt: "2026-07-14T10:00:00.000Z",
    generation: "0",
  };
}

function orderRow(): StoreOrderListItem {
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
    latestChatMessageText: "주문OK",
    latestChatMessageType: "text",
    latestChatMessageAt: "2026-07-14T10:00:00.000Z",
    unreadCount: 0,
    orderStatusLabel: "준비중",
    fulfillmentType: null,
    generation: "0",
  };
}

function baseEnvelope(partial: Record<string, unknown>) {
  return {
    schemaVersion: MESSENGER_DOMAIN_EVENT_SCHEMA_VERSION,
    domain: GENERAL_DIRECT_DOMAIN,
    identityKey: gdRow().domainIdentityKey,
    roomId: "r-gd",
    viewerUserId: "viewer-1",
    eventId: "evt-1",
    generation: 1,
    occurredAt: "2026-07-14T12:00:00.000Z",
    eventType: "message_created",
    payload: {
      messageId: "m1",
      text: "새 메시지",
      occurredAt: "2026-07-14T12:00:00.000Z",
      unreadCount: 2,
    },
    ...partial,
  };
}

describe("Phase 7 A — Envelope", () => {
  it("rejects missing fields / identity mismatch / viewer / schema", () => {
    expect(() => parseMessengerDomainEventEnvelope({})).toThrow(DomainEventEnvelopeError);
    expect(() =>
      parseMessengerDomainEventEnvelope(baseEnvelope({ identityKey: "trade:i:s:b" }))
    ).toThrow(/identity_prefix/);
    expect(() =>
      parseMessengerDomainEventEnvelope(baseEnvelope({}), {
        viewerUserId: "other",
      })
    ).toThrow(/viewer_mismatch/);
    expect(() =>
      parseMessengerDomainEventEnvelope(baseEnvelope({ schemaVersion: 99 }))
    ).toThrow(/unsupported_schema/);
    expect(() =>
      parseMessengerDomainEventEnvelope({ roomId: "r1" })
    ).toThrow(/legacy_quarantine/);
  });
});

describe("Phase 7 B — Cross-domain", () => {
  it("rejects foreign domain events per subscriber", () => {
    const gd = createGeneralDirectRealtimeApplyPort({ viewerUserId: "viewer-1" });
    gd.seedForHarness(emptyGeneralDirectHarnessSnapshot("viewer-1", [gdRow()]), "test");
    expect(
      gd.applyEnvelope(
        baseEnvelope({
          domain: TRADE_DOMAIN,
          identityKey: tradeRow().domainIdentityKey,
          roomId: "tr1",
          eventType: "message_created",
          payload: {
            messageId: "m",
            text: "x",
            occurredAt: "2026-07-14T12:00:00.000Z",
            itemId: "item-a",
            sellerId: "viewer-1",
            counterpartyId: "buyer-1",
          },
        }),
        "test"
      ).status
    ).toBe("rejected");

    const group = createGroupRealtimeApplyPort({ viewerUserId: "viewer-1" });
    group.seedForHarness(emptyGroupHarnessSnapshot("viewer-1", [groupRow()]), "test");
    expect(
      group.applyEnvelope(
        baseEnvelope({
          domain: STORE_ORDER_DOMAIN,
          identityKey: "store_order:ord-1",
          roomId: "or1",
          eventType: "message_created",
        }),
        "test"
      ).status
    ).toBe("rejected");

    const trade = createTradeRealtimeApplyPort({ viewerUserId: "viewer-1" });
    trade.seedForHarness(emptyTradeHarnessSnapshot("viewer-1", [tradeRow()]), "test");
    expect(
      trade.applyEnvelope(baseEnvelope({ eventId: "x" }), "test").status
    ).toBe("rejected");

    const so = createStoreOrderRealtimeApplyPort({
      viewerUserId: "owner-1",
      surfaceRole: "owner",
    });
    so.seedForHarness(
      emptyStoreOrderHarnessSnapshot("owner-1", "owner", [orderRow()]),
      "test"
    );
    expect(
      so.applyEnvelope(
        baseEnvelope({
          domain: GROUP_DOMAIN,
          identityKey: "group:g1",
          roomId: "g1",
          eventId: "g-evt",
        }),
        "test"
      ).status
    ).toBe("rejected");
  });
});

describe("Phase 7 C/D — Generation · Idempotency", () => {
  it("stale generation / tombstone / stale unread / duplicate eventId", () => {
    const port = createGeneralDirectRealtimeApplyPort({ viewerUserId: "viewer-1" });
    port.seedForHarness(emptyGeneralDirectHarnessSnapshot("viewer-1", [gdRow()]), "test");

    const applied = port.applyEnvelope(baseEnvelope({ generation: 5, eventId: "e5" }), "test");
    expect(applied.status).toBe("applied");
    expect(port.inspect().snapshot?.rows[0]?.lastMessage).toBe("새 메시지");
    expect(port.inspect().snapshot?.rows[0]?.unreadCount).toBe(2);

    expect(port.applyEnvelope(baseEnvelope({ generation: 3, eventId: "old" }), "test").status).toBe(
      "rejected"
    );
    expect(port.inspect().snapshot?.rows[0]?.lastMessage).toBe("새 메시지");

    expect(
      port.applyEnvelope(
        baseEnvelope({
          generation: 6,
          eventId: "tomb",
          eventType: "tombstone",
          payload: { reason: "left" },
        }),
        "test"
      ).status
    ).toBe("applied");
    expect(
      port.applyEnvelope(
        baseEnvelope({
          generation: 6,
          eventId: "msg-after-tomb",
          eventType: "message_created",
          payload: {
            messageId: "m2",
            text: "should reject",
            occurredAt: "2026-07-14T13:00:00.000Z",
          },
        }),
        "test"
      ).status
    ).toBe("rejected");

    const port2 = createGeneralDirectRealtimeApplyPort({ viewerUserId: "viewer-1" });
    port2.seedForHarness(
      emptyGeneralDirectHarnessSnapshot("viewer-1", [{ ...gdRow(), unreadCount: 3 }]),
      "test"
    );
    expect(
      port2.applyEnvelope(
        baseEnvelope({
          generation: 2,
          eventId: "read-1",
          eventType: "room_read",
          payload: {},
        }),
        "test"
      ).status
    ).toBe("applied");
    expect(port2.inspect().snapshot?.rows[0]?.unreadCount).toBe(0);
    expect(
      port2.applyEnvelope(
        baseEnvelope({
          generation: 2,
          eventId: "unread-stale",
          eventType: "unread_changed",
          payload: { unreadCount: 9 },
        }),
        "test"
      ).status
    ).toBe("rejected");
    expect(port2.inspect().snapshot?.rows[0]?.unreadCount).toBe(0);

    const port3 = createGeneralDirectRealtimeApplyPort({ viewerUserId: "viewer-1" });
    port3.seedForHarness(emptyGeneralDirectHarnessSnapshot("viewer-1", [gdRow()]), "test");
    const r1 = port3.applyEnvelope(
      baseEnvelope({
        generation: 1,
        eventId: "same",
        payload: { messageId: "m1", text: "A", occurredAt: "t" },
      }),
      "test"
    );
    const r2 = port3.applyMultiTabPayload(
      baseEnvelope({
        generation: 1,
        eventId: "same",
        payload: { messageId: "m1", text: "A", occurredAt: "t" },
      }),
      "test"
    );
    expect(r1.status).toBe("applied");
    expect(r2.status).toBe("noop_duplicate");
    expect(port3.inspect().snapshot?.rows).toHaveLength(1);
    expect(port3.inspect().badgeContribution.unreadRoomCount).toBe(1);
  });
});

describe("Phase 7 E — Cache boundaries", () => {
  it("forbids cross-namespace and clearAll; event path uses partial only", () => {
    const gd = createDomainPersistentCachePort(GENERAL_DIRECT_DOMAIN, "chat.general");
    const tradeKey = createDomainPersistentCachePort(TRADE_DOMAIN, "chat.trade").buildCacheKey({
      viewerUserId: "v",
    });
    expect(() => gd.readSnapshot(tradeKey)).toThrow(/namespace_forbidden|foreign_namespace/);
    expect(() => gd.clearAllDomains()).toThrow(/clear_all/);
  });
});

describe("Phase 7 F/G — Hub · Store Order surface", () => {
  it("trade hub only; store_order surface separation", () => {
    const trade = createTradeRealtimeApplyPort({ viewerUserId: "viewer-1" });
    trade.seedForHarness(emptyTradeHarnessSnapshot("viewer-1", [tradeRow()]), "test");
    const id = tradeRow().domainIdentityKey;
    const res = trade.applyEnvelope(
      {
        schemaVersion: 1,
        domain: TRADE_DOMAIN,
        identityKey: id,
        roomId: "tr1",
        viewerUserId: "viewer-1",
        eventId: "t1",
        generation: 2,
        occurredAt: "2026-07-14T12:00:00.000Z",
        eventType: "message_created",
        payload: {
          messageId: "tm1",
          text: "네고할까요",
          occurredAt: "2026-07-14T12:00:00.000Z",
          itemId: "item-a",
          sellerId: "viewer-1",
          counterpartyId: "buyer-1",
        },
      },
      "test"
    );
    expect(res.status).toBe("applied");
    const hub = trade.inspect().hub as { previewText?: string; domain?: string };
    expect(hub?.domain).toBe(TRADE_DOMAIN);
    expect(hub?.previewText).toContain("네고");
    expect(hub?.previewText).not.toBe("자전거");

    const inbox = composeMessengerInboxRows([], []);
    expect(inbox).toHaveLength(0);

    const customer = createStoreOrderRealtimeApplyPort({
      viewerUserId: "cust-1",
      surfaceRole: "customer",
    });
    customer.seedForHarness(
      emptyStoreOrderHarnessSnapshot("cust-1", "customer", [orderRow()]),
      "test"
    );
    expect(customer.inspect().cacheKey).toContain("surface:customer");

    const owner = createStoreOrderRealtimeApplyPort({
      viewerUserId: "owner-1",
      surfaceRole: "owner",
    });
    expect(owner.inspect().cacheKey).toContain("surface:owner");
    expect(owner.inspect().cacheKey).not.toBe(customer.inspect().cacheKey);

    expect(
      customer.applyEnvelope(
        {
          schemaVersion: 1,
          domain: STORE_ORDER_DOMAIN,
          identityKey: "store_order:ord-1",
          roomId: "or1",
          viewerUserId: "cust-1",
          eventId: "bad-surface",
          generation: 1,
          occurredAt: "2026-07-14T12:00:00.000Z",
          eventType: "message_created",
          payload: {
            orderId: "ord-1",
            storeId: "store-1",
            surfaceRole: "owner",
            messageId: "m",
            text: "x",
            occurredAt: "2026-07-14T12:00:00.000Z",
          },
        },
        "test"
      ).status
    ).toBe("rejected");

    expect(
      customer.applyEnvelope(
        {
          schemaVersion: 1,
          domain: STORE_ORDER_DOMAIN,
          identityKey: "store_order:ord-1",
          roomId: "or1",
          viewerUserId: "cust-1",
          eventId: "cust-pres",
          generation: 1,
          occurredAt: "2026-07-14T12:00:00.000Z",
          eventType: "customer_presentation_changed",
          payload: {
            orderId: "ord-1",
            storeId: "store-1",
            surfaceRole: "customer",
            customerName: "해커",
          },
        },
        "test"
      ).status
    ).toBe("rejected");

    expect(
      owner.applyEnvelope(
        {
          schemaVersion: 1,
          domain: STORE_ORDER_DOMAIN,
          identityKey: "store_order:ord-1",
          roomId: "or1",
          viewerUserId: "owner-1",
          eventId: "own-store",
          generation: 1,
          occurredAt: "2026-07-14T12:00:00.000Z",
          eventType: "store_presentation_changed",
          payload: {
            orderId: "ord-1",
            storeId: "store-1",
            surfaceRole: "owner",
            storeName: "매장만",
          },
        },
        "test"
      ).status
    ).toBe("rejected");
  });
});

describe("Phase 7 H — Multi-tab", () => {
  it("quarantines legacy payload; rejects other viewer; dedupes with realtime", () => {
    const bus = createIsolatedDomainMultiTabBus();
    const q = bus.publish({ roomId: "r1" });
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.quarantined).toBe(true);
    expect(bus.inspectQuarantine().length).toBe(1);

    const port = createGeneralDirectRealtimeApplyPort({ viewerUserId: "viewer-1" });
    port.seedForHarness(emptyGeneralDirectHarnessSnapshot("viewer-1", [gdRow()]), "test");
    expect(
      port.applyMultiTabPayload(
        baseEnvelope({ viewerUserId: "intruder", eventId: "v-bad" }),
        "test"
      ).status
    ).toBe("rejected");

    const applied: string[] = [];
    const unsub = bus.subscribe(GENERAL_DIRECT_DOMAIN, (raw) => {
      const r = port.applyMultiTabPayload(raw, "test");
      applied.push(r.status);
    });
    bus.publish(baseEnvelope({ eventId: "bus-1", generation: 1 }));
    bus.publish(baseEnvelope({ eventId: "bus-1", generation: 1 }));
    expect(applied[0]).toBe("applied");
    expect(applied[1]).toBe("noop_duplicate");
    unsub();
  });
});

describe("Phase 7 I — Runtime 격리", () => {
  it("production wiring false, cutover OFF, no app/community-messenger imports", () => {
    expect(PHASE7_DOMAIN_REALTIME_PRODUCTION_WIRING).toBe(false);
    expect(PHASE1_DEFAULT_CUTOVER.every((c) => c.mode === "off")).toBe(true);
    expect(() => assertNoDualWrite(["legacy", "domain"])).toThrow(/dual_write/);
    expect(MESSENGER_DOMAIN_BUILD_PHASE_ORDER.find((p) => p.phase === 7)?.status).toBe("done");

    const root = path.resolve(__dirname, "../../..");
    const check = (relDir: string) => {
      const abs = path.join(root, relDir);
      if (!fs.existsSync(abs)) return;
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
      }
    };
    check("app/(main)");
    check("lib/community-messenger");
  });
});
