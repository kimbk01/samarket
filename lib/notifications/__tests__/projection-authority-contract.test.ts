/**
 * P0 Projection Authority — CONTRACT test.
 *
 * Scenario: HTTP Complete → Realtime → Realtime → Read → Reconnect → Old HTTP.
 * The trailing old HTTP (older factsVersion) must never overwrite the newer state.
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

const logSpy = vi.fn();
vi.mock("@/lib/notifications/core/notification-logs", () => ({
  logNotifyBadge: (event: string, payload?: Record<string, unknown>) => logSpy(event, payload),
}));

import {
  commitCompleteProjectionSnapshot,
  commitRoomUnreadDeltaFromDomainSpine,
  getLastCompleteProjectionInput,
  getProjectionAuthorityCounters,
  getProjectionAuthorityState,
  getProjectionMetadata,
  markProjectionAuthorityWaitingComplete,
  resetProjectionAuthorityForTests,
  type ProjectionAuthorityRoomRow,
} from "@/lib/notifications/projection-authority";

const HTTP_V1 = 187_000;
const HTTP_V2 = 188_000;

function httpComplete(
  overrides?: Partial<NotificationBadgeProjectionInput>
): NotificationBadgeProjectionInput {
  return {
    domainUnreadRooms: { general_direct: 1, group: 1, trade: 2, store_order: 3 },
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
    rowUnreadByRoomId: { "gd-1": 1, "grp-1": 1 },
    ...overrides,
  };
}

function rooms(
  entries: ReadonlyArray<ProjectionAuthorityRoomRow>
): Map<string, ProjectionAuthorityRoomRow> {
  return new Map(entries.map((e) => [e.roomId, e]));
}

function events(name: string): Array<Record<string, unknown> | undefined> {
  return logSpy.mock.calls.filter((c) => c[0] === name).map((c) => c[1]);
}

describe("Projection Authority — contract", () => {
  beforeEach(() => {
    resetProjectionAuthorityForTests();
    applySpy.mockClear();
    logSpy.mockClear();
  });

  it("state machine blocks Realtime in EMPTY and WAITING_COMPLETE", () => {
    expect(getProjectionAuthorityState()).toBe("EMPTY");
    const rtRooms = rooms([{ roomId: "gd-1", chatDomain: "general_direct", unreadCount: 1 }]);

    expect(
      commitRoomUnreadDeltaFromDomainSpine({
        domainsToUpdate: ["general_direct"],
        spineDomainCounts: { general_direct: 1, group: 0, trade: 0, store_order: 0 },
        rooms: rtRooms,
      })
    ).toBe(false);
    expect(getProjectionAuthorityState()).toBe("WAITING_COMPLETE");

    expect(
      commitRoomUnreadDeltaFromDomainSpine({
        domainsToUpdate: ["general_direct"],
        spineDomainCounts: { general_direct: 2, group: 0, trade: 0, store_order: 0 },
        rooms: rtRooms,
      })
    ).toBe(false);

    expect(applySpy).not.toHaveBeenCalled();
    expect(getProjectionMetadata()).toBeNull();
    expect(getProjectionAuthorityCounters().projection_commit_ok).toBe(0);
    expect(
      events("projection_reject").every((p) => p?.reason === "no_complete_snapshot")
    ).toBe(true);
  });

  it("HTTP → RT → RT → Read → Reconnect → Old HTTP keeps the newest state", () => {
    markProjectionAuthorityWaitingComplete("boot");
    expect(getProjectionAuthorityState()).toBe("WAITING_COMPLETE");

    // 1. HTTP complete (factsVersion 187_000)
    expect(
      commitCompleteProjectionSnapshot(httpComplete(), { projectionVersionMs: HTTP_V1 })
    ).toBe(true);
    expect(getProjectionAuthorityState()).toBe("COMPLETE");
    expect(getProjectionMetadata()?.projectionSource).toBe("badge_count_http");
    expect(getProjectionMetadata()?.projectionFactsVersion).toBe(HTTP_V1);
    const bellAfterHttp = getLastCompleteProjectionInput()?.unreadApprovedNotificationEvents;
    const orphanAfterHttp = getLastCompleteProjectionInput()?.orphanMissedCall;

    // 2. Realtime message → general_direct 1 → 2
    expect(
      commitRoomUnreadDeltaFromDomainSpine({
        domainsToUpdate: ["general_direct"],
        spineDomainCounts: { general_direct: 2, group: 1, trade: 2, store_order: 3 },
        rooms: rooms([
          { roomId: "gd-1", chatDomain: "general_direct", unreadCount: 1 },
          { roomId: "gd-2", chatDomain: "general_direct", unreadCount: 1 },
        ]),
      })
    ).toBe(true);

    // 3. Realtime message → 3
    expect(
      commitRoomUnreadDeltaFromDomainSpine({
        domainsToUpdate: ["general_direct"],
        spineDomainCounts: { general_direct: 3, group: 1, trade: 2, store_order: 3 },
        rooms: rooms([
          { roomId: "gd-1", chatDomain: "general_direct", unreadCount: 1 },
          { roomId: "gd-2", chatDomain: "general_direct", unreadCount: 1 },
          { roomId: "gd-3", chatDomain: "general_direct", unreadCount: 2 },
        ]),
      })
    ).toBe(true);

    // 4. Read one room → 2
    expect(
      commitRoomUnreadDeltaFromDomainSpine({
        domainsToUpdate: ["general_direct"],
        spineDomainCounts: { general_direct: 2, group: 1, trade: 2, store_order: 3 },
        rooms: rooms([
          { roomId: "gd-2", chatDomain: "general_direct", unreadCount: 1 },
          { roomId: "gd-3", chatDomain: "general_direct", unreadCount: 2 },
        ]),
      })
    ).toBe(true);

    // 5. Reconnect: snapshot merge for the same domain — no zeroing of other facts
    expect(
      commitRoomUnreadDeltaFromDomainSpine({
        domainsToUpdate: ["general_direct", "group"],
        spineDomainCounts: { general_direct: 2, group: 1, trade: 2, store_order: 3 },
        rooms: rooms([
          { roomId: "gd-2", chatDomain: "general_direct", unreadCount: 1 },
          { roomId: "gd-3", chatDomain: "general_direct", unreadCount: 2 },
          { roomId: "grp-1", chatDomain: "group", unreadCount: 1 },
        ]),
      })
    ).toBe(true);

    const beforeOldHttp = getProjectionMetadata();
    const applyCallsBefore = applySpy.mock.calls.length;
    const inputBefore = getLastCompleteProjectionInput();

    // 6. Old HTTP (factsVersion 187_000 < newest server truth is still 187_000 after RT,
    //    so an older 186_000 snapshot must be rejected)
    expect(
      commitCompleteProjectionSnapshot(
        httpComplete({
          domainUnreadRooms: { general_direct: 0, group: 0, trade: 0, store_order: 0 },
          unreadApprovedNotificationEvents: 0,
          orphanMissedCall: 0,
        }),
        { projectionVersionMs: HTTP_V1 - 1_000 }
      )
    ).toBe(false);

    expect(applySpy.mock.calls.length).toBe(applyCallsBefore);
    expect(getProjectionMetadata()?.projectionGeneration).toBe(
      beforeOldHttp?.projectionGeneration
    );
    expect(getLastCompleteProjectionInput()).toBe(inputBefore);
    expect(getProjectionAuthorityCounters().stale_generation_rejected).toBe(1);
    expect(events("projection_reject").some((p) => p?.reason === "stale")).toBe(true);

    // Non-room facts survived every RT delta
    expect(getLastCompleteProjectionInput()?.unreadApprovedNotificationEvents).toBe(
      bellAfterHttp
    );
    expect(getLastCompleteProjectionInput()?.orphanMissedCall).toBe(orphanAfterHttp);
    expect(getLastCompleteProjectionInput()?.storeOrderBuyerDeliveryUnread).toBe(1);
    expect(getLastCompleteProjectionInput()?.storeOrderOwnerChatUnread).toBe(2);
    expect(getLastCompleteProjectionInput()?.domainUnreadRooms.trade).toBe(2);
    expect(getLastCompleteProjectionInput()?.domainUnreadRooms.store_order).toBe(3);

    // 7. Newer HTTP is accepted and advances facts ordering
    expect(
      commitCompleteProjectionSnapshot(
        httpComplete({ unreadApprovedNotificationEvents: 30 }),
        { projectionVersionMs: HTTP_V2 }
      )
    ).toBe(true);
    expect(getProjectionMetadata()?.projectionFactsVersion).toBe(HTTP_V2);
    expect(getLastCompleteProjectionInput()?.unreadApprovedNotificationEvents).toBe(30);
  });

  it("metadata increases monotonically and labels the source per commit", () => {
    commitCompleteProjectionSnapshot(httpComplete(), { projectionVersionMs: HTTP_V1 });
    const g1 = getProjectionMetadata();
    commitRoomUnreadDeltaFromDomainSpine({
      domainsToUpdate: ["trade"],
      spineDomainCounts: { general_direct: 1, group: 1, trade: 5, store_order: 3 },
      rooms: rooms([{ roomId: "t-1", chatDomain: "trade", unreadCount: 5 }]),
    });
    const g2 = getProjectionMetadata();

    expect(g1?.projectionSource).toBe("badge_count_http");
    expect(g2?.projectionSource).toBe("room_unread_delta");
    expect(g2!.projectionGeneration).toBe(g1!.projectionGeneration + 1);
    expect(g2!.projectionId).not.toBe(g1!.projectionId);
    expect(g2!.projectionCompletedAt).toBeGreaterThanOrEqual(g1!.projectionCompletedAt);
    // RT must not advance server facts ordering
    expect(g2!.projectionFactsVersion).toBe(HTTP_V1);

    // Surface versions strictly increase so downstream never drops the delta
    const versions = applySpy.mock.calls.map(
      (c) => (c[1] as { projectionVersionMs: number }).projectionVersionMs
    );
    expect(versions[1]).toBeGreaterThan(versions[0]);

    expect(events("projection_commit").length).toBe(1);
    expect(events("projection_delta").length).toBe(1);
  });

  it("same-facts HTTP replay does not re-apply surfaces", () => {
    commitCompleteProjectionSnapshot(httpComplete(), { projectionVersionMs: HTTP_V1 });
    const calls = applySpy.mock.calls.length;
    expect(
      commitCompleteProjectionSnapshot(httpComplete(), { projectionVersionMs: HTTP_V1 })
    ).toBe(true);
    expect(applySpy.mock.calls.length).toBe(calls);
    expect(getProjectionAuthorityCounters().projection_commit_ok).toBe(1);
  });
});
