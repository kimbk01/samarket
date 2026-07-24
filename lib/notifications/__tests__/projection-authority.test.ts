/**
 * P0 Projection Authority — complete gate + room delta merge + generation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_BELL_BADGE_FACTS,
  type NotificationBadgeProjectionInput,
} from "@/lib/notifications/build-notification-badge-projection";

const applySpy = vi.fn();

vi.mock("@/lib/messenger/contracts/domain-badge-authority-product-bridge", () => ({
  applyNotificationBadgeProjection: (...args: unknown[]) => applySpy(...args),
}));

vi.mock("@/lib/notifications/core/notification-logs", () => ({
  logNotifyBadge: vi.fn(),
}));

import {
  commitCompleteProjectionSnapshot,
  commitRoomUnreadDeltaFromDomainSpine,
  getLastCompleteProjectionInput,
  getLastCommittedProjectionGenerationMs,
  getProjectionAuthorityCounters,
  isCompleteProjectionInput,
  resetProjectionAuthorityForTests,
} from "@/lib/notifications/projection-authority";

function completeInput(
  overrides?: Partial<NotificationBadgeProjectionInput>
): NotificationBadgeProjectionInput {
  return {
    domainUnreadRooms: {
      general_direct: 2,
      group: 1,
      trade: 3,
      store_order: 4,
    },
    storeOrderBuyerDeliveryUnread: 1,
    storeOrderOwnerChatUnread: 3,
    orphanMissedCall: 5,
    nonChatEventAttention: {
      tradeStatus: 1,
      orderStatus: 2,
      deliveryStatus: 0,
      communityActivity: 0,
      adminNotice: 4,
    },
    unreadApprovedNotificationEvents: 12,
    bell: {
      ...EMPTY_BELL_BADGE_FACTS,
      total: 12,
      missedCall: 5,
      adminNotice: 4,
      tradeStatus: 1,
      orderStatus: 2,
    },
    rowUnreadByRoomId: { "room-gd": 1, "room-trade": 2 },
    ...overrides,
  };
}

describe("projection-authority P0", () => {
  beforeEach(() => {
    resetProjectionAuthorityForTests();
    applySpy.mockClear();
  });

  it("rejects room-only Facts as incomplete", () => {
    expect(
      isCompleteProjectionInput({
        domainUnreadRooms: {
          general_direct: 1,
          group: 0,
          trade: 0,
          store_order: 0,
        },
        orphanMissedCall: 0,
        nonChatEventAttention: {
          tradeStatus: 0,
          orderStatus: 0,
          deliveryStatus: 0,
          communityActivity: 0,
          adminNotice: 0,
        },
      })
    ).toBe(false);
  });

  it("rejects room delta when no complete snapshot exists", () => {
    const rooms = new Map([
      [
        "room-a",
        { roomId: "room-a", chatDomain: "general_direct" as const, unreadCount: 1 },
      ],
    ]);
    const ok = commitRoomUnreadDeltaFromDomainSpine({
      domainsToUpdate: ["general_direct"],
      spineDomainCounts: {
        general_direct: 1,
        group: 0,
        trade: 0,
        store_order: 0,
      },
      rooms,
    });
    expect(ok).toBe(false);
    expect(applySpy).not.toHaveBeenCalled();
    expect(getProjectionAuthorityCounters().incomplete_commit_rejected).toBe(1);
    expect(getProjectionAuthorityCounters().projection_commit_ok).toBe(0);
  });

  it("commits complete snapshot once then merges only target domain", () => {
    expect(
      commitCompleteProjectionSnapshot(completeInput(), {
        projectionVersionMs: 1_000,
        source: "badge_count_http",
      })
    ).toBe(true);
    expect(applySpy).toHaveBeenCalledTimes(1);
    const bellBefore = getLastCompleteProjectionInput()?.unreadApprovedNotificationEvents;
    const orphanBefore = getLastCompleteProjectionInput()?.orphanMissedCall;
    const tradeBefore = getLastCompleteProjectionInput()?.domainUnreadRooms.trade;

    const rooms = new Map([
      [
        "room-a",
        { roomId: "room-a", chatDomain: "general_direct" as const, unreadCount: 1 },
      ],
      [
        "room-b",
        { roomId: "room-b", chatDomain: "general_direct" as const, unreadCount: 1 },
      ],
    ]);
    expect(
      commitRoomUnreadDeltaFromDomainSpine({
        domainsToUpdate: ["general_direct"],
        spineDomainCounts: {
          general_direct: 2,
          group: 0,
          trade: 0,
          store_order: 0,
        },
        rooms,
      })
    ).toBe(true);
    expect(applySpy).toHaveBeenCalledTimes(2);
    expect(getProjectionAuthorityCounters().projection_commit_ok).toBe(2);
    expect(getProjectionAuthorityCounters().room_delta_commit_ok).toBe(1);

    const after = getLastCompleteProjectionInput();
    expect(after?.domainUnreadRooms.general_direct).toBe(2);
    expect(after?.domainUnreadRooms.group).toBe(1);
    expect(after?.domainUnreadRooms.trade).toBe(tradeBefore);
    expect(after?.domainUnreadRooms.store_order).toBe(4);
    expect(after?.unreadApprovedNotificationEvents).toBe(bellBefore);
    expect(after?.orphanMissedCall).toBe(orphanBefore);
    expect(after?.storeOrderBuyerDeliveryUnread).toBe(1);
    expect(after?.storeOrderOwnerChatUnread).toBe(3);
    expect(getLastCommittedProjectionGenerationMs()).toBeGreaterThanOrEqual(1_000);
  });

  it("rejects stale complete generation after newer delta", () => {
    commitCompleteProjectionSnapshot(completeInput(), { projectionVersionMs: 1_000 });
    const rooms = new Map([
      [
        "room-a",
        { roomId: "room-a", chatDomain: "group" as const, unreadCount: 0 },
      ],
    ]);
    commitRoomUnreadDeltaFromDomainSpine({
      domainsToUpdate: ["group"],
      spineDomainCounts: {
        general_direct: 2,
        group: 0,
        trade: 3,
        store_order: 4,
      },
      rooms,
    });
    const genAfterDelta = getLastCommittedProjectionGenerationMs();
    applySpy.mockClear();
    const ok = commitCompleteProjectionSnapshot(completeInput(), {
      projectionVersionMs: Math.max(0, genAfterDelta - 1),
    });
    expect(ok).toBe(false);
    expect(applySpy).not.toHaveBeenCalled();
    expect(getProjectionAuthorityCounters().stale_generation_rejected).toBe(1);
  });

  it("accepts newer complete HTTP after delta", () => {
    commitCompleteProjectionSnapshot(completeInput(), { projectionVersionMs: 1_000 });
    commitRoomUnreadDeltaFromDomainSpine({
      domainsToUpdate: ["trade"],
      spineDomainCounts: {
        general_direct: 2,
        group: 1,
        trade: 0,
        store_order: 4,
      },
      rooms: new Map(),
    });
    const gen = getLastCommittedProjectionGenerationMs();
    applySpy.mockClear();
    expect(
      commitCompleteProjectionSnapshot(
        completeInput({
          domainUnreadRooms: {
            general_direct: 0,
            group: 0,
            trade: 0,
            store_order: 0,
          },
          unreadApprovedNotificationEvents: 99,
        }),
        { projectionVersionMs: gen + 10 }
      )
    ).toBe(true);
    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(getLastCompleteProjectionInput()?.unreadApprovedNotificationEvents).toBe(99);
  });
});
