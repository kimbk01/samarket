/**
 * Phase 4.5–5 — Messenger Shell Integration Contract (PASS).
 *
 * general_direct · group · trade · store_order 상호 비침범 + Shell ViewModel-only 조합.
 * Runtime wiring / cutover 는 범위 밖.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MESSENGER_DOMAIN_BUILD_PHASE_ORDER,
  assertGroupPhaseUnlocked,
  getShellIntegrationPhaseStatus,
} from "@/lib/messenger/contracts/phase-order";
import {
  assertMessengerDomainWrite,
  MESSENGER_SHELL_NAV_BADGE_POLICY,
} from "@/lib/messenger/contracts/ownership";
import {
  assertDomainAllowedOnHomeInboxList,
  assertDomainIsHomeHubOnly,
} from "@/lib/messenger/contracts/home-surface";
import {
  PHASE1_DEFAULT_CUTOVER,
  assertDomainWriterAllowed,
  assertNoDualWrite,
} from "@/lib/messenger/contracts/cutover";
import {
  assertMessengerTabExcludesTradeAndStoreOrder,
  assertShellDoesNotRecomputeDisplay,
  assertShellInboxRowsRejectTradeAndStoreOrder,
  assertShellRejectsForbiddenPayload,
  composeDeliveryNavOrderChatContribution,
  composeMessengerShellHome,
  composeMessengerShellHomeFromViewModels,
  composeMessengerTabBadge,
  composeTradeHubBadgeContribution,
  MESSENGER_SHELL_DOES_NOT_RECOMPUTE_DISPLAY,
  MESSENGER_SHELL_FORBIDDEN_DOMAIN_INTERNAL_IMPORT_SUFFIXES,
  MESSENGER_SHELL_FORBIDS_AUTHORITATIVE_ROOM_ARRAY,
} from "@/lib/messenger/shell";
import {
  buildGeneralDirectBadgeContribution,
  buildGeneralDirectCacheKey,
  GeneralDirectReadonlyMemoryCache,
  resolveGeneralDirectHeaderKind,
  resolveGeneralDirectNotificationDisplay,
  resolveGeneralDirectPreview,
  type GeneralDirectRowModel,
} from "@/lib/messenger/general-direct";
import {
  buildTradeBadgeContribution,
  buildTradeCacheKey,
  buildTradeHubViewModel,
  buildTradeIdentity,
  buildTradeListSnapshot,
  resolveTradeHeaderKind,
  resolveTradeNotificationDisplay,
  resolveTradePreview,
  TRADE_LIST_HREF,
  TradeReadonlyMemoryCache,
} from "@/lib/messenger/trade";
import {
  assertStoreOrderCustomerSurface,
  assertStoreOrderOwnerSurface,
  buildStoreOrderBadgeContribution,
  buildStoreOrderCacheKey,
  buildStoreOrderCustomerHeaderModel,
  buildStoreOrderHubViewModel,
  buildStoreOrderListSnapshot,
  buildStoreOrderOwnerHeaderModel,
  resolveStoreOrderCustomerPresentation,
  resolveStoreOrderNotificationDisplay,
  resolveStoreOrderOwnerPresentation,
  resolveStoreOrderPreview,
  STORE_ORDER_LIST_HREF,
  STORE_ORDER_NAV_MESSENGER_CONTRIBUTION,
  StoreOrderReadonlyMemoryCache,
  toStoreOrderCustomerSurface,
  toStoreOrderOwnerSurface,
} from "@/lib/messenger/store-order";

const ROOT = process.cwd();
const MESSENGER_ROOT = path.resolve(ROOT, "lib/messenger");
const DOMAIN_DIRS = ["general-direct", "group", "trade", "store-order"] as const;

function walkTsFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "__tests__" || ent.name === "node_modules") continue;
      walkTsFiles(abs, out);
    } else if (ent.name.endsWith(".ts") || ent.name.endsWith(".tsx")) {
      out.push(abs);
    }
  }
  return out;
}

function collectCrossDomainImportViolations(): string[] {
  const violations: string[] = [];
  const importRe =
    /from\s+["'](@\/lib\/messenger\/(general-direct|group|trade|store-order)(?:\/[^"']*)?)["']/g;
  for (const domain of DOMAIN_DIRS) {
    const domainRoot = path.join(MESSENGER_ROOT, domain);
    for (const abs of walkTsFiles(domainRoot)) {
      const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
      const src = fs.readFileSync(abs, "utf8");
      for (const match of src.matchAll(importRe)) {
        const spec = match[1]!;
        const importedDomain = match[2]!;
        if (importedDomain !== domain) violations.push(`${rel} → ${spec}`);
      }
    }
  }
  return violations;
}

function gdRow(partial?: Partial<GeneralDirectRowModel>): GeneralDirectRowModel {
  return {
    roomId: partial?.roomId ?? "g1",
    chatDomain: "general_direct",
    domainIdentityKey: partial?.domainIdentityKey ?? "general_direct:a:b",
    title: partial?.title ?? "피어",
    avatarUrl: partial?.avatarUrl ?? null,
    previewText: partial?.previewText ?? "안녕",
    unreadCount: partial?.unreadCount ?? 0,
    href: partial?.href ?? "/community-messenger/r/g1",
    lastMessageAt: partial?.lastMessageAt ?? "2026-07-14T00:00:00.000Z",
  };
}

function sampleTradeHub(overrides?: Partial<ReturnType<typeof buildTradeHubViewModel>>) {
  const listed = buildTradeListSnapshot({
    viewerUserId: "seller-1",
    generation: "1",
    rooms: [
      {
        roomId: "tr1",
        chatDomain: "trade",
        domainIdentityKey: buildTradeIdentity({
          itemId: "item-a",
          sellerUserId: "seller-1",
          counterpartyUserId: "buyer-1",
        }).identityKey,
        itemId: "item-a",
        sellerUserId: "seller-1",
        counterpartyUserId: "buyer-1",
        itemTitle: "자전거",
        itemImageUrl: "https://cdn/i.png",
        peerDisplayName: "구매자",
        peerAvatarUrl: null,
        lastMessage: "네고 가능?",
        lastMessageAt: "2026-07-14T12:00:00.000Z",
        unreadCount: 1,
      },
    ],
  });
  if (!listed.ok) throw new Error(listed.error);
  return { ...buildTradeHubViewModel(listed.snapshot.rows), ...overrides };
}

function sampleStoreOrderHub() {
  const listed = buildStoreOrderListSnapshot({
    viewerUserId: "cust-1",
    generation: "1",
    rooms: [
      {
        roomId: "or1",
        chatDomain: "store_order",
        domainIdentityKey: "store_order:o1",
        orderId: "o1",
        storeId: "store-1",
        storeName: "맛있는집",
        storeImageUrl: "https://cdn/s.png",
        customerUserId: "cust-1",
        customerName: "고객A",
        customerAvatarUrl: null,
        latestChatMessageText: "배달 왔어요",
        latestChatMessageAt: "2026-07-14T12:00:00.000Z",
        unreadCount: 2,
      },
    ],
  });
  if (!listed.ok) throw new Error(listed.error);
  return buildStoreOrderHubViewModel(listed.snapshot.rows);
}

describe("Phase 4.5 Shell Integration — gate status", () => {
  it("phase 4.5 is pass; Phase 5 group done", () => {
    expect(getShellIntegrationPhaseStatus()).toBe("pass");
    expect(MESSENGER_DOMAIN_BUILD_PHASE_ORDER.find((p) => p.phase === 4.5)?.status).toBe("pass");
    expect(MESSENGER_DOMAIN_BUILD_PHASE_ORDER.find((p) => p.phase === 5)?.status).toBe("done");
    expect(() => assertGroupPhaseUnlocked("pass")).not.toThrow();
    expect(() => assertGroupPhaseUnlocked("partial")).toThrow(/blocked_until_phase_4_5/);
  });
});

describe("Phase 4.5 — required PASS contracts (1–15)", () => {
  it("1 Domain 간 내부 import 0", () => {
    expect(collectCrossDomainImportViolations()).toEqual([]);
  });

  it("2 Shell raw Room[] 소유 0", () => {
    expect(MESSENGER_SHELL_FORBIDS_AUTHORITATIVE_ROOM_ARRAY).toBe(true);
    expect(() => assertShellRejectsForbiddenPayload("raw_room")).toThrow(/forbids_input:raw_room/);
    expect(() => assertShellRejectsForbiddenPayload("bootstrap_raw")).toThrow(/bootstrap_raw/);
  });

  it("3 trade/store_order 는 Hub 만 홈 Shell에 전달", () => {
    const home = composeMessengerShellHomeFromViewModels({
      generalDirectRows: [gdRow()],
      tradeHub: sampleTradeHub(),
      storeOrderHub: sampleStoreOrderHub(),
    });
    expect(home.tradeHub.hrefToTradeList).toBe(TRADE_LIST_HREF);
    expect(home.storeOrderHub.hrefToOrderList).toBe(STORE_ORDER_LIST_HREF);
    expect("roomId" in home.tradeHub).toBe(false);
    expect("orderId" in home.storeOrderHub).toBe(false);
  });

  it("4 general_direct + group inbox rows; trade/store_order hub-only", () => {
    const home = composeMessengerShellHome({
      generalDirectRows: [gdRow()],
      tradeHub: sampleTradeHub(),
      storeOrderHub: sampleStoreOrderHub(),
    });
    expect(home.generalDirectRows.every((r) => r.chatDomain === "general_direct")).toBe(true);
    expect(home.groupRows).toEqual([]);
    expect(() => assertDomainAllowedOnHomeInboxList("trade")).toThrow(/forbids_domain/);
    expect(() => assertDomainIsHomeHubOnly("trade")).not.toThrow();
  });

  it("5 trade/store_order nav_messenger contribution 0", () => {
    const tradeListed = buildTradeListSnapshot({
      viewerUserId: "seller-1",
      generation: "1",
      rooms: [
        {
          roomId: "tr1",
          chatDomain: "trade",
          domainIdentityKey: buildTradeIdentity({
            itemId: "item-a",
            sellerUserId: "seller-1",
            counterpartyUserId: "buyer-1",
          }).identityKey,
          itemId: "item-a",
          sellerUserId: "seller-1",
          counterpartyUserId: "buyer-1",
          itemTitle: "자전거",
          itemImageUrl: null,
          peerDisplayName: "구매자",
          peerAvatarUrl: null,
          lastMessage: "m",
          lastMessageAt: "2026-07-14T12:00:00.000Z",
          unreadCount: 2,
        },
      ],
    });
    expect(tradeListed.ok).toBe(true);
    if (!tradeListed.ok) return;
    expect(buildTradeBadgeContribution(tradeListed.snapshot.rows).navMessengerContribution).toBe(0);

    const orderListed = buildStoreOrderListSnapshot({
      viewerUserId: "cust-1",
      generation: "1",
      rooms: [
        {
          roomId: "or1",
          chatDomain: "store_order",
          domainIdentityKey: "store_order:o1",
          orderId: "o1",
          storeId: "store-1",
          storeName: "S",
          storeImageUrl: null,
          customerUserId: "cust-1",
          customerName: "C",
          customerAvatarUrl: null,
          latestChatMessageText: "x",
          latestChatMessageAt: "2026-07-14T12:00:00.000Z",
          unreadCount: 3,
        },
      ],
    });
    expect(orderListed.ok).toBe(true);
    if (!orderListed.ok) return;
    const soBadge = buildStoreOrderBadgeContribution(orderListed.snapshot.rows);
    expect(soBadge.navMessengerContribution).toBe(STORE_ORDER_NAV_MESSENGER_CONTRIBUTION);
    expect(soBadge.contributesTo).not.toContain("nav_messenger");
    expect(
      composeMessengerTabBadge({ domain: "general_direct", count: 1 }, { domain: "group", count: 0 })
    ).toBe(1);
    expect(() =>
      composeMessengerTabBadge({ domain: "trade" as never, count: 1 }, { domain: "group", count: 0 })
    ).toThrow(/tab_domains/);
    expect(() =>
      assertMessengerTabExcludesTradeAndStoreOrder([{ domain: "store_order", count: 1 }])
    ).toThrow(/forbids_domain/);
    expect(composeTradeHubBadgeContribution({ domain: "trade", count: 4 })).toBe(4);
    expect(composeDeliveryNavOrderChatContribution({ domain: "store_order", count: 5 })).toBe(5);
    expect(MESSENGER_SHELL_NAV_BADGE_POLICY.messengerTabDomains).toEqual(["general_direct", "group"]);
  });

  it("6 store_order Customer/Owner 타입 상호 대체 불가", () => {
    const customer = toStoreOrderCustomerSurface({
      title: "맛있는집",
      avatarUrl: null,
      usedPeerUserFallback: false,
    });
    const owner = toStoreOrderOwnerSurface(
      { title: "고객A", avatarUrl: null, usedPeerUserFallback: false },
      {}
    );
    expect(() => assertStoreOrderCustomerSurface(owner)).toThrow(/customer_surface/);
    expect(() => assertStoreOrderOwnerSurface(customer)).toThrow(/owner_surface/);
    expect(() =>
      resolveStoreOrderCustomerPresentation({
        roomId: "r1",
        chatDomain: "store_order",
        domainIdentityKey: "store_order:o1",
        storeName: "S",
        storeImageUrl: null,
        memberDisplayName: "회원",
      })
    ).toThrow(/member_name/);
    expect(() =>
      resolveStoreOrderOwnerPresentation({
        roomId: "r1",
        chatDomain: "store_order",
        domainIdentityKey: "store_order:o1",
        customerName: "C",
        customerAvatarUrl: null,
        storeNameAsTitle: "S",
      })
    ).toThrow(/store_title/);
  });

  it("7 Header cross-domain 사용 거부", () => {
    expect(() =>
      resolveGeneralDirectHeaderKind({
        roomId: "r",
        chatDomain: "trade",
        domainIdentityKey: "trade:a:b:c",
      })
    ).toThrow(/header_rejects/);
    expect(() =>
      resolveTradeHeaderKind({
        roomId: "r",
        chatDomain: "store_order",
        domainIdentityKey: "store_order:o1",
      })
    ).toThrow(/header_rejects/);
    const orderListed = buildStoreOrderListSnapshot({
      viewerUserId: "cust-1",
      generation: "1",
      rooms: [
        {
          roomId: "or1",
          chatDomain: "store_order",
          domainIdentityKey: "store_order:o1",
          orderId: "o1",
          storeId: "store-1",
          storeName: "매장",
          storeImageUrl: null,
          customerUserId: "cust-1",
          customerName: "고객",
          customerAvatarUrl: null,
          latestChatMessageText: "hi",
          latestChatMessageAt: "2026-07-14T12:00:00.000Z",
          unreadCount: 0,
        },
      ],
    });
    expect(orderListed.ok).toBe(true);
    if (!orderListed.ok) return;
    const item = orderListed.snapshot.rows[0]!;
    expect(buildStoreOrderCustomerHeaderModel(item).kind).toBe("buyer_store");
    expect(buildStoreOrderOwnerHeaderModel(item).kind).toBe("owner_buyer_peer");
  });

  it("8 Preview cross-domain 사용 거부", () => {
    expect(resolveGeneralDirectPreview({ content: "hi", messageType: "text" }).text).toBe("hi");
    expect(resolveTradePreview({ content: "네고", messageType: "text" }).text).toBe("네고");
    expect(
      resolveStoreOrderPreview({
        chatDomain: "store_order",
        latestChatMessage: { text: "주문 왔어요", messageType: "text" },
      }).text
    ).toBe("주문 왔어요");
    expect(() =>
      resolveStoreOrderPreview({
        chatDomain: "trade",
        latestChatMessage: { text: "x", messageType: "text" },
      })
    ).toThrow(/preview_rejects/);
    expect(
      resolveStoreOrderPreview({
        chatDomain: "store_order",
        latestChatMessage: { text: "주문 요약", messageType: "text" },
      }).text
    ).toBe("새 메시지");
  });

  it("9 Notification cross-domain 사용 거부", () => {
    expect(() =>
      resolveGeneralDirectNotificationDisplay({
        chatDomain: "store_order",
        domainIdentityKey: "store_order:o1",
        roomId: "r",
        eventId: "e",
        senderDisplayName: "a",
        senderAvatarUrl: null,
        messagePreview: "m",
      })
    ).toThrow(/notification_rejects/);
    expect(() =>
      resolveTradeNotificationDisplay({
        chatDomain: "general_direct",
        domainIdentityKey: "general_direct:a:b",
        roomId: "r",
        eventId: "e",
        productTitle: "p",
        productImageUrl: null,
        peerDisplayName: "x",
        messagePreview: "m",
      })
    ).toThrow(/notification_rejects/);
    expect(() =>
      resolveStoreOrderNotificationDisplay({
        chatDomain: "trade",
        domainIdentityKey: "trade:i:s:b",
        roomId: "r",
        eventId: "e",
        viewerRole: "customer",
        storeName: "S",
        storeImageUrl: null,
        customerName: null,
        customerAvatarUrl: null,
        messagePreview: "m",
      })
    ).toThrow(/notification_rejects/);
  });

  it("10 Cache namespace cross-domain 접근 거부", () => {
    const gd = new GeneralDirectReadonlyMemoryCache();
    const tr = new TradeReadonlyMemoryCache();
    const so = new StoreOrderReadonlyMemoryCache();
    expect(() => gd.read("chat.trade.x")).toThrow(/namespace_forbidden|foreign/);
    expect(() => tr.read("chat.store_order.x")).toThrow(/namespace_forbidden|foreign/);
    expect(() => so.read("chat.general.x")).toThrow(/namespace_forbidden|foreign/);
    expect(buildGeneralDirectCacheKey({ viewerUserId: "u", generation: "1" }).startsWith("chat.general.")).toBe(
      true
    );
    expect(buildTradeCacheKey({ viewerUserId: "u", generation: "1" }).startsWith("chat.trade.")).toBe(true);
    expect(buildStoreOrderCacheKey({ viewerUserId: "u", generation: "1" }).startsWith("chat.store_order.")).toBe(
      true
    );
  });

  it("11 Shell이 title/avatar/preview 를 재계산하지 않음", () => {
    expect(MESSENGER_SHELL_DOES_NOT_RECOMPUTE_DISPLAY).toBe(true);
    expect(() =>
      assertShellDoesNotRecomputeDisplay({ recomputedTitle: "hack" })
    ).toThrow(/display_recompute_forbidden/);
    const hub = sampleTradeHub();
    const home = composeMessengerShellHome({
      generalDirectRows: [gdRow({ title: "피어A", previewText: "메시지원문" })],
      tradeHub: hub,
      storeOrderHub: sampleStoreOrderHub(),
    });
    expect(home.generalDirectRows[0]?.title).toBe("피어A");
    expect(home.generalDirectRows[0]?.previewText).toBe("메시지원문");
    expect(home.tradeHub.previewText).toBe(hub.previewText);
    expect(home.shellDoesNotRecomputeDisplay).toBe(true);
  });

  it("12 Domain Badge writer 가 다른 Domain contribution 을 수정하지 않음", () => {
    expect(() => assertMessengerDomainWrite("trade", "store_order", "badge")).toThrow(/cross_domain/);
    expect(() => assertMessengerDomainWrite("store_order", "general_direct", "badge")).toThrow(
      /cross_domain/
    );
    expect(() => assertMessengerDomainWrite("general_direct", "trade", "badge")).toThrow(/cross_domain/);
    expect(() =>
      buildGeneralDirectBadgeContribution([
        {
          roomId: "r",
          chatDomain: "trade" as never,
          domainIdentityKey: "trade:x:y:z",
          peerUserId: "a",
          peerDisplayName: "x",
          peerAvatarUrl: null,
          lastMessage: "",
          lastMessageAt: "",
          unreadCount: 1,
          updatedAt: "",
          generation: "1",
        },
      ])
    ).toThrow(/foreign_row/);
  });

  it("13 trade/store_order list rows 가 inbox 에 들어가면 throw", () => {
    expect(() =>
      assertShellInboxRowsRejectTradeAndStoreOrder([{ chatDomain: "trade" }])
    ).toThrow(/forbids_hub_domain_row/);
    expect(() =>
      assertShellInboxRowsRejectTradeAndStoreOrder([{ chatDomain: "store_order" }])
    ).toThrow(/forbids_hub_domain_row/);
    expect(() =>
      composeMessengerShellHome({
        generalDirectRows: [
          {
            ...gdRow(),
            chatDomain: "trade" as never,
          },
        ],
        tradeHub: sampleTradeHub(),
        storeOrderHub: sampleStoreOrderHub(),
      })
    ).toThrow(/forbids_hub_domain_row|general_row_domain/);
  });

  it("14 runtime wiring import 0 (app + community-messenger → lib/messenger ports)", () => {
    const wiringRoots = [path.join(ROOT, "app"), path.join(ROOT, "lib/community-messenger")];
    const importMessenger = /from\s+["'](@\/lib\/messenger(?:\/[^"']*)?)["']/g;
    const domainAuthorityConnectAllow = new Set([
      "@/lib/messenger/contracts/domain-realtime-authority-product-bridge",
      "@/lib/messenger/contracts/domain-notification-authority-product-bridge",
      "@/lib/messenger/contracts/domain-badge-authority-product-bridge",
      "@/lib/messenger/contracts/domain-notification-authority",
      "@/lib/messenger/contracts/domain-atomic-read-authority",
      "@/lib/messenger/contracts/domain-badge-authority",
      "@/lib/messenger/contracts/domain-cache-authority",
      "@/lib/messenger/contracts/domain-owner-surface-authority",
    ]);
    const hits: string[] = [];
    for (const root of wiringRoots) {
      if (!fs.existsSync(root)) continue;
      for (const abs of walkTsFiles(root)) {
        const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
        // Phase 6: Domain Bootstrap API 격리 허용. production UI / community-messenger 연결은 계속 0.
        if (rel.startsWith("app/api/messenger/")) continue;
        const src = fs.readFileSync(abs, "utf8");
        for (const m of src.matchAll(importMessenger)) {
          const imp = m[1];
          if (domainAuthorityConnectAllow.has(imp)) continue;
          hits.push(`${rel}:${imp}`);
        }
      }
    }
    expect(hits).toEqual([]);

    const shellFiles = walkTsFiles(path.join(MESSENGER_ROOT, "shell"));
    for (const abs of shellFiles) {
      const src = fs.readFileSync(abs, "utf8");
      for (const suffix of MESSENGER_SHELL_FORBIDDEN_DOMAIN_INTERNAL_IMPORT_SUFFIXES) {
        const re = new RegExp(
          String.raw`from\s+["']@/lib/messenger/(general-direct|trade|store-order|group)${suffix.replace("/", "\\/")}["']`
        );
        expect(re.test(src)).toBe(false);
      }
    }
  });

  it("15 dual-write 경로 0 · cutover 전부 OFF", () => {
    expect(PHASE1_DEFAULT_CUTOVER.every((c) => c.mode === "off")).toBe(true);
    expect(() => assertDomainWriterAllowed({ cutover: "off", writer: "domain" })).toThrow(
      /domain_writer_forbidden/
    );
    expect(() => assertNoDualWrite(["legacy", "domain"])).toThrow(/dual_write/);
    expect(() => assertNoDualWrite(["legacy"])).not.toThrow();
  });
});

describe("Phase 4.5 pending → Phase 5 PASS", () => {
  it("1 group RowModel inbox merge with general_direct by lastMessageAt", async () => {
    const { buildGroupListSnapshot, buildGroupRowModel } = await import("@/lib/messenger/group");
    const {
      composeMessengerInboxRows,
      composeMessengerShellHomeFromViewModels,
    } = await import("@/lib/messenger/shell");
    const listed = buildGroupListSnapshot({
      viewerUserId: "u1",
      generation: "1",
      rooms: [
        {
          roomId: "g1",
          chatDomain: "group",
          domainIdentityKey: "group:g1",
          groupId: "g1",
          groupSubtype: "private_group",
          groupName: "동네",
          groupImageUrl: null,
          memberCount: 3,
          lastMessage: "그룹 최신",
          lastMessageAt: "2026-07-14T15:00:00.000Z",
          unreadCount: 1,
        },
      ],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const groupRows = [buildGroupRowModel(listed.snapshot.rows[0]!)];
    const general = [
      gdRow({ lastMessageAt: "2026-07-14T10:00:00.000Z", previewText: "예전문자" }),
    ];
    const inbox = composeMessengerInboxRows(general, groupRows);
    expect(inbox).toHaveLength(2);
    expect(inbox[0]?.domain).toBe("group");
    expect(inbox[1]?.domain).toBe("general_direct");
    const home = composeMessengerShellHomeFromViewModels({
      generalDirectRows: general,
      groupRows,
      tradeHub: sampleTradeHub(),
      storeOrderHub: sampleStoreOrderHub(),
    });
    expect(home.inboxRows[0]?.domain).toBe("group");
    expect(home.groupRows).toHaveLength(1);
  });

  it("2 group BadgePort → nav_messenger; 3 nav_messenger = general_direct + group", async () => {
    const { buildGroupListSnapshot, buildGroupBadgeContribution } = await import(
      "@/lib/messenger/group"
    );
    const listed = buildGroupListSnapshot({
      viewerUserId: "u1",
      generation: "1",
      rooms: [
        {
          roomId: "g1",
          chatDomain: "group",
          domainIdentityKey: "group:g1",
          groupId: "g1",
          groupSubtype: "open_group",
          groupName: "공개",
          groupImageUrl: null,
          memberCount: 10,
          lastMessage: "hi",
          lastMessageAt: "2026-07-14T12:00:00.000Z",
          unreadCount: 4,
        },
      ],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const groupBadge = buildGroupBadgeContribution(listed.snapshot.rows);
    expect(groupBadge.contributesTo).toContain("nav_messenger");
    expect(groupBadge.navMessengerContribution).toBe(1);
    expect(
      composeMessengerTabBadge(
        { domain: "general_direct", count: 3 },
        { domain: "group", count: groupBadge.navMessengerContribution }
      )
    ).toBe(4);
  });

  it("4 trade/store_order inbox row 0; 5 sort uses completed RowModel lastMessageAt only", async () => {
    const { buildGroupListSnapshot, buildGroupRowModel } = await import("@/lib/messenger/group");
    const { composeMessengerInboxRows } = await import("@/lib/messenger/shell");
    const listed = buildGroupListSnapshot({
      viewerUserId: "u1",
      generation: "1",
      rooms: [
        {
          roomId: "g2",
          chatDomain: "group",
          domainIdentityKey: "group:g2",
          groupId: "g2",
          groupSubtype: "private_group",
          groupName: "G",
          groupImageUrl: null,
          memberCount: 2,
          lastMessage: "g",
          lastMessageAt: "2026-07-14T11:00:00.000Z",
          unreadCount: 0,
        },
      ],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(() =>
      composeMessengerInboxRows(
        [gdRow({ lastMessageAt: "2026-07-14T12:00:00.000Z" })],
        [
          {
            ...buildGroupRowModel(listed.snapshot.rows[0]!),
            chatDomain: "trade" as never,
          },
        ]
      )
    ).toThrow(/forbids_hub_domain_row|group_row_domain/);
    const inbox = composeMessengerInboxRows(
      [
        gdRow({ roomId: "older", lastMessageAt: "2026-07-14T09:00:00.000Z" }),
        gdRow({ roomId: "newer", lastMessageAt: "2026-07-14T14:00:00.000Z" }),
      ],
      [buildGroupRowModel(listed.snapshot.rows[0]!)]
    );
    expect(inbox.map((e) => (e.domain === "general_direct" ? e.row.roomId : e.row.groupId))).toEqual([
      "newer",
      "g2",
      "older",
    ]);
  });
});
