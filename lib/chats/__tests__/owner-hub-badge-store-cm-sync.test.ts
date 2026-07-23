import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import {
  __resetOwnerHubBadgeStoreForTest,
  __testApplyOwnerHubBadgePayloadForTest,
  applyHubBadgeCmUnreadRoomCountDelta,
  getOwnerHubBadgeSnapshot,
} from "@/lib/chats/owner-hub-badge-store";

function hubPayload(overrides: Partial<OwnerHubBadgeBreakdown> & { communityMessengerUnread: number }) {
  const cm = overrides.communityMessengerUnread;
  return {
    ok: true as const,
    chatUnread: 0,
    philifeChatUnread: overrides.philifeChatUnread ?? 0,
    socialChatUnread: overrides.socialChatUnread ?? 0,
    storeOrderChatUnread: 0,
    orderAttention: overrides.orderAttention ?? 0,
    inquiryAttention: 0,
    ownerReviewAttention: 0,
    storesTabAttention: overrides.storesTabAttention ?? 0,
    buyerOrderAttention: 0,
    storeDeepLink: null,
    total:
      overrides.total ??
      Math.max(0, overrides.socialChatUnread ?? 0) +
        Math.max(0, overrides.storesTabAttention ?? 0) +
        Math.max(0, cm),
    ...overrides,
    communityMessengerUnread: cm,
  };
}

describe("owner-hub-badge-store communityMessengerUnread sync", () => {
  beforeEach(() => {
    __resetOwnerHubBadgeStoreForTest();
  });

  it("applies fresh network cm=1 after stale store cm=0", () => {
    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 0 }), "client_cache");
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(0);

    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 1 }), "network_fresh");
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(1);
  });

  it("ignores stale broadcast cm=0 after fresh network cm=1", () => {
    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 1 }), "network_fresh");
    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 0 }), "broadcast");
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(1);
  });

  it("keeps snapshot stable on duplicate identical broadcast", () => {
    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 1 }), "network_fresh");
    const before = getOwnerHubBadgeSnapshot();
    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 1 }), "broadcast");
    expect(getOwnerHubBadgeSnapshot()).toEqual(before);
  });

  it("does not clobber trade/delivery/community fields when guarding cm downgrade", () => {
    __testApplyOwnerHubBadgePayloadForTest(
      hubPayload({
        communityMessengerUnread: 1,
        storesTabAttention: 7,
        philifeChatUnread: 4,
        socialChatUnread: 2,
      }),
      "network_fresh"
    );
    __testApplyOwnerHubBadgePayloadForTest(
      hubPayload({
        communityMessengerUnread: 0,
        storesTabAttention: 7,
        philifeChatUnread: 4,
        socialChatUnread: 2,
      }),
      "broadcast"
    );
    const snap = getOwnerHubBadgeSnapshot();
    expect(snap.communityMessengerUnread).toBe(1);
    expect(snap.storesTabAttention).toBe(7);
    expect(snap.philifeChatUnread).toBe(4);
    expect(snap.socialChatUnread).toBe(2);
  });

  it("allows fresh network cm decrease after mark_read (network_fresh cm=0)", () => {
    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 1 }), "network_fresh");
    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 0 }), "network_fresh");
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(0);
  });

  it("RC-1 proof: mark_read_ack + network_plain hub fetch blocked by stale guard", () => {
    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 1 }), "network_fresh");
    const communityMessengerUnread_before = getOwnerHubBadgeSnapshot().communityMessengerUnread;

    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 0 }), "network_plain");
    const communityMessengerUnread_after = getOwnerHubBadgeSnapshot().communityMessengerUnread;

    const proof = {
      mark_read_ack: true,
      notification_targets: 0,
      hub_fetch_mode: "network_plain",
      guardStaleCommunityMessengerUnread_blocked:
        communityMessengerUnread_before > 0 &&
        communityMessengerUnread_after === communityMessengerUnread_before,
      communityMessengerUnread_before,
      communityMessengerUnread_after,
      proof_note:
        "Pre-fix: mark_read within MESSENGER_MARK_READ_HUB_BYPASS_BLOCK_MS used useForceFresh=false → network_plain",
    };

    mkdirSync(join(process.cwd(), ".qa-logs"), { recursive: true });
    writeFileSync(join(process.cwd(), ".qa-logs/m2-rc1-stale-guard-proof.json"), JSON.stringify(proof, null, 2));

    expect(proof.guardStaleCommunityMessengerUnread_blocked).toBe(true);
  });

  it("mark_read ack hub fetch always uses network_fresh after RC-1 fix", () => {
    const storeSrc = readFileSync(join(process.cwd(), "lib/chats/owner-hub-badge-store.ts"), "utf8");
    expect(storeSrc).toContain("const useForceFresh = true");
    expect(storeSrc).not.toMatch(/const useForceFresh = !recentHubFetch/);

    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 1 }), "network_fresh");
    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 0 }), "network_fresh");
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(0);
  });

  it("applyHubBadgeCmUnreadRoomCountDelta bumps CM room count via optimistic projection", () => {
    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 0 }), "network_fresh");
    applyHubBadgeCmUnreadRoomCountDelta(1);
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(1);
    applyHubBadgeCmUnreadRoomCountDelta(1);
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(2);
  });

  it("applyHubBadgeCmUnreadRoomCountDelta(0) is a no-op", () => {
    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 3 }), "network_fresh");
    applyHubBadgeCmUnreadRoomCountDelta(0);
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(3);
  });
});
