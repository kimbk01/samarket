import { describe, expect, it } from "vitest";
import {
  applyAppIconBadgeProjection,
  getAppIconBadgeProjection,
  __resetAppIconBadgeProjectionForTest,
} from "@/lib/chat-domain/projections/app-icon-badge-projection";
import {
  applyBellBadgeProjection,
  getBellBadgeProjection,
  __resetBellBadgeProjectionForTest,
} from "@/lib/chat-domain/projections/bell-badge-projection";
import {
  applyHubBadgeProjection,
  getHubBadgeProjection,
  __resetHubBadgeProjectionForTest,
} from "@/lib/chat-domain/projections/hub-badge-projection";
import {
  PHASE_H_PROJECTION_WRITER_PATHS,
  PHASE_H_QUARANTINE_CANDIDATES,
} from "@/lib/chat-domain/projections/phase-h-quarantine";
import { applyGeneralDirectListProjection } from "@/lib/chat-domain/list/general-direct-list-writer";
import { applyGroupListProjection } from "@/lib/chat-domain/list/group-list-writer";
import { applyStoreOrderListProjection } from "@/lib/chat-domain/list/store-order-list-writer";
import { applyTradeListProjection } from "@/lib/chat-domain/list/trade-list-writer";
import { OWNER_HUB_BADGE_EMPTY } from "@/lib/chats/owner-hub-badge-types";
/** Side-effect: registers Bell → badge-count store sink (+ App Icon mirror). */
import "@/lib/notifications/notification-badge-count-store";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const EMPTY_BELL = {
  total: 1,
  chatMessage: 0,
  groupMessage: 0,
  tradeMessage: 0,
  tradeStatus: 0,
  orderStatus: 0,
  deliveryStatus: 0,
  communityActivity: 0,
  adminMarketingBanner: 0,
  adminNotice: 0,
  chat: 0,
  group: 0,
  trade: 0,
  store: 0,
  missedCall: 0,
};

describe("Phase H surface projection writers", () => {
  it("Hub/Bell/AppIcon apply are wired (slice-1); Domain list writers ok", () => {
    __resetHubBadgeProjectionForTest();
    __resetBellBadgeProjectionForTest();
    __resetAppIconBadgeProjectionForTest();
    const hubSnap = {
      breakdown: { ...OWNER_HUB_BADGE_EMPTY, communityMessengerUnread: 2, total: 2 },
      versionMs: 1,
      source: "network_fresh" as const,
      totalUnread: 2,
    };
    expect(applyHubBadgeProjection(hubSnap)).toEqual({ status: "ok" });
    expect(getHubBadgeProjection()?.totalUnread).toBe(2);

    expect(
      applyBellBadgeProjection({
        breakdown: EMPTY_BELL,
        versionMs: 2,
        source: "network",
        totalUnread: 1,
      }),
    ).toEqual({ status: "ok" });
    expect(getBellBadgeProjection()?.totalUnread).toBe(1);
    expect(getAppIconBadgeProjection()?.totalUnread).toBe(1);

    expect(
      applyAppIconBadgeProjection({ totalUnread: 3, versionMs: 3, source: "network" }),
    ).toEqual({ status: "ok" });
    expect(getAppIconBadgeProjection()?.totalUnread).toBe(3);
  });

  it("domain list writers are wired (applyHomeListPatch KEEP for paint)", () => {
    const listSnap = {
      chatDomain: "general_direct" as const,
      items: [],
      versionMs: 1,
    };
    expect(applyGeneralDirectListProjection(listSnap).status).toBe("ok");
    expect(applyGroupListProjection({ ...listSnap, chatDomain: "group" }).status).toBe("ok");
    expect(applyTradeListProjection({ ...listSnap, chatDomain: "trade" }).status).toBe("ok");
    expect(applyStoreOrderListProjection({ ...listSnap, chatDomain: "store_order" }).status).toBe(
      "ok",
    );
  });

  it("freeze TARGET writer files exist; quarantine list is R1–R4 only", () => {
    const root = resolve(__dirname, "../../..");
    for (const rel of PHASE_H_PROJECTION_WRITER_PATHS) {
      expect(existsSync(resolve(root, rel)), rel).toBe(true);
    }
    expect(PHASE_H_QUARANTINE_CANDIDATES.map((c) => c.id)).toEqual(["R1", "R2", "R3", "R4"]);
  });
});
