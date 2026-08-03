/**
 * P0-2 Projection Authority — CM room-fact contract.
 *
 * Room Fact → Builder → Projection → Hub → Bottom share one generation.
 * Direct Hub Absolute writer must not exist.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_BELL_BADGE_FACTS } from "@/lib/notifications/build-notification-badge-projection";

const applySpy = vi.fn();

vi.mock("@/lib/messenger/contracts/domain-badge-authority-product-bridge", () => ({
  applyNotificationBadgeProjection: (...args: unknown[]) => applySpy(...args),
}));

const logSpy = vi.fn();
vi.mock("@/lib/notifications/core/notification-logs", () => ({
  logNotifyBadge: (event: string, payload?: Record<string, unknown>) => logSpy(event, payload),
}));

import {
  commitCmRoomUnreadFactEvent,
  commitCompleteProjectionSnapshot,
  getLastCompleteProjectionInput,
  getProjectionAuthorityCounters,
  getProjectionGenerationLineage,
  getProjectionMetadata,
  listProjectionAuthorityRoomFacts,
  resetProjectionAuthorityForTests,
} from "@/lib/notifications/projection-authority";

function seedHttp(gd = 0, group = 0, versionMs = 100_000) {
  commitCompleteProjectionSnapshot(
    {
      domainUnreadRooms: {
        general_direct: gd,
        group,
        trade: 2,
        store_order: 3,
      },
      storeOrderBuyerDeliveryUnread: 1,
      storeOrderOwnerChatUnread: 2,
      orphanMissedCall: 4,
      nonChatEventAttention: {
        tradeStatus: 1,
        orderStatus: 1,
        deliveryStatus: 0,
        communityActivity: 0,
        adminNotice: 2,
      },
      unreadApprovedNotificationEvents: 21,
      bell: { ...EMPTY_BELL_BADGE_FACTS, total: 21, missedCall: 4, adminNotice: 2 },
      rowUnreadByRoomId: {},
    },
    { projectionVersionMs: versionMs }
  );
}

describe("P0-2 CM room-fact Authority contract", () => {
  beforeEach(() => {
    resetProjectionAuthorityForTests();
    applySpy.mockClear();
    logSpy.mockClear();
  });

  it("rejects Absolute Hub writer export in product store", () => {
    const src = readFileSync(join(process.cwd(), "lib/chats/owner-hub-badge-store.ts"), "utf8");
    expect(src).not.toMatch(/export function applyHubBadgeCmUnreadRoomCountAbsolute\b/);
    const unreadSrc = readFileSync(
      join(process.cwd(), "lib/community-messenger/unread/messenger-room-unread-authority.ts"),
      "utf8"
    );
    expect(unreadSrc.includes(`applyHubBadgeCmUnreadRoomCountAbsolute${"("}`)).toBe(false);
    expect(unreadSrc).toContain("commitCmRoomUnreadFactEvent");
  });

  it("HTTP → room up → duplicate → room B → read → stale unread → lineage same generation", () => {
    seedHttp(0, 0, 100_000);
    const bell = getLastCompleteProjectionInput()?.unreadApprovedNotificationEvents;
    const orphan = getLastCompleteProjectionInput()?.orphanMissedCall;
    const trade = getLastCompleteProjectionInput()?.domainUnreadRooms.trade;

    expect(
      commitCmRoomUnreadFactEvent({
        roomId: "room-a",
        domain: "general_direct",
        unread: { kind: "absolute", unreadCount: 1, previousUnreadCount: 0 },
        source: "participant_realtime",
        eventIdentity: "msg-a-1",
        eventVersion: 1,
      })
    ).toBe(true);

    // Duplicate eventIdentity
    expect(
      commitCmRoomUnreadFactEvent({
        roomId: "room-a",
        domain: "general_direct",
        unread: { kind: "absolute", unreadCount: 1, previousUnreadCount: 0 },
        source: "participant_realtime",
        eventIdentity: "msg-a-1",
        eventVersion: 1,
      })
    ).toBe(false);
    expect(getProjectionAuthorityCounters().duplicate_event).toBe(1);

    // Same absolute / version → noop
    expect(
      commitCmRoomUnreadFactEvent({
        roomId: "room-a",
        domain: "general_direct",
        unread: { kind: "absolute", unreadCount: 1, previousUnreadCount: 0 },
        source: "participant_realtime",
        eventIdentity: "msg-a-1-again",
        eventVersion: 1,
      })
    ).toBe(true);
    expect(getProjectionAuthorityCounters().room_delta_noop).toBeGreaterThan(0);

    expect(
      commitCmRoomUnreadFactEvent({
        roomId: "room-b",
        domain: "group",
        unread: { kind: "absolute", unreadCount: 2, previousUnreadCount: 0 },
        source: "message_insert",
        eventIdentity: "msg-b-1",
        eventVersion: 2,
      })
    ).toBe(true);

    expect(
      commitCmRoomUnreadFactEvent({
        roomId: "room-a",
        domain: "general_direct",
        unread: { kind: "absolute", unreadCount: 0, previousUnreadCount: 1 },
        source: "optimistic_read",
        eventIdentity: "read-a-1",
        eventVersion: 3,
      })
    ).toBe(true);

    // Late unread older than read version
    expect(
      commitCmRoomUnreadFactEvent({
        roomId: "room-a",
        domain: "general_direct",
        unread: { kind: "absolute", unreadCount: 1, previousUnreadCount: 0 },
        source: "participant_realtime",
        eventIdentity: "late-a-unread",
        eventVersion: 2,
      })
    ).toBe(false);
    expect(getProjectionAuthorityCounters().room_version_stale).toBe(1);

    const after = getLastCompleteProjectionInput();
    expect(after?.domainUnreadRooms.general_direct).toBe(0);
    expect(after?.domainUnreadRooms.group).toBe(1);
    expect(after?.domainUnreadRooms.trade).toBe(trade);
    expect(after?.unreadApprovedNotificationEvents).toBe(bell);
    expect(after?.orphanMissedCall).toBe(orphan);

    const lineage = getProjectionGenerationLineage();
    expect(lineage?.sameGeneration).toBe(true);
    expect(lineage?.builderBottomChat).toBe(lineage?.hubCm);
    expect(lineage?.hubCm).toBe(lineage?.bottomChat);
    expect(lineage?.projectionBottomChat).toBe(lineage?.bottomChat);
    expect(lineage?.generation).toBe(getProjectionMetadata()?.projectionGeneration);

    const rooms = listProjectionAuthorityRoomFacts();
    expect(rooms.find((r) => r.roomId === "room-a")?.state).toBe("READ");
    expect(rooms.find((r) => r.roomId === "room-b")?.state).toBe("KNOWN");
  });

  it("requires baseline; accepts Trade; rejects Owner Store Order; complete required", () => {
    expect(
      commitCmRoomUnreadFactEvent({
        roomId: "x",
        domain: "general_direct",
        unread: { kind: "absolute", unreadCount: 1 },
        source: "participant_realtime",
        eventIdentity: "before-complete",
        eventVersion: 1,
      })
    ).toBe(false);

    seedHttp(0, 0, 200_000);
    expect(
      commitCmRoomUnreadFactEvent({
        roomId: "x",
        domain: "general_direct",
        unread: { kind: "absolute", unreadCount: 1 },
        source: "participant_realtime",
        eventIdentity: "no-baseline",
        eventVersion: 1,
      })
    ).toBe(false);
    expect(getProjectionAuthorityCounters().room_fact_baseline_missing).toBe(1);

    expect(
      commitCmRoomUnreadFactEvent({
        roomId: "tr",
        domain: "trade",
        unread: { kind: "absolute", unreadCount: 1, previousUnreadCount: 0 },
        source: "participant_realtime",
        eventIdentity: "trade-reject",
        eventVersion: 1,
      })
    ).toBe(true);
    expect(getLastCompleteProjectionInput()?.domainUnreadRooms.trade).toBe(3);

    expect(
      commitCmRoomUnreadFactEvent({
        roomId: "so-owner",
        domain: "store_order",
        storeOrderRole: "owner",
        unread: { kind: "absolute", unreadCount: 1, previousUnreadCount: 0 },
        source: "participant_realtime",
        eventIdentity: "owner-order-reject",
        eventVersion: 2,
      })
    ).toBe(false);
    expect(getProjectionAuthorityCounters().domain_rejected).toBe(1);
  });

  it("Customer Store Order changes buyer B only and preserves Owner C", () => {
    seedHttp(0, 0, 300_000);
    expect(
      commitCmRoomUnreadFactEvent({
        roomId: "so-customer",
        domain: "store_order",
        storeOrderRole: "customer",
        unread: { kind: "absolute", unreadCount: 2, previousUnreadCount: 0 },
        source: "participant_realtime",
        eventIdentity: "customer-order-up",
        eventVersion: 1,
      })
    ).toBe(true);

    const after = getLastCompleteProjectionInput();
    expect(after?.storeOrderBuyerDeliveryUnread).toBe(2);
    expect(after?.storeOrderOwnerChatUnread).toBe(2);
    expect(after?.domainUnreadRooms.store_order).toBe(4);
  });
});
