/**
 * Phase 10 — Shell 최종 조합 계약 테스트.
 * Production wiring / cutover / Atomic 실DB / D1-1 Runtime PASS 주장 금지.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PHASE1_DEFAULT_CUTOVER } from "@/lib/messenger/contracts/cutover";
import { MESSENGER_DOMAIN_BUILD_PHASE_ORDER } from "@/lib/messenger/contracts/phase-order";
import {
  PHASE10_D1_1_RUNTIME_PASS_CLAIMED,
  PHASE10_SHELL_PRODUCTION_WIRING,
  PHASE10_SHELL_SURFACE_CONTRACT,
  assertPhase10NoDomainReinference,
  assertPhase10RejectsForbiddenInput,
} from "@/lib/messenger/contracts/shell-final-compose-phase10";
import { composePhase10ShellFinal } from "@/lib/messenger/shell/phase10-final-compose";
import type { GeneralDirectRowModel } from "@/lib/messenger/general-direct";
import type { GroupRowModel } from "@/lib/messenger/group";
import type { TradeHubViewModel } from "@/lib/messenger/trade";
import type { StoreOrderHubViewModel } from "@/lib/messenger/store-order";
import type {
  GeneralDirectUnreadContribution,
  GroupUnreadContribution,
  StoreOrderUnreadContribution,
  TradeUnreadContribution,
} from "@/lib/messenger/contracts/domain-read-unread-badge";
import type { OrderStatusContributionPhase8b } from "@/lib/messenger/contracts/delivery-nav-aggregator-phase8b";

function gdRow(partial?: Partial<GeneralDirectRowModel>): GeneralDirectRowModel {
  return {
    roomId: partial?.roomId ?? "gd1",
    chatDomain: "general_direct",
    domainIdentityKey: partial?.domainIdentityKey ?? "general_direct:a:b",
    title: partial?.title ?? "피어",
    avatarUrl: null,
    previewText: partial?.previewText ?? "안녕",
    unreadCount: partial?.unreadCount ?? 1,
    href: "/community-messenger/r/gd1",
    lastMessageAt: partial?.lastMessageAt ?? "2026-07-14T12:00:00.000Z",
  };
}

function groupRow(partial?: Partial<GroupRowModel>): GroupRowModel {
  return {
    roomId: partial?.roomId ?? "g1",
    chatDomain: "group",
    domainIdentityKey: partial?.domainIdentityKey ?? "group:g1",
    groupId: partial?.groupId ?? "g1",
    subtype: partial?.subtype ?? "open_group",
    title: partial?.title ?? "동네",
    avatarUrl: null,
    previewText: partial?.previewText ?? "모임",
    unreadCount: partial?.unreadCount ?? 1,
    memberCount: partial?.memberCount ?? 3,
    href: "/community-messenger/r/g1",
    lastMessageAt: partial?.lastMessageAt ?? "2026-07-14T11:00:00.000Z",
  };
}

function tradeHub(): TradeHubViewModel {
  return {
    domain: "trade",
    roomCount: 2,
    unreadCount: 3,
    previewText: "네고",
    lastEventAt: "2026-07-14T10:00:00.000Z",
    latestRoomId: "trade-r1",
    latestDomainIdentityKey: "trade:i:s:c",
    hrefToTradeList: "/community-messenger/trade",
  };
}

function orderHub(): StoreOrderHubViewModel {
  return {
    domain: "store_order",
    roomCount: 1,
    unreadCount: 2,
    previewText: "배달",
    lastEventAt: "2026-07-14T09:00:00.000Z",
    latestRoomId: "order-r1",
    latestDomainIdentityKey: "store_order:o1",
    hrefToOrderList: "/community-messenger/orders",
  };
}

function contribBase(domain: "general_direct" | "group" | "trade" | "store_order", rooms: number) {
  return {
    domain,
    viewerUserId: "viewer-1",
    unreadMessageCount: rooms * 2,
    unreadRoomCount: rooms,
    unreadIdentityKeys: [] as string[],
    latestUnreadGeneration: 1,
    generation: 1,
    sourceAuthority: "server_snapshot" as const,
    computedAt: "2026-07-14T00:00:00.000Z",
  };
}

function badges() {
  const generalDirect = {
    ...contribBase("general_direct", 2),
    domain: "general_direct" as const,
  } satisfies GeneralDirectUnreadContribution;
  const group = {
    ...contribBase("group", 1),
    domain: "group" as const,
  } satisfies GroupUnreadContribution;
  const trade = {
    ...contribBase("trade", 3),
    domain: "trade" as const,
  } satisfies TradeUnreadContribution;
  const storeOrder = {
    ...contribBase("store_order", 1),
    domain: "store_order" as const,
    surfaceRole: "customer" as const,
    storeId: null,
    unreadOrderIdentityKeys: ["store_order:o1"],
  } satisfies StoreOrderUnreadContribution;
  const orderStatus: OrderStatusContributionPhase8b = {
    kind: "order_status",
    viewerUserId: "viewer-1",
    surfaceRole: "customer",
    storeId: null,
    actionableOrderIdentityKeys: ["store_order:o1", "store_order:o2"],
    generation: 1,
    computedAt: "2026-07-14T00:00:00.000Z",
  };
  return { generalDirect, group, trade, storeOrder, orderStatus };
}

describe("Phase 10 — Shell final compose", () => {
  it("composes inbox=GD+group, hubs, messenger/delivery badges, app icon events", () => {
    const out = composePhase10ShellFinal({
      home: {
        generalDirectRows: [gdRow()],
        groupRows: [groupRow()],
        tradeHub: tradeHub(),
        storeOrderHub: orderHub(),
      },
      badge: badges(),
      appIconNotificationEvents: [
        { eventId: "e1", unread: true, readAt: null, source: "general_direct" },
        { eventId: "e1", unread: true, readAt: null, source: "general_direct" },
        { eventId: "e2", unread: true, readAt: null, source: "trade" },
        { eventId: "e3", unread: false, readAt: "2026-07-14T01:00:00.000Z", source: "group" },
      ],
    });

    expect(out.home.inboxRows.map((r) => r.domain).sort()).toEqual(["general_direct", "group"]);
    expect(out.home.tradeHub.domain).toBe("trade");
    expect(out.home.storeOrderHub.domain).toBe("store_order");

    expect(out.messengerNavBadge.unreadRoomCount).toBe(3); // 2+1
    expect(out.messengerNavBadge.domains).toEqual(["general_direct", "group"]);
    expect(out.messengerNavBadge.unreadRoomCount).not.toBe(
      out.tradeHubBadge.unreadRoomCount + out.storeOrderHubBadge.unreadRoomCount
    );

    expect(out.tradeHubBadge).toEqual({ unreadRoomCount: 3, domain: "trade" });
    expect(out.storeOrderHubBadge).toEqual({ unreadRoomCount: 1, domain: "store_order" });

    // union(o1,o2) ∪ (o1) = 2 — not arithmetic 2+1=3
    expect(out.deliveryNavBadge.badgeCount).toBe(2);
    expect(out.deliveryNavBadge.usedArithmeticSum).toBe(false);

    expect(out.appIcon.unit).toBe("notificationEventCount");
    expect(out.appIcon.count).toBe(2); // e1,e2 unique unread
    expect(out.appIcon.setsOsBadge).toBe(false);

    expect(out.productionWiring).toBe(false);
    expect(out.d1_1RuntimePassClaimed).toBe(false);
    expect(out.shellDoesNotSetOsBadge).toBe(true);
    expect(out.surfaceContract).toEqual(PHASE10_SHELL_SURFACE_CONTRACT);
  });

  it("rejects domain reinference and forbidden input kinds", () => {
    expect(() =>
      composePhase10ShellFinal({
        home: {
          generalDirectRows: [gdRow()],
          groupRows: [],
          tradeHub: tradeHub(),
          storeOrderHub: orderHub(),
        },
        badge: badges(),
        appIconNotificationEvents: [],
        reinferenceAttempt: { roomType: "direct" },
      })
    ).toThrow(/roomType/);

    expect(() => assertPhase10RejectsForbiddenInput("bootstrap_raw")).toThrow(/bootstrap_raw/);
    expect(() =>
      assertPhase10NoDomainReinference({ contextMetaKind: "trade" })
    ).toThrow(/contextMeta/);
  });

  it("wiring OFF, cutover OFF, phase order done, architecture files present", () => {
    expect(PHASE10_SHELL_PRODUCTION_WIRING).toBe(false);
    expect(PHASE10_D1_1_RUNTIME_PASS_CLAIMED).toBe(false);
    expect(PHASE1_DEFAULT_CUTOVER.every((c) => c.mode === "off")).toBe(true);
    const p10 = MESSENGER_DOMAIN_BUILD_PHASE_ORDER.find((p) => Number(p.phase) === 10);
    expect(p10?.status).toBe("done");
    expect(p10?.domain).toBe("shell_final_compose");

    const root = process.cwd();
    expect(
      fs.existsSync(path.join(root, "lib/messenger/contracts/shell-final-compose-phase10.ts"))
    ).toBe(true);
    expect(fs.existsSync(path.join(root, "lib/messenger/shell/phase10-final-compose.ts"))).toBe(
      true
    );
  });
});
