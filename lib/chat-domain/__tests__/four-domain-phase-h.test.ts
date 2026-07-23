import { describe, expect, it } from "vitest";
import { applyAppIconBadgeProjection } from "@/lib/chat-domain/projections/app-icon-badge-projection";
import { applyBellBadgeProjection } from "@/lib/chat-domain/projections/bell-badge-projection";
import {
  applyHubBadgeProjection,
  getHubBadgeProjection,
  __resetHubBadgeProjectionForTest,
} from "@/lib/chat-domain/projections/hub-badge-projection";
import {
  PHASE_H_PROJECTION_WRITER_PATHS,
  PHASE_H_QUARANTINE_CANDIDATES,
} from "@/lib/chat-domain/projections/phase-h-quarantine";
import { SURFACE_PROJECTION_NOT_WIRED } from "@/lib/chat-domain/projections/surface-projection-types";
import { applyGeneralDirectListProjection } from "@/lib/chat-domain/list/general-direct-list-writer";
import { applyGroupListProjection } from "@/lib/chat-domain/list/group-list-writer";
import { applyStoreOrderListProjection } from "@/lib/chat-domain/list/store-order-list-writer";
import { applyTradeListProjection } from "@/lib/chat-domain/list/trade-list-writer";
import { OWNER_HUB_BADGE_EMPTY } from "@/lib/chats/owner-hub-badge-types";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const bellSnap = { totalUnread: 1, versionMs: 1 };

describe("Phase H surface projection writers", () => {
  it("Hub apply is wired (slice-1); Bell/AppIcon stay not_wired; Domain list writers ok", () => {
    __resetHubBadgeProjectionForTest();
    const hubSnap = {
      breakdown: { ...OWNER_HUB_BADGE_EMPTY, communityMessengerUnread: 2, total: 2 },
      versionMs: 1,
      source: "network_fresh" as const,
      totalUnread: 2,
    };
    expect(applyHubBadgeProjection(hubSnap)).toEqual({ status: "ok" });
    expect(getHubBadgeProjection()?.totalUnread).toBe(2);
    expect(applyBellBadgeProjection(bellSnap)).toEqual({
      status: "not_wired",
      error: SURFACE_PROJECTION_NOT_WIRED,
    });
    expect(applyAppIconBadgeProjection(bellSnap)).toEqual({
      status: "not_wired",
      error: SURFACE_PROJECTION_NOT_WIRED,
    });
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
    expect(applyStoreOrderListProjection({ ...listSnap, chatDomain: "store_order" }).status).toBe("ok");
  });

  it("freeze TARGET writer files exist; quarantine list is R1–R4 only", () => {
    const root = resolve(__dirname, "../../..");
    for (const rel of PHASE_H_PROJECTION_WRITER_PATHS) {
      expect(existsSync(resolve(root, rel)), rel).toBe(true);
    }
    expect(PHASE_H_QUARANTINE_CANDIDATES.map((c) => c.id)).toEqual(["R1", "R2", "R3", "R4"]);
  });
});
