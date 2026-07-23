/**
 * Phase 11A — Domain DB Loader + Disabled 503 Gate + isolation tests.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  DIBAY_MESSENGER_DOMAIN_API_ISOLATED_HEADER,
  DIBAY_MESSENGER_DOMAIN_API_ISOLATED_VALUE,
  DIBAY_MESSENGER_DOMAIN_API_NOT_ENABLED,
  PHASE11A_DOMAIN_LOADER_PRODUCTION_WIRING,
  domainBootstrapApiDisabledResponse,
  resolveDomainBootstrapApiAccessMode,
} from "@/lib/messenger/contracts/phase11a-domain-api-gate";
import {
  PHASE11A_LOADER_QUERY_BUDGETS,
  pickAuthoritativeMessagePreview,
} from "@/lib/messenger/contracts/domain-loader-batch-phase11a";
import {
  clearPhase11aIsolatedBootstrapSources,
  registerPhase11aIsolatedBootstrapSource,
} from "@/lib/messenger/contracts/phase11a-isolated-source-registry";
import { createPhase6EmptyBootstrapSource } from "@/lib/messenger/contracts/phase6-api-route";
import { MESSENGER_DOMAIN_BUILD_PHASE_ORDER } from "@/lib/messenger/contracts/phase-order";
import { PHASE1_DEFAULT_CUTOVER } from "@/lib/messenger/contracts/cutover";
import {
  createGeneralDirectInMemoryLoaderSource,
  mapGeneralDirectLoaderBatchRows,
} from "@/lib/messenger/general-direct/phase11a-db-loader";
import { runGeneralDirectBootstrap } from "@/lib/messenger/general-direct/phase6-bootstrap";
import {
  createGroupInMemoryLoaderSource,
  mapGroupLoaderBatchRows,
} from "@/lib/messenger/group/phase11a-db-loader";
import { runGroupBootstrap } from "@/lib/messenger/group/phase6-bootstrap";
import {
  createTradeInMemoryLoaderSource,
  mapTradeLoaderBatchRows,
} from "@/lib/messenger/trade/phase11a-db-loader";
import { runTradeBootstrap } from "@/lib/messenger/trade/phase6-bootstrap";
import { buildTradeIdentity } from "@/lib/messenger/trade/identity";
import {
  createStoreOrderCustomerInMemoryLoaderSource,
  mapStoreOrderCustomerLoaderBatchRows,
} from "@/lib/messenger/store-order/phase11a-db-loader-customer";
import {
  createStoreOrderOwnerInMemoryLoaderSource,
  mapStoreOrderOwnerLoaderBatchRows,
} from "@/lib/messenger/store-order/phase11a-db-loader-owner";
import { runStoreOrderBootstrap } from "@/lib/messenger/store-order/phase6-bootstrap";
import { buildStoreOrderIdentityKey } from "@/lib/messenger/store-order/design-lock";
import { generalDirectSnapshotRowsToRowModels } from "@/lib/messenger/general-direct/phase6-bootstrap";
import { groupSnapshotRowsToRowModels } from "@/lib/messenger/group/phase6-bootstrap";

afterEach(() => {
  clearPhase11aIsolatedBootstrapSources();
});

describe("Phase 11A A — API Disabled Gate", () => {
  it("production request resolves to production_disabled (legacy name); Phase11B uses secret gate", () => {
    expect(
      resolveDomainBootstrapApiAccessMode(new Request("http://localhost/api/messenger/general/bootstrap"))
    ).toBe("production_disabled");
    // Phase 11A helper still treats isolated header alone as isolated — production routes use Phase11B secret gate instead.
    expect(PHASE11A_DOMAIN_LOADER_PRODUCTION_WIRING).toBe(false);
    expect(() => createPhase6EmptyBootstrapSource()).toThrow(/empty_bootstrap_source_forbidden/);
  });

  it("disabled body uses locked error code (not empty 200)", async () => {
    const res = domainBootstrapApiDisabledResponse("trade");
    const body = await res.json();
    expect(body.code).toBe(DIBAY_MESSENGER_DOMAIN_API_NOT_ENABLED);
    expect(body.cutoverState).toBe("off");
    expect(body.domain).toBe("trade");
    expect(Array.isArray(body.rows)).toBe(false);
  });
});

describe("Phase 11A B/C/D/E/F — Loaders", () => {
  const tradeIdA = buildTradeIdentity({
    itemId: "item-a",
    sellerUserId: "seller-1",
    counterpartyUserId: "buyer-1",
  }).identityKey;
  const tradeIdB = buildTradeIdentity({
    itemId: "item-b",
    sellerUserId: "seller-1",
    counterpartyUserId: "buyer-1",
  }).identityKey;

  it("general_direct: viewer-only, peer presentation, real message, identity duplicate reject", async () => {
    const source = createGeneralDirectInMemoryLoaderSource([
      {
        roomId: "r1",
        chatDomain: "general_direct",
        domainIdentityKey: "general_direct:buyer-1:seller-1",
        unreadCount: 2,
        peerUserId: "seller-1",
        peerDisplayName: "민수",
        peerAvatarUrl: "https://a.png",
        latestMessage: { roomId: "r1", bodyText: "안녕", isSystem: false, createdAt: "2026-07-14T12:00:00.000Z" },
        roomLastMessageSummary: "상품요약금지",
        roomTitle: "방제목금지",
      },
      {
        roomId: "r-other",
        chatDomain: "general_direct",
        domainIdentityKey: "general_direct:other-a:other-b",
        unreadCount: 1,
        peerUserId: "other-a",
        peerDisplayName: "타인",
        peerAvatarUrl: null,
        latestMessage: { roomId: "r-other", bodyText: "비밀", isSystem: false, createdAt: "2026-07-14T12:00:00.000Z" },
      },
    ]);
    const snap = await runGeneralDirectBootstrap({
      viewerUserId: "buyer-1",
      generation: "1",
      snapshotKind: "full",
      source,
    });
    expect(snap.rows).toHaveLength(1);
    expect(snap.rows[0]!.peerDisplayName).toBe("민수");
    expect(snap.rows[0]!.lastMessage).toBe("안녕");
    expect(snap.rows[0]!.lastMessage).not.toBe("상품요약금지");
    expect(snap.rows.every((r) => r.chatDomain === "general_direct")).toBe(true);

    const models = generalDirectSnapshotRowsToRowModels(snap.rows);
    expect(models[0]!.title).toBe("민수");

    expect(() =>
      mapGeneralDirectLoaderBatchRows({
        viewerUserId: "buyer-1",
        rows: [
          {
            roomId: "r1",
            chatDomain: "general_direct",
            domainIdentityKey: "general_direct:buyer-1:seller-1",
            unreadCount: 0,
            peerUserId: "seller-1",
            peerDisplayName: "A",
            peerAvatarUrl: null,
            latestMessage: null,
          },
          {
            roomId: "r2",
            chatDomain: "general_direct",
            domainIdentityKey: "general_direct:buyer-1:seller-1",
            unreadCount: 0,
            peerUserId: "seller-1",
            peerDisplayName: "A",
            peerAvatarUrl: null,
            latestMessage: null,
          },
        ],
      })
    ).toThrow(/duplicate_identity/);

    expect(() =>
      mapGeneralDirectLoaderBatchRows({
        viewerUserId: "buyer-1",
        failClosedOnUnauthorized: true,
        rows: [
          {
            roomId: "rx",
            chatDomain: "general_direct",
            domainIdentityKey: "general_direct:x:y",
            unreadCount: 0,
            peerUserId: "x",
            peerDisplayName: null,
            peerAvatarUrl: null,
            latestMessage: null,
          },
        ],
      })
    ).toThrow(/forbidden/);
  });

  it("group: group identity display; private non-member forbidden; peer not title", async () => {
    const source = createGroupInMemoryLoaderSource([
      {
        roomId: "g1",
        chatDomain: "group",
        domainIdentityKey: "group:g1",
        groupId: "g1",
        groupSubtype: "private_group",
        groupName: "동네모임",
        groupImageUrl: "https://g.png",
        memberCount: 5,
        unreadCount: 1,
        memberUserIds: ["viewer-1", "u2"],
        latestMessage: {
          roomId: "g1",
          bodyText: "회식합시다",
          isSystem: false,
          createdAt: "2026-07-14T10:00:00.000Z",
        },
        peerDisplayName: "회원명금지",
      },
      {
        roomId: "g-secret",
        chatDomain: "group",
        domainIdentityKey: "group:g-secret",
        groupId: "g-secret",
        groupSubtype: "private_group",
        groupName: "비밀",
        groupImageUrl: null,
        memberCount: 2,
        unreadCount: 1,
        memberUserIds: ["other"],
        latestMessage: null,
      },
    ]);
    const snap = await runGroupBootstrap({
      viewerUserId: "viewer-1",
      generation: "1",
      snapshotKind: "full",
      source,
    });
    expect(snap.rows).toHaveLength(1);
    expect(snap.rows[0]!.groupName).toBe("동네모임");
    const models = groupSnapshotRowsToRowModels(snap.rows);
    expect(models[0]!.title).toBe("동네모임");
    expect(models[0]!.title).not.toBe("회원명금지");

    expect(() =>
      mapGroupLoaderBatchRows({
        viewerUserId: "viewer-1",
        failClosedOnUnauthorized: true,
        rows: [
          {
            roomId: "g-secret",
            chatDomain: "group",
            domainIdentityKey: "group:g-secret",
            groupId: "g-secret",
            groupSubtype: "private_group",
            groupName: "비밀",
            groupImageUrl: null,
            memberCount: 2,
            unreadCount: 0,
            memberUserIds: ["other"],
            latestMessage: null,
          },
        ],
      })
    ).toThrow(/forbidden/);
  });

  it("trade: one row per item identity; same peer different item kept; summary not preview", async () => {
    const source = createTradeInMemoryLoaderSource([
      {
        roomId: "ta",
        chatDomain: "trade",
        domainIdentityKey: tradeIdA,
        itemId: "item-a",
        sellerUserId: "seller-1",
        counterpartyUserId: "buyer-1",
        itemTitle: "자전거",
        itemImageUrl: "https://p.png",
        peerDisplayName: "구매자",
        peerAvatarUrl: null,
        unreadCount: 1,
        latestMessage: {
          roomId: "ta",
          bodyText: "네고?",
          isSystem: false,
          createdAt: "2026-07-14T09:00:00.000Z",
        },
        productSummary: "상품요약",
        tradeStatusLabel: "예약중",
      },
      {
        roomId: "tb",
        chatDomain: "trade",
        domainIdentityKey: tradeIdB,
        itemId: "item-b",
        sellerUserId: "seller-1",
        counterpartyUserId: "buyer-1",
        itemTitle: "책상",
        itemImageUrl: null,
        peerDisplayName: "구매자",
        peerAvatarUrl: null,
        unreadCount: 0,
        latestMessage: {
          roomId: "tb",
          bodyText: "아직 있나요",
          isSystem: false,
          createdAt: "2026-07-14T08:00:00.000Z",
        },
      },
    ]);
    const snap = await runTradeBootstrap({
      viewerUserId: "seller-1",
      generation: "1",
      snapshotKind: "full",
      source,
    });
    expect(snap.rows).toHaveLength(2);
    expect(snap.rows.map((r) => r.itemId).sort()).toEqual(["item-a", "item-b"]);
    expect(snap.rows.find((r) => r.itemId === "item-a")!.lastMessage).toBe("네고?");
    expect(snap.hub.domain).toBe("trade");

    expect(() =>
      mapTradeLoaderBatchRows({
        viewerUserId: "seller-1",
        rows: [
          {
            roomId: "legacy",
            chatDomain: "trade",
            domainIdentityKey: tradeIdA,
            itemId: "item-a",
            sellerUserId: "seller-1",
            counterpartyUserId: "buyer-1",
            itemTitle: "x",
            itemImageUrl: null,
            peerDisplayName: null,
            peerAvatarUrl: null,
            unreadCount: 0,
            latestMessage: null,
            isLegacyProductChatDuplicate: true,
          },
          {
            roomId: "canonical",
            chatDomain: "trade",
            domainIdentityKey: tradeIdA,
            itemId: "item-a",
            sellerUserId: "seller-1",
            counterpartyUserId: "buyer-1",
            itemTitle: "x",
            itemImageUrl: null,
            peerDisplayName: null,
            peerAvatarUrl: null,
            unreadCount: 0,
            latestMessage: null,
          },
        ],
      })
    ).toThrow(/legacy_canonical_both|duplicate_identity/);
  });

  it("store_order customer/owner separated; same store different orders multiple rows", async () => {
    const o1 = buildStoreOrderIdentityKey("order-1");
    const o2 = buildStoreOrderIdentityKey("order-2");
    const customerSource = createStoreOrderCustomerInMemoryLoaderSource([
      {
        roomId: "r1",
        chatDomain: "store_order",
        domainIdentityKey: o1,
        orderId: "order-1",
        storeId: "store-1",
        storeName: "맛집",
        storeImageUrl: "https://s.png",
        customerUserId: "buyer-1",
        unreadCount: 1,
        latestMessage: {
          roomId: "r1",
          bodyText: "배달 언제",
          isSystem: false,
          createdAt: "2026-07-14T07:00:00.000Z",
        },
        orderStatusLabel: "준비중",
      },
      {
        roomId: "r2",
        chatDomain: "store_order",
        domainIdentityKey: o2,
        orderId: "order-2",
        storeId: "store-1",
        storeName: "맛집",
        storeImageUrl: "https://s.png",
        customerUserId: "buyer-1",
        unreadCount: 0,
        latestMessage: {
          roomId: "r2",
          bodyText: "감사",
          isSystem: false,
          createdAt: "2026-07-14T06:00:00.000Z",
        },
      },
    ]);
    const cust = await runStoreOrderBootstrap({
      viewerUserId: "buyer-1",
      generation: "1",
      snapshotKind: "full",
      surfaceRole: "customer",
      source: customerSource,
    });
    expect(cust.rows).toHaveLength(2);
    expect(cust.rows.every((r) => r.storeName === "맛집")).toBe(true);
    expect(cust.rows[0]!.latestChatMessageText).not.toBe("준비중");

    expect(() =>
      mapStoreOrderCustomerLoaderBatchRows({
        viewerUserId: "buyer-1",
        rows: [
          {
            roomId: "r1",
            chatDomain: "store_order",
            domainIdentityKey: o1,
            orderId: "order-1",
            storeId: "store-1",
            storeName: "맛집",
            storeImageUrl: null,
            customerUserId: "buyer-1",
            unreadCount: 0,
            latestMessage: null,
            ownerMemberAvatarUrl: "https://owner.png",
          },
        ],
      })
    ).toThrow(/owner_member/);

    const ownerSource = createStoreOrderOwnerInMemoryLoaderSource([
      {
        roomId: "r1",
        chatDomain: "store_order",
        domainIdentityKey: o1,
        orderId: "order-1",
        storeId: "store-1",
        customerUserId: "buyer-1",
        customerName: "손님",
        customerAvatarUrl: "https://c.png",
        unreadCount: 1,
        storeOwnerUserIds: ["owner-1"],
        latestMessage: {
          roomId: "r1",
          bodyText: "주문변경",
          isSystem: false,
          createdAt: "2026-07-14T07:00:00.000Z",
        },
        storeName: "맛집",
      },
      {
        roomId: "other-store",
        chatDomain: "store_order",
        domainIdentityKey: buildStoreOrderIdentityKey("order-9"),
        orderId: "order-9",
        storeId: "store-OTHER",
        customerUserId: "buyer-x",
        customerName: "다른가게손님",
        customerAvatarUrl: null,
        unreadCount: 1,
        storeOwnerUserIds: ["owner-OTHER"],
        latestMessage: null,
      },
    ]);
    const owner = await runStoreOrderBootstrap({
      viewerUserId: "owner-1",
      generation: "1",
      snapshotKind: "full",
      surfaceRole: "owner",
      source: ownerSource,
    });
    expect(owner.rows).toHaveLength(1);
    expect(owner.rows[0]!.customerName).toBe("손님");
    expect(owner.rows[0]!.storeName).toBeTruthy(); // list may placeholder — customer identity remains

    expect(() =>
      mapStoreOrderOwnerLoaderBatchRows({
        viewerUserId: "owner-1",
        storeIdFilter: "store-1",
        failClosedOnUnauthorized: true,
        rows: [
          {
            roomId: "x",
            chatDomain: "store_order",
            domainIdentityKey: buildStoreOrderIdentityKey("order-9"),
            orderId: "order-9",
            storeId: "store-OTHER",
            customerUserId: "buyer-x",
            customerName: "x",
            customerAvatarUrl: null,
            unreadCount: 0,
            storeOwnerUserIds: ["owner-1"],
            latestMessage: null,
          },
        ],
      })
    ).toThrow(/store_forbidden/);
  });

  it("preview ignores summary/status/title", () => {
    expect(
      pickAuthoritativeMessagePreview({
        latestMessage: {
          roomId: "r",
          bodyText: "실제메시지",
          isSystem: false,
          createdAt: "t",
        },
        roomLastMessageSummary: "주문요약",
        roomTitle: "방제목",
        orderStatusLabel: "배달중",
        productSummary: "상품요약",
      })
    ).toBe("실제메시지");
  });
});

describe("Phase 11A G — Runtime isolation / budgets / phase order", () => {
  it("cutover OFF, wiring OFF, query budgets declare no N+1", () => {
    expect(PHASE1_DEFAULT_CUTOVER.every((c) => c.mode === "off")).toBe(true);
    expect(PHASE11A_DOMAIN_LOADER_PRODUCTION_WIRING).toBe(false);
    for (const b of Object.values(PHASE11A_LOADER_QUERY_BUDGETS)) {
      expect(b.nPlusOne).toBe(false);
      expect(b.batchSelect).toBe(true);
      expect(b.dbQueryCount).toBe(3);
    }
    const p11 = MESSENGER_DOMAIN_BUILD_PHASE_ORDER.find((p) => Number(p.phase) === 11.1);
    expect(p11?.status).toBe("done");
  });

  it("isolated registry wires loader into bootstrap path", async () => {
    registerPhase11aIsolatedBootstrapSource(
      "general_direct",
      createGeneralDirectInMemoryLoaderSource([
        {
          roomId: "r1",
          chatDomain: "general_direct",
          domainIdentityKey: "general_direct:u1:u2",
          unreadCount: 0,
          peerUserId: "u2",
          peerDisplayName: "U2",
          peerAvatarUrl: null,
          latestMessage: {
            roomId: "r1",
            bodyText: "hi",
            isSystem: false,
            createdAt: "2026-07-14T01:00:00.000Z",
          },
        },
      ])
    );
    const { getPhase11aIsolatedGeneralDirectSource } = await import(
      "@/lib/messenger/contracts/phase11a-isolated-source-registry"
    );
    const source = getPhase11aIsolatedGeneralDirectSource();
    expect(source).not.toBeNull();
    const snap = await runGeneralDirectBootstrap({
      viewerUserId: "u1",
      generation: "9",
      snapshotKind: "full",
      source: source!,
    });
    expect(snap.rows).toHaveLength(1);
  });
});
