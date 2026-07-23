/**
 * Phase 11C — Isolated Runtime Integration tests (fixture · production wiring 0).
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  PHASE11C_CUTOVER_ON,
  PHASE11C_ISOLATED_RUNTIME_PRODUCTION_WIRING,
  PHASE11C_PRODUCTION_CACHE_WIRING,
  PHASE11C_PRODUCTION_REALTIME_WIRING,
  PHASE11C_PRODUCTION_UI_WIRING,
} from "@/lib/messenger/contracts/phase11c-isolated-runtime-gate";
import {
  clearPhase11cIsolatedCaches,
  readPhase11cWarmCache,
  runPhase11cColdIsolatedPipeline,
  simulatePhase11cRealtimePipeline,
} from "@/lib/messenger/contracts/phase11c-isolated-runtime";
import { MESSENGER_DOMAIN_BUILD_PHASE_ORDER } from "@/lib/messenger/contracts/phase-order";
import { createGeneralDirectFixtureBootstrapSource } from "@/lib/messenger/general-direct/phase6-bootstrap";
import { buildGeneralDirectIdentity } from "@/lib/messenger/general-direct/identity";
import { createGroupFixtureBootstrapSource } from "@/lib/messenger/group/phase6-bootstrap";
import {
  createTradeFixtureBootstrapSource,
  tradePhase6Cache,
} from "@/lib/messenger/trade/phase6-bootstrap";
import { buildTradeIdentity } from "@/lib/messenger/trade/identity";
import {
  createStoreOrderFixtureBootstrapSource,
  storeOrderPhase6Cache,
} from "@/lib/messenger/store-order/phase6-bootstrap";
import { generalDirectPhase6Cache } from "@/lib/messenger/general-direct/phase6-bootstrap";
import { DOMAIN_BOOTSTRAP_SCHEMA_VERSION } from "@/lib/messenger/contracts/domain-bootstrap-cache";

const VIEWER = "viewer-1";

function sources() {
  const gdId = buildGeneralDirectIdentity(VIEWER, "peer-1").identityKey;
  const tradeId = buildTradeIdentity({
    itemId: "item-a",
    sellerUserId: VIEWER,
    counterpartyUserId: "buyer-1",
  }).identityKey;
  const tradeId2 = buildTradeIdentity({
    itemId: "item-b",
    sellerUserId: VIEWER,
    counterpartyUserId: "buyer-1",
  }).identityKey;

  return {
    generalDirect: createGeneralDirectFixtureBootstrapSource([
      {
        roomId: "r-gd",
        chatDomain: "general_direct",
        domainIdentityKey: gdId,
        peerUserId: "peer-1",
        peerDisplayName: "친구",
        peerAvatarUrl: null,
        lastMessage: "안녕",
        lastMessageAt: "2026-07-14T12:00:00.000Z",
        unreadCount: 2,
      },
    ]),
    group: createGroupFixtureBootstrapSource([
      {
        roomId: "g1",
        groupId: "g1",
        chatDomain: "group",
        domainIdentityKey: "group:g1",
        groupName: "동네모임",
        groupImageUrl: null,
        groupSubtype: "private_group",
        memberCount: 3,
        lastMessage: "모일까",
        lastMessageAt: "2026-07-14T11:00:00.000Z",
        unreadCount: 1,
        memberUserIds: [VIEWER, "u2", "u3"],
      },
    ]),
    trade: createTradeFixtureBootstrapSource([
      {
        roomId: "tr1",
        chatDomain: "trade",
        domainIdentityKey: tradeId,
        itemId: "item-a",
        sellerUserId: VIEWER,
        counterpartyUserId: "buyer-1",
        itemTitle: "자전거",
        itemImageUrl: "https://cdn/bike.png",
        peerDisplayName: "구매자",
        peerAvatarUrl: null,
        lastMessage: "네고?",
        lastMessageAt: "2026-07-14T13:00:00.000Z",
        unreadCount: 1,
        tradeStatusLabel: "판매중",
        updatedAt: "2026-07-14T13:00:00.000Z",
      },
      {
        roomId: "tr2",
        chatDomain: "trade",
        domainIdentityKey: tradeId2,
        itemId: "item-b",
        sellerUserId: VIEWER,
        counterpartyUserId: "buyer-1",
        itemTitle: "헬멧",
        itemImageUrl: null,
        peerDisplayName: "구매자",
        peerAvatarUrl: null,
        lastMessage: "아직 있나요",
        lastMessageAt: "2026-07-14T10:00:00.000Z",
        unreadCount: 0,
        tradeStatusLabel: "판매중",
        updatedAt: "2026-07-14T10:00:00.000Z",
      },
    ]),
    storeOrderCustomer: createStoreOrderFixtureBootstrapSource([
      {
        roomId: "or1",
        chatDomain: "store_order",
        domainIdentityKey: "store_order:ord-1",
        orderId: "ord-1",
        storeId: "store-1",
        storeName: "맛집",
        storeImageUrl: "https://cdn/store.png",
        customerUserId: VIEWER,
        customerName: "나",
        customerAvatarUrl: null,
        latestChatMessageText: "주문OK",
        latestChatMessageType: "text",
        latestChatMessageAt: "2026-07-14T09:00:00.000Z",
        unreadCount: 1,
        orderStatusLabel: "준비중",
        storeOwnerUserIds: ["owner-1"],
        participantUserIds: [VIEWER, "owner-1"],
      },
      {
        roomId: "or2",
        chatDomain: "store_order",
        domainIdentityKey: "store_order:ord-2",
        orderId: "ord-2",
        storeId: "store-1",
        storeName: "맛집",
        storeImageUrl: "https://cdn/store.png",
        customerUserId: VIEWER,
        customerName: "나",
        customerAvatarUrl: null,
        latestChatMessageText: "",
        latestChatMessageType: "text",
        latestChatMessageAt: "",
        unreadCount: 0,
        orderStatusLabel: "완료",
        storeOwnerUserIds: ["owner-1"],
        participantUserIds: [VIEWER, "owner-1"],
      },
    ]),
    storeOrderOwner: createStoreOrderFixtureBootstrapSource([
      {
        roomId: "or-own-1",
        chatDomain: "store_order",
        domainIdentityKey: "store_order:ord-own-1",
        orderId: "ord-own-1",
        storeId: "store-1",
        storeName: "맛집",
        storeImageUrl: null,
        customerUserId: "cust-x",
        customerName: "고객X",
        customerAvatarUrl: "https://cdn/cust.png",
        latestChatMessageText: "언제 와요",
        latestChatMessageType: "text",
        latestChatMessageAt: "2026-07-14T14:00:00.000Z",
        unreadCount: 2,
        orderStatusLabel: "배달중",
        storeOwnerUserIds: [VIEWER],
        participantUserIds: ["cust-x", VIEWER],
      },
    ]),
  };
}

describe("Phase 11C — Isolated Runtime", () => {
  beforeEach(() => {
    clearPhase11cIsolatedCaches(VIEWER);
  });

  it("production wiring flags remain OFF", () => {
    expect(PHASE11C_ISOLATED_RUNTIME_PRODUCTION_WIRING).toBe(false);
    expect(PHASE11C_PRODUCTION_UI_WIRING).toBe(false);
    expect(PHASE11C_PRODUCTION_CACHE_WIRING).toBe(false);
    expect(PHASE11C_PRODUCTION_REALTIME_WIRING).toBe(false);
    expect(PHASE11C_CUTOVER_ON).toBe(false);
  });

  it("phase order lists 11.3", () => {
    expect(MESSENGER_DOMAIN_BUILD_PHASE_ORDER.some((p) => p.phase === 11.3)).toBe(true);
  });

  it("cold pipeline: bootstrap → cache → row/hub → shell", async () => {
    const out = await runPhase11cColdIsolatedPipeline({
      viewerUserId: VIEWER,
      generation: "11",
      sources: sources(),
    });

    // inbox = GD + group only
    expect(out.shell.home.inboxRows.every((e) => e.domain === "general_direct" || e.domain === "group")).toBe(
      true
    );
    expect(out.shell.home.inboxRows.map((e) => e.domain as string).includes("trade")).toBe(false);
    expect(out.generalDirect.rowModels[0]?.title).toBe("친구");
    expect(out.group.rowModels[0]?.title).toBe("동네모임");

    // trade list + hub
    expect(out.trade.rows).toHaveLength(2);
    expect(out.trade.hub.latestRoomId).toBe("tr1");
    expect(out.trade.trace.hubMatchesLatestRow).toBe(true);
    expect(out.trade.listVms.map((r) => r.itemId).sort()).toEqual(["item-a", "item-b"]);

    // store order surfaces
    expect(out.storeOrderCustomer.listVms).toHaveLength(2);
    expect(out.storeOrderCustomer.listVms[0]?.storeName).toBe("맛집");
    expect(out.storeOrderCustomer.trace.hubMatchesLatestRow).toBe(true);
    expect(out.storeOrderOwner.listVms[0]?.customerName).toBe("고객X");
    expect(out.storeOrderOwner.trace.cacheKey).toContain("surface:owner");
    expect(out.storeOrderCustomer.trace.cacheKey).toContain("surface:customer");
    expect(out.storeOrderCustomer.trace.cacheKey).not.toBe(out.storeOrderOwner.trace.cacheKey);

    // badges
    expect(out.badge.messengerNav).toBe(2); // gd unread rooms 1 + group 1
    expect(out.badge.tradeHub).toBe(1);
    expect(out.badge.storeOrderHub).toBe(1);
    expect(out.shell.shellDoesNotSetOsBadge).toBe(true);
    expect(out.shell.productionWiring).toBe(false);

    // warm cache
    const warm = readPhase11cWarmCache({ viewerUserId: VIEWER, generation: "11" });
    expect(warm.general_direct).toBe(1);
    expect(warm.group).toBe(1);
    expect(warm.trade).toBe(2);
    expect(warm.store_order_customer).toBe(2);
    expect(warm.store_order_owner).toBe(1);
  });

  it("cache partial keeps other rows; tombstone removes; foreign namespace 0", async () => {
    await runPhase11cColdIsolatedPipeline({
      viewerUserId: VIEWER,
      generation: "20",
      sources: sources(),
    });
    const key = tradePhase6Cache.buildCacheKey({ viewerUserId: VIEWER, generation: "20" });
    const before = tradePhase6Cache.readSnapshot(key)!;
    expect(before.rows).toHaveLength(2);
    tradePhase6Cache.applyPartial(
      key,
      {
        generation: "21",
        rows: [
          {
            ...before.rows[0]!,
            lastMessage: "부분갱신",
            generation: "21",
          },
        ],
      },
      "isolated_harness"
    );
    const afterPartial = tradePhase6Cache.readSnapshot(key)!;
    expect(afterPartial.rows).toHaveLength(2);
    expect(afterPartial.rows.find((r) => r.roomId === "tr1")?.lastMessage).toBe("부분갱신");

    tradePhase6Cache.applyTombstones(
      key,
      [
        {
          domain: "trade",
          identityKey: before.rows[1]!.domainIdentityKey,
          roomId: before.rows[1]!.roomId,
          generation: "22",
          reason: "tombstone",
        },
      ],
      "22",
      "isolated_harness"
    );
    expect(tradePhase6Cache.readSnapshot(key)!.rows).toHaveLength(1);

    expect(() =>
      generalDirectPhase6Cache.writeFullSnapshot(
        "chat.trade.snapshot.v1:x",
        {
          domain: "general_direct",
          viewerUserId: VIEWER,
          generation: "1",
          schemaVersion: DOMAIN_BOOTSTRAP_SCHEMA_VERSION,
          producedAt: new Date().toISOString(),
          rows: [],
        },
        "isolated_harness"
      )
    ).toThrow(/namespace/);
  });

  it("realtime: idempotent / stale unread after read / surfaces isolated", async () => {
    const cold = await runPhase11cColdIsolatedPipeline({
      viewerUserId: VIEWER,
      generation: "30",
      sources: sources(),
    });
    const sim = simulatePhase11cRealtimePipeline({
      viewerUserId: VIEWER,
      generalDirectRows: cold.generalDirect.rows,
      groupRows: cold.group.rows,
      tradeRows: cold.trade.rows,
      storeOrderCustomerRows: cold.storeOrderCustomer.rows,
      storeOrderOwnerRows: cold.storeOrderOwner.rows,
    });

    const gdDup = sim.general_direct.results.filter((r) => r.eventType === "message_created");
    expect(gdDup.some((r) => r.status === "applied")).toBe(true);
    expect(gdDup.some((r) => r.status === "noop_duplicate")).toBe(true);
    expect(
      sim.general_direct.results.some(
        (r) => r.status === "rejected" && r.reason === "stale_unread_after_read"
      )
    ).toBe(true);
    expect(sim.storeOrderSurfaceIsolated).toBe(true);
    expect(sim.tradeHubChangedOnly).toBe(true);
  });

  it("stale generation rejected on cache write", async () => {
    await runPhase11cColdIsolatedPipeline({
      viewerUserId: VIEWER,
      generation: "40",
      sources: sources(),
    });
    const key = storeOrderPhase6Cache.buildCacheKey({
      viewerUserId: VIEWER,
      surfaceRole: "customer",
      generation: "40",
    });
    const snap = storeOrderPhase6Cache.readSnapshot(key)!;
    expect(() =>
      storeOrderPhase6Cache.writeFullSnapshot(
        key,
        { ...snap, generation: "39" },
        "isolated_harness"
      )
    ).toThrow(/stale/);
  });
});
