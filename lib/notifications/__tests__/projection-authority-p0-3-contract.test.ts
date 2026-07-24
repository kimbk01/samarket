/**
 * P0-3 Projection Authority — notification event read fact contract.
 *
 * admin_notice_absolute → Bell only (App Icon / CM / Trade / Order 불변).
 * orphan_missed_* → orphan + Bell missed + App Icon missed only (CM room fact 불변).
 * Baseline / duplicate / stale / noop guards + surface snapshot re-read 금지.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_BELL_BADGE_FACTS } from "@/lib/notifications/build-notification-badge-projection";
import type { NotificationBadgeProjection } from "@/lib/notifications/build-notification-badge-projection";

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
  commitNotificationEventReadFact,
  getLastCompleteProjectionInput,
  getProjectionAuthorityCounters,
  resetProjectionAuthorityForTests,
} from "@/lib/notifications/projection-authority";

function lastProjection(): NotificationBadgeProjection {
  return applySpy.mock.calls[applySpy.mock.calls.length - 1]?.[0] as NotificationBadgeProjection;
}

function seedHttp(versionMs = 100_000) {
  commitCompleteProjectionSnapshot(
    {
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
        orderStatus: 1,
        deliveryStatus: 0,
        communityActivity: 0,
        adminNotice: 4,
      },
      unreadApprovedNotificationEvents: 20,
      bell: { ...EMPTY_BELL_BADGE_FACTS, total: 20, missedCall: 5, adminNotice: 4 },
      rowUnreadByRoomId: {},
    },
    { projectionVersionMs: versionMs }
  );
}

describe("P0-3 notification event read fact Authority contract", () => {
  beforeEach(() => {
    resetProjectionAuthorityForTests();
    applySpy.mockClear();
    logSpy.mockClear();
  });

  it("baseline missing before complete snapshot is rejected (no commit)", () => {
    expect(
      commitNotificationEventReadFact({
        fact: { kind: "admin_notice_absolute", absolute: 0 },
        eventIdentity: "t1",
        eventVersion: 1,
        source: "tier1_mark_all",
      })
    ).toBe(false);
    expect(applySpy).not.toHaveBeenCalled();
    expect(getProjectionAuthorityCounters().event_fact_baseline_missing).toBe(1);
  });

  it("admin_notice_absolute=0 changes Bell only; App Icon / CM / Trade / Order unchanged", () => {
    seedHttp();
    applySpy.mockClear();
    const before = getLastCompleteProjectionInput();

    expect(
      commitNotificationEventReadFact({
        fact: { kind: "admin_notice_absolute", absolute: 0 },
        eventIdentity: "tier1-1",
        eventVersion: 1_000,
        source: "tier1_mark_all",
      })
    ).toBe(true);

    const p = lastProjection();
    // Bell adminNotice cleared; approved total reduced by cleared admin (4).
    expect(p.bell.adminNotice).toBe(0);
    expect(p.bellTotal).toBe(16);
    // App Icon axes stable (App Icon never counts adminNotice anyway).
    expect(p.appIcon.messenger).toBe(3); // gd(2)+group(1)
    expect(p.appIcon.trade).toBe(3);
    expect(p.appIcon.missedCall).toBe(5);
    // Domain rooms unchanged.
    const after = getLastCompleteProjectionInput();
    expect(after?.domainUnreadRooms).toEqual(before?.domainUnreadRooms);
    expect(after?.orphanMissedCall).toBe(before?.orphanMissedCall);
    expect(getProjectionAuthorityCounters().event_fact_commit_ok).toBe(1);
  });

  it("orphan_missed_absolute=0 changes orphan/Bell missed/App Icon missed only; CM unchanged", () => {
    seedHttp();
    applySpy.mockClear();
    const before = getLastCompleteProjectionInput();

    expect(
      commitNotificationEventReadFact({
        fact: { kind: "orphan_missed_absolute", absolute: 0 },
        eventIdentity: "missed-1",
        eventVersion: 2_000,
        source: "call_logs_viewed",
        scope: "call_logs",
      })
    ).toBe(true);

    const p = lastProjection();
    expect(p.appIcon.missedCall).toBe(0);
    expect(p.bell.missedCall).toBe(0);
    expect(p.bellTotal).toBe(15); // 20 - 5 cleared missed
    // CM / trade / store unchanged.
    expect(p.appIcon.messenger).toBe(3);
    const after = getLastCompleteProjectionInput();
    expect(after?.domainUnreadRooms).toEqual(before?.domainUnreadRooms);
  });

  it("orphan_missed_delta reduces orphan by cleared count", () => {
    seedHttp();
    applySpy.mockClear();
    expect(
      commitNotificationEventReadFact({
        fact: { kind: "orphan_missed_delta", cleared: 2 },
        eventIdentity: "missed-delta-1",
        eventVersion: 3_000,
        source: "missed_call_read",
      })
    ).toBe(true);
    expect(getLastCompleteProjectionInput()?.orphanMissedCall).toBe(3);
    expect(lastProjection().appIcon.missedCall).toBe(3);
  });

  it("duplicate eventIdentity → no second commit", () => {
    seedHttp();
    applySpy.mockClear();
    const ev = {
      fact: { kind: "admin_notice_absolute", absolute: 0 } as const,
      eventIdentity: "dup-1",
      eventVersion: 1_000,
      source: "tier1_mark_all",
    };
    expect(commitNotificationEventReadFact(ev)).toBe(true);
    const commits = applySpy.mock.calls.length;
    expect(commitNotificationEventReadFact(ev)).toBe(false);
    expect(applySpy.mock.calls.length).toBe(commits);
    expect(getProjectionAuthorityCounters().duplicate_event).toBe(1);
  });

  it("stale eventVersion on same axis is rejected", () => {
    seedHttp();
    applySpy.mockClear();
    expect(
      commitNotificationEventReadFact({
        fact: { kind: "orphan_missed_delta", cleared: 1 },
        eventIdentity: "m-newer",
        eventVersion: 5_000,
        source: "missed_call_read",
      })
    ).toBe(true);
    expect(
      commitNotificationEventReadFact({
        fact: { kind: "orphan_missed_delta", cleared: 1 },
        eventIdentity: "m-older",
        eventVersion: 4_000,
        source: "missed_call_read",
      })
    ).toBe(false);
    expect(getProjectionAuthorityCounters().event_version_stale).toBe(1);
  });

  it("noop when value already at target (admin already 0) → no commit", () => {
    seedHttp();
    // First clears admin to 0 (commit).
    commitNotificationEventReadFact({
      fact: { kind: "admin_notice_absolute", absolute: 0 },
      eventIdentity: "a1",
      eventVersion: 1_000,
      source: "tier1_mark_all",
    });
    applySpy.mockClear();
    // Second admin=0 → no change → noop, no apply.
    expect(
      commitNotificationEventReadFact({
        fact: { kind: "admin_notice_absolute", absolute: 0 },
        eventIdentity: "a2",
        eventVersion: 2_000,
        source: "tier1_mark_all",
      })
    ).toBe(true);
    expect(applySpy).not.toHaveBeenCalled();
    expect(getProjectionAuthorityCounters().event_fact_noop).toBe(1);
  });

  it("unknown fact kind → event_kind_rejected", () => {
    seedHttp();
    expect(
      commitNotificationEventReadFact({
        // @ts-expect-error intentional invalid kind
        fact: { kind: "bell_minus_one", absolute: 1 },
        eventIdentity: "bad",
        eventVersion: 1,
        source: "x",
      })
    ).toBe(false);
    expect(getProjectionAuthorityCounters().event_kind_rejected).toBe(1);
  });

  it("client resync module never re-reads Hub/Bell snapshot into a Projection input", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/client/notification-events-read-resync.ts"),
      "utf8"
    );
    expect(src).not.toContain("projectionInputFromSurfaces");
    expect(src).not.toContain("reapplyProjectionFromInput");
    expect(src).not.toContain("getOwnerHubBadgeSnapshot");
    expect(src).not.toContain("applyNotificationBadgeProjection");
    expect(src).toContain("commitNotificationEventReadFact");
  });
});
