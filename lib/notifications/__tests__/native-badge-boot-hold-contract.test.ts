/**
 * @vitest-environment jsdom
 *
 * NativeBadgeSync boot flicker contract — COMPLETE 전 0/clear 금지.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveNativeBadgeSyncWrite } from "@/lib/push/native/native-badge-sync-policy";
import {
  __resetDomainBadgeSurfaceStoreForTests,
  getDomainBadgeSurfaceSnapshot,
  publishDomainAppIconCompleteSnapshot,
  resetDomainBadgeSurfaceForAuthEpoch,
} from "@/lib/messenger/contracts/domain-badge-surface-store";
import {
  commitCompleteProjectionSnapshot,
  getProjectionAuthorityState,
  markProjectionAuthorityWaitingComplete,
  resetProjectionAuthorityForTests,
  subscribeProjectionAuthorityState,
} from "@/lib/notifications/projection-authority";
import { EMPTY_BELL_BADGE_FACTS } from "@/lib/notifications/build-notification-badge-projection";
import fs from "node:fs";
import path from "node:path";

function completeInput(appMessenger: number) {
  return {
    domainUnreadRooms: {
      general_direct: appMessenger,
      group: 0,
      trade: 0,
      store_order: 0,
    },
    storeOrderBuyerDeliveryUnread: 0,
    storeOrderOwnerChatUnread: 0,
    orphanMissedCall: 0,
    nonChatEventAttention: {
      tradeStatus: 0,
      orderStatus: 0,
      deliveryStatus: 0,
      communityActivity: 0,
      adminNotice: 0,
    },
    notificationAttentionTotal: 0,
    unreadApprovedNotificationEvents: 0,
    bell: { ...EMPTY_BELL_BADGE_FACTS },
    rowUnreadByRoomId: {},
  };
}

describe("resolveNativeBadgeSyncWrite policy", () => {
  it("1. authenticated + incomplete → hold (native write 0)", () => {
    expect(
      resolveNativeBadgeSyncWrite({
        sessionPhase: "authenticated",
        projectionState: "EMPTY",
      }).kind
    ).toBe("hold");
    expect(
      resolveNativeBadgeSyncWrite({
        sessionPhase: "authenticated",
        projectionState: "WAITING_COMPLETE",
      }).kind
    ).toBe("hold");
  });

  it("2. authenticated + COMPLETE N → echo_authority", () => {
    expect(
      resolveNativeBadgeSyncWrite({
        sessionPhase: "authenticated",
        projectionState: "COMPLETE",
      })
    ).toEqual({ kind: "echo_authority", reason: "complete_snapshot" });
  });

  it("3. authenticated + COMPLETE 0 still echo_authority (clear via sync 0)", () => {
    expect(
      resolveNativeBadgeSyncWrite({
        sessionPhase: "authenticated",
        projectionState: "COMPLETE",
      }).kind
    ).toBe("echo_authority");
  });

  it("4. logout terminal_guest → clear_logout", () => {
    expect(
      resolveNativeBadgeSyncWrite({
        sessionPhase: "terminal_guest",
        projectionState: "EMPTY",
      })
    ).toEqual({ kind: "clear_logout", reason: "terminal_guest" });
  });

  it("5. loading/recovering/corrupt → hold (no mid-boot clear)", () => {
    for (const phase of ["loading", "recovering", "corrupt"] as const) {
      expect(
        resolveNativeBadgeSyncWrite({
          sessionPhase: phase,
          projectionState: "EMPTY",
        }).kind
      ).toBe("hold");
    }
  });
});

describe("incomplete → COMPLETE transition (no early clear gate)", () => {
  beforeEach(() => {
    resetProjectionAuthorityForTests();
    __resetDomainBadgeSurfaceStoreForTests();
  });

  it("5b. WAITING then COMPLETE notifies; surface first hydrate includes authoritative 0", () => {
    const states: string[] = [];
    subscribeProjectionAuthorityState(() => {
      states.push(getProjectionAuthorityState());
    });
    markProjectionAuthorityWaitingComplete("test_boot");
    expect(getProjectionAuthorityState()).toBe("WAITING_COMPLETE");
    expect(
      resolveNativeBadgeSyncWrite({
        sessionPhase: "authenticated",
        projectionState: getProjectionAuthorityState(),
      }).kind
    ).toBe("hold");

    commitCompleteProjectionSnapshot(completeInput(0), {
      source: "test",
      projectionVersionMs: 100,
      applyBell: false,
    });
    expect(getProjectionAuthorityState()).toBe("COMPLETE");
    expect(states).toContain("COMPLETE");
    // first hydrate: generation 0→1 even when totals are 0
    expect(getDomainBadgeSurfaceSnapshot().generation).toBeGreaterThan(0);
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(0);
    expect(
      resolveNativeBadgeSyncWrite({
        sessionPhase: "authenticated",
        projectionState: "COMPLETE",
      }).kind
    ).toBe("echo_authority");
  });

  it("6. stale factsVersion does not overwrite newer COMPLETE surface", () => {
    publishDomainAppIconCompleteSnapshot({
      communityMessengerUnread: 5,
      tradeUnread: 0,
      storeOrderChatUnread: 0,
      missedCall: 0,
      projectionFactsVersion: 200,
    });
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(5);
    const stale = publishDomainAppIconCompleteSnapshot({
      communityMessengerUnread: 1,
      tradeUnread: 0,
      storeOrderChatUnread: 0,
      missedCall: 0,
      projectionFactsVersion: 100,
    });
    expect(stale.committed).toBe(false);
    expect(stale.reason).toBe("stale_facts_version");
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(5);
  });

  it("7. account A COMPLETE N then auth epoch reset — surface generation 0; hold until next COMPLETE", () => {
    publishDomainAppIconCompleteSnapshot({
      communityMessengerUnread: 9,
      tradeUnread: 0,
      storeOrderChatUnread: 0,
      missedCall: 0,
      projectionFactsVersion: 300,
    });
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(9);
    resetDomainBadgeSurfaceForAuthEpoch();
    resetProjectionAuthorityForTests();
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(0);
    expect(getDomainBadgeSurfaceSnapshot().generation).toBe(0);
    expect(getProjectionAuthorityState()).toBe("EMPTY");
    expect(
      resolveNativeBadgeSyncWrite({
        sessionPhase: "authenticated",
        projectionState: "EMPTY",
      }).kind
    ).toBe("hold");
    // New account COMPLETE must not reuse A's digit from wiped store
    commitCompleteProjectionSnapshot(completeInput(2), {
      source: "test",
      projectionVersionMs: 400,
      applyBell: false,
    });
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(2);
  });
});

describe("NativeBadgeSync static gate", () => {
  it("uses COMPLETE gate + hold policy; Cap cache not authority", () => {
    const native = fs.readFileSync(
      path.join(process.cwd(), "components/push/NativeBadgeSync.tsx"),
      "utf8"
    );
    expect(native).toContain("resolveNativeBadgeSyncWrite");
    expect(native).toContain("getProjectionAuthorityState");
    expect(native).toContain("subscribeProjectionAuthorityState");
    expect(native).toContain("NativeBadgeSync.hold");
    expect(native).not.toContain("applyFromCapBadgeCache");
    expect(native).not.toContain("generation > 0");
  });
});
