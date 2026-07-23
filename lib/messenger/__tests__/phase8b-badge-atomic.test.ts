/**
 * Phase 8B — Badge 단위 정책 · App Icon · Delivery union · Atomic RPC 계약 테스트.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  PHASE8B_BADGE_UNIT_POLICY,
  D1_2_APP_ICON_UNIT,
  D1_2_APP_ICON_UNIT_OPEN,
  assertPhase8bAppIconUsesNotificationEvents,
  assertPhase8bAppIconDoesNotUseRoomOrMessage,
} from "@/lib/messenger/contracts/badge-unit-policy-phase8b";
import {
  aggregateAppIconBadgeFromNotificationEvents,
  markEventsReadForRoom,
} from "@/lib/messenger/contracts/app-icon-aggregator-phase8b";
import {
  aggregateDeliveryNavUnion,
  deliveryNavArithmeticSum,
} from "@/lib/messenger/contracts/delivery-nav-aggregator-phase8b";
import {
  simulateAtomicMarkReadTransaction,
  PHASE8B_CALL2_AFTER_CLEANUP_PLAN,
  DIBAY_MESSENGER_DOMAIN_ATOMIC_MARK_READ_RPC,
  DIBAY_STORE_ORDER_ATOMIC_MARK_READ_RPC,
  assertAtomicMarkReadSqlTradeTargetIdentityScoped,
  wouldClearNotificationTargetOnMarkRead,
  wouldClearNotificationEventOnMarkRead,
} from "@/lib/messenger/contracts/atomic-mark-read-rpc-phase8b";
import {
  D1_1_ATOMIC_READ_RPC_IMPLEMENTED,
  D1_1_ATOMIC_READ_RPC_PRODUCTION_WIRING,
  buildDomainReadTransactionPlan,
} from "@/lib/messenger/contracts/domain-read-unread-badge";
import { MESSENGER_DOMAIN_BUILD_PHASE_ORDER } from "@/lib/messenger/contracts/phase-order";
import { PHASE1_DEFAULT_CUTOVER } from "@/lib/messenger/contracts/cutover";

describe("Phase 8B A/B — Atomic harness success / rollback", () => {
  it("all authorities succeed → consistent with zero remaining", () => {
    const { result, after } = simulateAtomicMarkReadTransaction({
      before: { participantUnread: 3, targetUnread: 1, eventUnread: 2, generation: 1 },
      generation: 2,
    });
    expect(result.status).toBe("consistent");
    expect(after.participantUnread).toBe(0);
    expect(after.targetUnread).toBe(0);
    expect(after.eventUnread).toBe(0);
  });

  it("forced fail rolls back with zero side effects", () => {
    const before = { participantUnread: 3, targetUnread: 1, eventUnread: 2, generation: 5 };
    for (const step of ["participant", "target", "event"] as const) {
      const { result, after } = simulateAtomicMarkReadTransaction({
        before,
        generation: 6,
        forceFailAt: step,
      });
      expect(result.status).toBe("rollback");
      if (result.status === "rollback") expect(result.rolledBack).toBe(true);
      expect(after).toEqual(before);
    }
  });

  it("stale generation → no mutation", () => {
    const before = { participantUnread: 1, targetUnread: 1, eventUnread: 1, generation: 9 };
    const { result, after } = simulateAtomicMarkReadTransaction({
      before,
      generation: 3,
    });
    expect(result.status).toBe("stale");
    expect(after).toEqual(before);
  });
});

describe("Phase 8B C — Cross-domain RPC naming", () => {
  it("separates store_order RPC from CM domains", () => {
    expect(
      buildDomainReadTransactionPlan({
        chatDomain: "general_direct",
        domainIdentityKey: "general_direct:a:b",
        roomId: "r",
        viewerUserId: "u",
        generation: 1,
        idempotencyKey: "k",
      }).atomicRpcName
    ).toBe(DIBAY_MESSENGER_DOMAIN_ATOMIC_MARK_READ_RPC);
    expect(
      buildDomainReadTransactionPlan({
        chatDomain: "store_order",
        domainIdentityKey: "store_order:o1",
        roomId: "r",
        viewerUserId: "u",
        generation: 1,
        idempotencyKey: "k",
      }).atomicRpcName
    ).toBe(DIBAY_STORE_ORDER_ATOMIC_MARK_READ_RPC);
    expect(DIBAY_MESSENGER_DOMAIN_ATOMIC_MARK_READ_RPC).not.toBe(
      DIBAY_STORE_ORDER_ATOMIC_MARK_READ_RPC
    );
  });
});

describe("Phase 8B D — Idempotency contract markers", () => {
  it("production wiring remains false; migration defines idempotency table", () => {
    expect(D1_1_ATOMIC_READ_RPC_PRODUCTION_WIRING).toBe(false);
    expect(D1_1_ATOMIC_READ_RPC_IMPLEMENTED).toBe(true);
    const mig = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/20261005120000_dibay_messenger_domain_atomic_mark_read.sql"
      ),
      "utf8"
    );
    expect(mig).toContain("dibay_domain_mark_read_idempotency");
    expect(mig).toContain("dibay_messenger_domain_atomic_mark_read");
    expect(mig).toContain("dibay_store_order_atomic_mark_read");
    expect(mig).toContain("SET search_path = public");
    expect(mig).toContain("auth.uid()");
    expect(mig).toContain("FOR UPDATE");
    expect(mig).not.toContain("Promise.all");
    expect(mig).toContain("remainingDomainNotificationEventCount");
    expect(mig).toContain("remainingGlobalNotificationEventCount");
    expect(mig).not.toContain("remainingNotificationEventCount");
    expect(() => assertAtomicMarkReadSqlTradeTargetIdentityScoped(mig)).not.toThrow();
  });
});

describe("Phase 8B D2 — Trade identity-scoped target/event clear", () => {
  const identityA = "trade:item-a:seller-1:buyer-1";
  const identityB = "trade:item-b:seller-1:buyer-1"; // same pair, other item
  const roomA = "room-a";
  const roomB = "room-b";

  it("trade room A clears only A target/event; B + other domains kept", () => {
    const readA = { chatDomain: "trade" as const, domainIdentityKey: identityA, roomId: roomA };

    expect(
      wouldClearNotificationTargetOnMarkRead({
        ...readA,
        target: {
          targetType: "trade",
          chatDomain: "trade",
          domainIdentityKey: identityA,
          roomId: roomA,
          scope: "consumer",
          unread: true,
        },
      })
    ).toBe(true);

    expect(
      wouldClearNotificationTargetOnMarkRead({
        ...readA,
        target: {
          targetType: "trade",
          chatDomain: "trade",
          domainIdentityKey: identityB,
          roomId: roomB,
          scope: "consumer",
          unread: true,
        },
      })
    ).toBe(false);

    expect(
      wouldClearNotificationTargetOnMarkRead({
        ...readA,
        target: {
          targetType: "chat_room",
          chatDomain: "trade",
          domainIdentityKey: identityB,
          roomId: roomB,
          scope: "consumer",
          unread: true,
        },
      })
    ).toBe(false);

    expect(
      wouldClearNotificationTargetOnMarkRead({
        ...readA,
        target: {
          targetType: "chat_room",
          chatDomain: "general_direct",
          domainIdentityKey: "general_direct:u1:u2",
          roomId: "gd-room",
          scope: "consumer",
          unread: true,
        },
      })
    ).toBe(false);

    expect(
      wouldClearNotificationEventOnMarkRead({
        ...readA,
        event: {
          chatDomain: "trade",
          domainIdentityKey: identityA,
          roomId: roomA,
          unread: true,
        },
      })
    ).toBe(true);

    expect(
      wouldClearNotificationEventOnMarkRead({
        ...readA,
        event: {
          chatDomain: "trade",
          domainIdentityKey: identityB,
          roomId: roomB,
          unread: true,
        },
      })
    ).toBe(false);

    expect(
      wouldClearNotificationEventOnMarkRead({
        ...readA,
        event: {
          chatDomain: "group",
          domainIdentityKey: "group:g1",
          roomId: "g1",
          unread: true,
        },
      })
    ).toBe(false);

    expect(
      wouldClearNotificationEventOnMarkRead({
        ...readA,
        event: {
          chatDomain: "store_order",
          domainIdentityKey: "store_order:o1",
          roomId: "so1",
          unread: true,
        },
      })
    ).toBe(false);

    // owner_store scope must not clear from CM trade read
    expect(
      wouldClearNotificationTargetOnMarkRead({
        ...readA,
        target: {
          targetType: "trade",
          chatDomain: "trade",
          domainIdentityKey: identityA,
          roomId: roomA,
          scope: "owner_store",
          unread: true,
        },
      })
    ).toBe(false);
  });
});

describe("Phase 8B E — App Icon", () => {
  it("counts unread events by eventId; ignores room/message units", () => {
    assertPhase8bAppIconUsesNotificationEvents(D1_2_APP_ICON_UNIT);
    expect(D1_2_APP_ICON_UNIT_OPEN).toBe(false);
    expect(PHASE8B_BADGE_UNIT_POLICY.appIcon).toBe("notificationEventCount");
    expect(() => assertPhase8bAppIconDoesNotUseRoomOrMessage("unreadRoomCount")).toThrow();

    const events = [
      { eventId: "e1", unread: true, readAt: null, source: "general_direct" as const },
      { eventId: "e2", unread: true, readAt: null, source: "group" as const },
      { eventId: "e3", unread: true, readAt: null, source: "trade" as const },
      { eventId: "e4", unread: true, readAt: null, source: "store_order" as const },
      { eventId: "e5", unread: true, readAt: null, source: "order_status" as const },
      { eventId: "e1", unread: true, readAt: null, source: "general_direct" as const }, // dup
      { eventId: "e6", unread: false, readAt: "2026-07-14T00:00:00.000Z", source: "system" as const },
    ];
    const agg = aggregateAppIconBadgeFromNotificationEvents(events);
    expect(agg.count).toBe(5);
    expect(agg.unit).toBe("notificationEventCount");
    expect(agg.setsOsBadge).toBe(false);

    const withRoom = [
      { eventId: "e1", unread: true, readAt: null, source: "general_direct" as const, roomId: "room-a" },
      { eventId: "e2", unread: true, readAt: null, source: "group" as const, roomId: "room-a" },
      { eventId: "e3", unread: true, readAt: null, source: "trade" as const, roomId: "room-b" },
      { eventId: "e4", unread: true, readAt: null, source: "store_order" as const, roomId: "room-b" },
      { eventId: "e5", unread: true, readAt: null, source: "order_status" as const, roomId: "room-b" },
    ];
    const afterRead = markEventsReadForRoom(withRoom, "room-a", "2026-07-14T12:00:00.000Z");
    const agg2 = aggregateAppIconBadgeFromNotificationEvents(afterRead);
    expect(agg2.count).toBe(3); // room-a events cleared; e3,e4,e5 remain
  });
});

describe("Phase 8B F/G — Delivery Nav union · Store Order surface", () => {
  it("unions by order identity; forbids arithmetic sum and surface mix", () => {
    const baseStatus = {
      kind: "order_status" as const,
      viewerUserId: "cust-1",
      surfaceRole: "customer" as const,
      storeId: null,
      actionableOrderIdentityKeys: ["store_order:ord-A"],
      generation: 1,
      computedAt: new Date().toISOString(),
    };
    const baseUnread = {
      domain: "store_order" as const,
      viewerUserId: "cust-1",
      surfaceRole: "customer" as const,
      storeId: null,
      unreadOrderIdentityKeys: ["store_order:ord-A"],
      unreadMessageCount: 2,
      unreadRoomCount: 1,
      generation: 1,
      computedAt: new Date().toISOString(),
    };

    expect(
      aggregateDeliveryNavUnion({
        orderStatus: baseStatus,
        storeOrderUnread: baseUnread,
      }).badgeCount
    ).toBe(1);

    expect(
      aggregateDeliveryNavUnion({
        orderStatus: {
          ...baseStatus,
          actionableOrderIdentityKeys: ["store_order:ord-A"],
        },
        storeOrderUnread: {
          ...baseUnread,
          unreadOrderIdentityKeys: ["store_order:ord-B"],
        },
      }).badgeCount
    ).toBe(2);

    const afterReadB = aggregateDeliveryNavUnion({
      orderStatus: {
        ...baseStatus,
        actionableOrderIdentityKeys: ["store_order:ord-A"],
      },
      storeOrderUnread: {
        ...baseUnread,
        unreadOrderIdentityKeys: [],
      },
    });
    expect(afterReadB.badgeCount).toBe(1);

    expect(() => deliveryNavArithmeticSum(1, 1)).toThrow(/arithmetic_sum_forbidden/);

    expect(() =>
      aggregateDeliveryNavUnion({
        orderStatus: baseStatus,
        storeOrderUnread: { ...baseUnread, surfaceRole: "owner", storeId: "s1" },
      })
    ).toThrow(/surface_mix/);

    expect(() =>
      aggregateDeliveryNavUnion({
        orderStatus: {
          ...baseStatus,
          surfaceRole: "owner",
          storeId: "store-1",
          viewerUserId: "owner-1",
        },
        storeOrderUnread: {
          ...baseUnread,
          surfaceRole: "owner",
          storeId: "store-OTHER",
          viewerUserId: "owner-1",
        },
      })
    ).toThrow(/owner_store/);
  });
});

describe("Phase 8B H — Runtime isolation", () => {
  it("cutover OFF, Call2 plan documented, migration rollback exists, no route wiring", () => {
    expect(PHASE1_DEFAULT_CUTOVER.every((c) => c.mode === "off")).toBe(true);
    expect(PHASE8B_CALL2_AFTER_CLEANUP_PLAN.dualWriterInProduction).toBe(false);
    expect(PHASE8B_CALL2_AFTER_CLEANUP_PLAN.productionWiringNow).toBe(false);
    expect(fs.existsSync(
      path.join(
        process.cwd(),
        "supabase/rollback/20261005120000_dibay_messenger_domain_atomic_mark_read.rollback.sql"
      )
    )).toBe(true);
    expect(fs.existsSync(
      path.join(
        process.cwd(),
        "supabase/migrations/20261005120000_dibay_messenger_domain_atomic_mark_read.rollback.sql"
      )
    )).toBe(false);

    const p8 = MESSENGER_DOMAIN_BUILD_PHASE_ORDER.find((p) => Number(p.phase) === 8);
    expect(p8?.status).toBe("done");

    // existing production routes untouched markers
    const root = process.cwd();
    const readOrderRoute = fs.readFileSync(
      path.join(root, "app/api/domains/order/read-order-chat/route.ts"),
      "utf8"
    );
    expect(readOrderRoute).not.toContain("dibay_store_order_atomic_mark_read");
  });
});
