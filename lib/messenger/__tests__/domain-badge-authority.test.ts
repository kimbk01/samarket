/**
 * STEP 4 — Domain Badge Authority tests (all-user CONNECTED).
 */
import { describe, expect, it } from "vitest";
import {
  composeDomainBadgeAuthorityForHarness,
  isDomainBadgeAuthorityEnabledForViewer,
  listDomainBadgeAuthoritySurfaces,
  readDomainBadgeAuthorityShell,
} from "@/lib/messenger/contracts/domain-badge-authority";
import {
  PHASE11D_A_ALL_USER_DOMAIN_AUTHORITY,
  PHASE11D_A_BADGE_AUTHORITY_PREPARED,
  PHASE11D_A_BADGE_READ_WIRING,
  PHASE11D_A_CANARY_ALLOWLIST_USER_IDS,
  PHASE11D_A_PRODUCTION_HOME_WIRING,
} from "@/lib/messenger/contracts/phase11da-canary-gate";
import { PHASE8A_BADGE_PRODUCTION_WIRING } from "@/lib/messenger/contracts/domain-read-unread-badge";
import { PHASE8B_BADGE_PRODUCTION_WIRING } from "@/lib/messenger/contracts/badge-unit-policy-phase8b";
import type { Phase8aBadgeShellInput } from "@/lib/messenger/contracts/badge-shell-phase8a";

const CANARY = PHASE11D_A_CANARY_ALLOWLIST_USER_IDS[0];
const OTHER = "00000000-0000-4000-8000-000000000099";

function contrib(
  domain: "general_direct" | "group" | "trade" | "store_order",
  unreadRoomCount: number,
  unreadMessageCount: number
) {
  return {
    domain,
    viewerUserId: CANARY,
    unreadMessageCount,
    unreadRoomCount,
    unreadIdentityKeys: [] as string[],
    latestUnreadGeneration: 1,
    generation: 1,
    sourceAuthority: "server_snapshot" as const,
    computedAt: "2026-07-01T00:00:00.000Z",
  };
}

function phase8aInput(): Phase8aBadgeShellInput {
  return {
    generalDirect: { ...contrib("general_direct", 1, 2), domain: "general_direct" },
    group: { ...contrib("group", 0, 0), domain: "group" },
    trade: { ...contrib("trade", 2, 3), domain: "trade" },
    storeOrder: {
      ...contrib("store_order", 1, 1),
      domain: "store_order",
      surfaceRole: "customer",
      storeId: "store-1",
      unreadOrderIdentityKeys: ["store_order:order-1"],
    },
    orderStatus: {
      kind: "order_status",
      viewerUserId: CANARY,
      orderStatusCount: 0,
      actionableOrderIdentityKeys: [],
      generation: 1,
      computedAt: "2026-07-01T00:00:00.000Z",
    },
  };
}

describe("STEP4 Domain Badge Authority", () => {
  it("prepared and product wiring CONNECTED for all authenticated viewers", () => {
    expect(PHASE11D_A_BADGE_AUTHORITY_PREPARED).toBe(true);
    expect(PHASE11D_A_BADGE_READ_WIRING).toBe(true);
    expect(PHASE11D_A_ALL_USER_DOMAIN_AUTHORITY).toBe(true);
    expect(PHASE8A_BADGE_PRODUCTION_WIRING).toBe(false);
    expect(PHASE8B_BADGE_PRODUCTION_WIRING).toBe(false);
    expect(PHASE11D_A_PRODUCTION_HOME_WIRING).toBe(true);
    expect(isDomainBadgeAuthorityEnabledForViewer(CANARY)).toBe(true);
    expect(isDomainBadgeAuthorityEnabledForViewer(OTHER)).toBe(true);
    expect(isDomainBadgeAuthorityEnabledForViewer("")).toBe(false);
    expect(
      listDomainBadgeAuthoritySurfaces().every((s) => s.authority === "DOMAIN_AUTHORITY")
    ).toBe(true);
  });

  it("product read returns ok for any authenticated viewer", () => {
    const result = readDomainBadgeAuthorityShell({
      viewerUserId: OTHER,
      counts: { general_direct: 1, group: 0, trade: 2, store_order: 1 },
      phase8a: phase8aInput(),
    });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.shell.communityMessengerUnread).toBe(1);
      expect(result.shell.tradeUnread).toBe(2);
      expect(result.shell.storeOrderChatUnread).toBe(1);
      expect(result.phase8a.messengerNav.unreadRoomCount).toBe(1);
      expect(result.phase8a.messengerNav.domains).toEqual(["general_direct", "group"]);
    }
  });

  it("anonymous product read skips", () => {
    expect(
      readDomainBadgeAuthorityShell({
        viewerUserId: "",
        counts: { general_direct: 1, group: 0, trade: 2, store_order: 1 },
        phase8a: phase8aInput(),
      })
    ).toEqual({
      status: "skipped",
      reason: "authority_off_or_not_allowlisted",
    });
  });

  it("harness compose: Home = GD+Group; trade/order on hubs", () => {
    const { shell, phase8a } = composeDomainBadgeAuthorityForHarness({
      counts: { general_direct: 1, group: 2, trade: 5, store_order: 4 },
      phase8a: phase8aInput(),
    });
    expect(shell.communityMessengerUnread).toBe(3);
    expect(shell.tradeUnread).toBe(5);
    expect(shell.storeOrderChatUnread).toBe(4);
    expect(phase8a.messengerNav.unreadRoomCount).toBe(1);
    expect(phase8a.messengerNav.domains).toEqual(["general_direct", "group"]);
    expect(phase8a.tradeHub.unreadRoomCount).toBe(2);
    expect(phase8a.storeOrderHub.unreadRoomCount).toBe(1);
  });
});
