/**
 * Phase 6 — Domain Bootstrap / Cache 계약 테스트 (§13 A–I).
 * production UI wiring · dual-write · cutover ON 없음.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DOMAIN_BOOTSTRAP_SCHEMA_VERSION } from "@/lib/messenger/contracts/domain-bootstrap-cache";
import { PHASE1_DEFAULT_CUTOVER, assertNoDualWrite } from "@/lib/messenger/contracts/cutover";
import { PHASE6_DOMAIN_CACHE_PRODUCTION_WIRING } from "@/lib/messenger/contracts/domain-bootstrap-cache";
import { MESSENGER_DOMAIN_BUILD_PHASE_ORDER } from "@/lib/messenger/contracts/phase-order";
import {
  createGeneralDirectFixtureBootstrapSource,
  generalDirectPhase6Cache,
  runGeneralDirectBootstrap,
} from "@/lib/messenger/general-direct/phase6-bootstrap";
import { buildGeneralDirectIdentity } from "@/lib/messenger/general-direct/identity";
import { GENERAL_DIRECT_DOMAIN, type GeneralDirectRoomInput } from "@/lib/messenger/general-direct/types";
import {
  createGroupFixtureBootstrapSource,
  groupPhase6Cache,
  runGroupBootstrap,
} from "@/lib/messenger/group/phase6-bootstrap";
import { GROUP_DOMAIN, type GroupRoomInput } from "@/lib/messenger/group/types";
import {
  createTradeFixtureBootstrapSource,
  runTradeBootstrap,
  tradePhase6Cache,
} from "@/lib/messenger/trade/phase6-bootstrap";
import { buildTradeIdentity } from "@/lib/messenger/trade/identity";
import { TRADE_DOMAIN, type TradeRoomInput } from "@/lib/messenger/trade/types";
import {
  buildStoreOrderCacheKeyForSurface,
  createStoreOrderFixtureBootstrapSource,
  runStoreOrderBootstrap,
  storeOrderPhase6Cache,
} from "@/lib/messenger/store-order/phase6-bootstrap";
import { STORE_ORDER_DOMAIN, type StoreOrderRoomInput } from "@/lib/messenger/store-order/types";
import { DomainBootstrapHttpError } from "@/lib/messenger/contracts/bootstrap-api-response";
import { composeMessengerInboxRows } from "@/lib/messenger/shell/home-compose";
import { buildGeneralDirectRowModel } from "@/lib/messenger/general-direct/row-model";
import { buildGroupRowModel } from "@/lib/messenger/group/row-model";

function gdRoom(
  partial: Partial<GeneralDirectRoomInput> & { roomId: string; peerUserId: string }
): GeneralDirectRoomInput {
  const peer = partial.peerUserId;
  return {
    roomId: partial.roomId,
    chatDomain: partial.chatDomain ?? GENERAL_DIRECT_DOMAIN,
    domainIdentityKey:
      partial.domainIdentityKey ??
      buildGeneralDirectIdentity("viewer-1", peer).identityKey,
    peerUserId: peer,
    peerDisplayName: partial.peerDisplayName ?? "친구",
    peerAvatarUrl: partial.peerAvatarUrl ?? null,
    lastMessage: partial.lastMessage ?? "hi",
    lastMessageAt: partial.lastMessageAt ?? "2026-07-14T12:00:00.000Z",
    unreadCount: partial.unreadCount ?? 0,
  };
}

function groupRoom(
  partial: Partial<GroupRoomInput> & { roomId: string; memberUserIds?: string[] }
): GroupRoomInput & { memberUserIds?: string[] } {
  const groupId = partial.groupId ?? partial.roomId;
  return {
    roomId: partial.roomId,
    groupId,
    chatDomain: partial.chatDomain ?? GROUP_DOMAIN,
    domainIdentityKey: partial.domainIdentityKey ?? `group:${groupId}`,
    groupName: partial.groupName ?? "그룹",
    groupImageUrl: partial.groupImageUrl ?? null,
    groupSubtype: partial.groupSubtype ?? "private_group",
    memberCount: partial.memberCount ?? 2,
    lastMessage: partial.lastMessage ?? "모임",
    lastMessageAt: partial.lastMessageAt ?? "2026-07-14T12:00:00.000Z",
    unreadCount: partial.unreadCount ?? 0,
    memberUserIds: partial.memberUserIds ?? ["viewer-1"],
  };
}

function tradeRoom(
  partial: Partial<TradeRoomInput> & { roomId: string; itemId: string }
): TradeRoomInput {
  const seller = partial.sellerUserId ?? "viewer-1";
  const counter = partial.counterpartyUserId ?? "buyer-1";
  return {
    roomId: partial.roomId,
    chatDomain: partial.chatDomain ?? TRADE_DOMAIN,
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
    itemTitle: partial.itemTitle ?? "상품",
    itemImageUrl: partial.itemImageUrl ?? null,
    peerDisplayName: partial.peerDisplayName ?? "구매자",
    peerAvatarUrl: null,
    lastMessage: partial.lastMessage ?? "문의",
    lastMessageAt: partial.lastMessageAt ?? "2026-07-14T12:00:00.000Z",
    unreadCount: partial.unreadCount ?? 1,
    tradeStatusLabel: "판매중",
  };
}

function orderRoom(
  partial: Partial<StoreOrderRoomInput> & {
    roomId: string;
    orderId: string;
    storeOwnerUserIds?: string[];
  }
): StoreOrderRoomInput & { storeOwnerUserIds: string[]; participantUserIds: string[] } {
  const customer = partial.customerUserId ?? "viewer-1";
  const owners = partial.storeOwnerUserIds ?? ["owner-1"];
  return {
    roomId: partial.roomId,
    chatDomain: partial.chatDomain ?? STORE_ORDER_DOMAIN,
    domainIdentityKey: partial.domainIdentityKey ?? `store_order:${partial.orderId}`,
    orderId: partial.orderId,
    storeId: partial.storeId ?? "store-1",
    storeName: partial.storeName ?? "맛집",
    storeImageUrl: null,
    customerUserId: customer,
    customerName: partial.customerName ?? "고객",
    customerAvatarUrl: null,
    latestChatMessageText: partial.latestChatMessageText ?? "주문OK",
    latestChatMessageType: "text",
    latestChatMessageAt: partial.latestChatMessageAt ?? "2026-07-14T12:00:00.000Z",
    unreadCount: partial.unreadCount ?? 0,
    orderStatusLabel: "준비중",
    storeOwnerUserIds: owners,
    participantUserIds: [customer, ...owners],
  };
}

describe("Phase 6 A — 서버 Domain 격리", () => {
  it("general API rejects trade row", async () => {
    await expect(
      runGeneralDirectBootstrap({
        viewerUserId: "viewer-1",
        generation: "1",
        snapshotKind: "full",
        source: createGeneralDirectFixtureBootstrapSource([
          {
            ...gdRoom({ roomId: "r1", peerUserId: "p1" }),
            chatDomain: TRADE_DOMAIN,
            domainIdentityKey: "trade:i:s:b",
          },
        ]),
      })
    ).rejects.toThrow(/foreign/);
  });

  it("group API rejects general row", async () => {
    await expect(
      runGroupBootstrap({
        viewerUserId: "viewer-1",
        generation: "1",
        snapshotKind: "full",
        source: createGroupFixtureBootstrapSource([
          {
            ...groupRoom({ roomId: "g1" }),
            chatDomain: GENERAL_DIRECT_DOMAIN,
            domainIdentityKey: "general_direct:a:b",
          },
        ]),
      })
    ).rejects.toThrow(/foreign/);
  });

  it("trade API rejects store_order row", async () => {
    await expect(
      runTradeBootstrap({
        viewerUserId: "viewer-1",
        generation: "1",
        snapshotKind: "full",
        source: createTradeFixtureBootstrapSource([
          {
            ...tradeRoom({ roomId: "t1", itemId: "i1" }),
            chatDomain: STORE_ORDER_DOMAIN,
            domainIdentityKey: "store_order:o1",
          } as TradeRoomInput,
        ]),
      })
    ).rejects.toThrow(/foreign/);
  });

  it("store_order API rejects general row", async () => {
    await expect(
      runStoreOrderBootstrap({
        viewerUserId: "viewer-1",
        generation: "1",
        snapshotKind: "full",
        surfaceRole: "customer",
        source: createStoreOrderFixtureBootstrapSource([
          {
            ...orderRoom({ roomId: "o1", orderId: "ord-1" }),
            chatDomain: GENERAL_DIRECT_DOMAIN,
            domainIdentityKey: "general_direct:a:b",
          },
        ]),
      })
    ).rejects.toThrow(/foreign/);
  });
});

describe("Phase 6 B — 권한 누수", () => {
  it("other user general room → 403", async () => {
    await expect(
      runGeneralDirectBootstrap({
        viewerUserId: "intruder",
        generation: "1",
        snapshotKind: "full",
        source: createGeneralDirectFixtureBootstrapSource([
          gdRoom({ roomId: "r1", peerUserId: "p1" }),
        ]),
      })
    ).rejects.toMatchObject({ status: 403 } satisfies Partial<DomainBootstrapHttpError>);
  });

  it("private group non-member → 403", async () => {
    await expect(
      runGroupBootstrap({
        viewerUserId: "stranger",
        generation: "1",
        snapshotKind: "full",
        source: createGroupFixtureBootstrapSource([
          groupRoom({ roomId: "g1", memberUserIds: ["viewer-1"] }),
        ]),
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("trade room for different product party → 403", async () => {
    await expect(
      runTradeBootstrap({
        viewerUserId: "stranger",
        generation: "1",
        snapshotKind: "full",
        source: createTradeFixtureBootstrapSource([tradeRoom({ roomId: "t1", itemId: "i1" })]),
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("other customer order → 403", async () => {
    await expect(
      runStoreOrderBootstrap({
        viewerUserId: "viewer-1",
        generation: "1",
        snapshotKind: "full",
        surfaceRole: "customer",
        source: {
          loadRooms: async () => [
            orderRoom({ roomId: "o1", orderId: "ord-1", customerUserId: "other-cust" }),
          ],
        },
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("unauthorized store owner context → 403", async () => {
    await expect(
      runStoreOrderBootstrap({
        viewerUserId: "viewer-1",
        generation: "1",
        snapshotKind: "full",
        surfaceRole: "owner",
        source: {
          loadRooms: async () => [
            orderRoom({
              roomId: "o1",
              orderId: "ord-1",
              customerUserId: "cust-1",
              storeOwnerUserIds: ["real-owner"],
            }),
          ],
        },
      })
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("Phase 6 C/D/E/F — Snapshot · Partial · Cache · Stale", () => {
  it("domain snapshot rows + generation + empty partial no wipe", async () => {
    const boot = await runGeneralDirectBootstrap({
      viewerUserId: "viewer-1",
      generation: "10",
      snapshotKind: "full",
      source: createGeneralDirectFixtureBootstrapSource([
        gdRoom({ roomId: "r1", peerUserId: "p1" }),
        gdRoom({ roomId: "r2", peerUserId: "p2" }),
      ]),
    });
    expect(boot.domain).toBe(GENERAL_DIRECT_DOMAIN);
    expect(boot.schemaVersion).toBe(DOMAIN_BOOTSTRAP_SCHEMA_VERSION);
    expect(boot.rows).toHaveLength(2);
    expect(new Set(boot.rows.map((r) => r.domainIdentityKey)).size).toBe(2);
    expect(boot.generation).toBe("10");

    const key = generalDirectPhase6Cache.buildCacheKey({ viewerUserId: "viewer-1" });
    generalDirectPhase6Cache.writeFullSnapshot(
      key,
      {
        domain: GENERAL_DIRECT_DOMAIN,
        viewerUserId: "viewer-1",
        generation: boot.generation,
        schemaVersion: boot.schemaVersion,
        producedAt: boot.producedAt,
        rows: [...boot.rows],
      },
      "test"
    );
    const afterEmptyPartial = generalDirectPhase6Cache.applyPartial(
      key,
      { generation: "11", rows: [] },
      "test"
    );
    expect(afterEmptyPartial.rows).toHaveLength(2);

    const afterTombstone = generalDirectPhase6Cache.applyTombstones(
      key,
      [
        {
          domain: GENERAL_DIRECT_DOMAIN,
          identityKey: boot.rows[0]!.domainIdentityKey,
          roomId: boot.rows[0]!.roomId,
          generation: "12",
          reason: "left",
        },
      ],
      "12",
      "test"
    );
    expect(afterTombstone.rows).toHaveLength(1);

    expect(() =>
      generalDirectPhase6Cache.writeFullSnapshot(
        key,
        {
          domain: GENERAL_DIRECT_DOMAIN,
          viewerUserId: "viewer-1",
          generation: "5",
          schemaVersion: boot.schemaVersion,
          producedAt: boot.producedAt,
          rows: [...boot.rows],
        },
        "test"
      )
    ).toThrow(/stale_generation/);

    expect(() => generalDirectPhase6Cache.clearAllDomains()).toThrow(/clear_all_domains_forbidden/);

    const tradeKey = tradePhase6Cache.buildCacheKey({ viewerUserId: "viewer-1" });
    expect(() => generalDirectPhase6Cache.readSnapshot(tradeKey)).toThrow(
      /namespace_forbidden|foreign_namespace/
    );
  });

  it("cross-domain clear does not wipe other domain cache", async () => {
    const gdKey = generalDirectPhase6Cache.buildCacheKey({ viewerUserId: "viewer-x" });
    const gKey = groupPhase6Cache.buildCacheKey({ viewerUserId: "viewer-x" });
    generalDirectPhase6Cache.writeFullSnapshot(
      gdKey,
      {
        domain: GENERAL_DIRECT_DOMAIN,
        viewerUserId: "viewer-x",
        generation: "1",
        schemaVersion: DOMAIN_BOOTSTRAP_SCHEMA_VERSION,
        producedAt: new Date().toISOString(),
        rows: [],
      },
      "test"
    );
    groupPhase6Cache.writeFullSnapshot(
      gKey,
      {
        domain: GROUP_DOMAIN,
        viewerUserId: "viewer-x",
        generation: "1",
        schemaVersion: DOMAIN_BOOTSTRAP_SCHEMA_VERSION,
        producedAt: new Date().toISOString(),
        rows: [],
      },
      "test"
    );
    generalDirectPhase6Cache.clearViewerDomain("viewer-x", "test");
    expect(generalDirectPhase6Cache.readSnapshot(gdKey)).toBeNull();
    expect(groupPhase6Cache.readSnapshot(gKey)).not.toBeNull();
  });
});

describe("Phase 6 G/H — Store Order surface · Hub", () => {
  it("customer/owner cache keys differ; multiple orders same store", async () => {
    const custKey = buildStoreOrderCacheKeyForSurface({
      viewerUserId: "owner-1",
      surfaceRole: "customer",
    });
    const ownerKey = buildStoreOrderCacheKeyForSurface({
      viewerUserId: "owner-1",
      surfaceRole: "owner",
    });
    expect(custKey).not.toBe(ownerKey);
    expect(custKey).toContain("surface:customer");
    expect(ownerKey).toContain("surface:owner");

    const boot = await runStoreOrderBootstrap({
      viewerUserId: "owner-1",
      generation: "3",
      snapshotKind: "full",
      surfaceRole: "owner",
      source: createStoreOrderFixtureBootstrapSource([
        orderRoom({
          roomId: "o1",
          orderId: "ord-1",
          customerUserId: "c1",
          storeOwnerUserIds: ["owner-1"],
          latestChatMessageText: "첫 주문",
        }),
        orderRoom({
          roomId: "o2",
          orderId: "ord-2",
          customerUserId: "c2",
          storeOwnerUserIds: ["owner-1"],
          latestChatMessageText: "둘째 주문",
          latestChatMessageAt: "2026-07-14T13:00:00.000Z",
        }),
      ]),
    });
    expect(boot.rows).toHaveLength(2);
    expect(boot.hub?.previewText).toContain("둘째");
    expect(boot.hub?.previewText).not.toMatch(/준비중|ord-/);
    expect(boot.hub?.unreadRoomCount).toBeDefined();

    storeOrderPhase6Cache.writeFullSnapshot(
      ownerKey,
      {
        domain: STORE_ORDER_DOMAIN,
        viewerUserId: "owner-1",
        generation: "3",
        schemaVersion: DOMAIN_BOOTSTRAP_SCHEMA_VERSION,
        producedAt: boot.producedAt,
        rows: [...boot.rows],
        surfaceRole: "owner",
      },
      "test"
    );
    expect(storeOrderPhase6Cache.inspectMetadata(ownerKey)?.surfaceRole).toBe("owner");
  });

  it("trade hub preview is real message; trade rows not in inbox compose", async () => {
    const trade = await runTradeBootstrap({
      viewerUserId: "viewer-1",
      generation: "1",
      snapshotKind: "full",
      source: createTradeFixtureBootstrapSource([
        tradeRoom({ roomId: "t1", itemId: "i1", lastMessage: "네고할까요" }),
      ]),
    });
    expect(trade.hub?.previewText).toContain("네고");
    expect(trade.hub?.previewText).not.toBe("상품");

    const gdRow = buildGeneralDirectRowModel({
      roomId: "r1",
      chatDomain: GENERAL_DIRECT_DOMAIN,
      domainIdentityKey: buildGeneralDirectIdentity("viewer-1", "p1").identityKey,
      peerUserId: "p1",
      peerDisplayName: "친구",
      peerAvatarUrl: null,
      lastMessage: "안녕",
      lastMessageAt: "2026-07-14T10:00:00.000Z",
      unreadCount: 0,
      updatedAt: "2026-07-14T10:00:00.000Z",
      generation: "1",
    });
    const gRow = buildGroupRowModel({
      roomId: "g1",
      chatDomain: GROUP_DOMAIN,
      domainIdentityKey: "group:g1",
      groupId: "g1",
      groupName: "그룹",
      groupImageUrl: null,
      groupSubtype: "private_group",
      lastMessage: "모임",
      lastMessageAt: "2026-07-14T11:00:00.000Z",
      unreadCount: 0,
      updatedAt: "2026-07-14T11:00:00.000Z",
      generation: "1",
      memberCount: 2,
    });
    const inbox = composeMessengerInboxRows([gdRow], [gRow]);
    const domains = inbox.map((e) => e.domain as string);
    expect(domains.every((d) => d === "general_direct" || d === "group")).toBe(true);
    expect(domains).not.toContain(TRADE_DOMAIN);
    expect(domains).not.toContain(STORE_ORDER_DOMAIN);
  });
});

describe("Phase 6 I — Runtime 격리", () => {
  it("cutover OFF, production wiring false, no dual-write, phase 6 done", () => {
    expect(PHASE6_DOMAIN_CACHE_PRODUCTION_WIRING).toBe(false);
    expect(PHASE1_DEFAULT_CUTOVER.every((c) => c.mode === "off")).toBe(true);
    expect(() => assertNoDualWrite(["legacy", "domain"])).toThrow(/dual_write/);
    expect(MESSENGER_DOMAIN_BUILD_PHASE_ORDER.find((p) => p.phase === 6)?.status).toBe("done");

    const domainAuthorityConnectAllow = [
      "@/lib/messenger/contracts/domain-realtime-authority-product-bridge",
      "@/lib/messenger/contracts/domain-notification-authority-product-bridge",
      "@/lib/messenger/contracts/domain-badge-authority-product-bridge",
      "@/lib/messenger/contracts/domain-notification-authority",
      "@/lib/messenger/contracts/domain-atomic-read-authority",
      "@/lib/messenger/contracts/domain-badge-authority",
      "@/lib/messenger/contracts/domain-cache-authority",
      "@/lib/messenger/contracts/domain-owner-surface-authority",
    ];
    const root = path.resolve(__dirname, "../../..");
    const checkTree = (rel: string) => {
      const abs = path.join(root, rel);
      if (!fs.existsSync(abs)) return;
      const walk = (dir: string): string[] => {
        const out: string[] = [];
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, ent.name);
          if (ent.isDirectory()) {
            if (ent.name === "node_modules" || ent.name === ".next") continue;
            out.push(...walk(p));
          } else if (/\.(ts|tsx|js|mjs)$/.test(ent.name)) out.push(p);
        }
        return out;
      };
      for (const file of walk(abs)) {
        const src = fs.readFileSync(file, "utf8");
        const refs = [...src.matchAll(/@\/lib\/messenger\/[a-zA-Z0-9_./-]+/g)].map((m) => m[0]);
        const forbidden = refs.filter((r) => !domainAuthorityConnectAllow.includes(r));
        if (forbidden.length === 0) continue;
        const relFile = path.relative(root, file).replace(/\\/g, "/");
        if (rel.startsWith("app") && !relFile.startsWith("app/api/messenger/")) {
          throw new Error(`forbidden messenger import in ${relFile}: ${forbidden.join(",")}`);
        }
        if (rel.startsWith("lib/community-messenger")) {
          throw new Error(`forbidden messenger import in ${relFile}: ${forbidden.join(",")}`);
        }
      }
    };
    checkTree("lib/community-messenger");
    checkTree("app/(main)");
  });
});
