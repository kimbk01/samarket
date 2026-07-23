import { describe, expect, it } from "vitest";
import { applyAppIconBadgeProjection } from "@/lib/chat-domain/projections/app-icon-badge-projection";
import { applyBellBadgeProjection } from "@/lib/chat-domain/projections/bell-badge-projection";
import { applyHubBadgeProjection } from "@/lib/chat-domain/projections/hub-badge-projection";
import {
  PHASE_H_PROJECTION_WRITER_PATHS,
  PHASE_H_QUARANTINE_CANDIDATES,
} from "@/lib/chat-domain/projections/phase-h-quarantine";
import { SURFACE_PROJECTION_NOT_WIRED } from "@/lib/chat-domain/projections/surface-projection-types";
import { applyGeneralDirectListProjection } from "@/lib/chat-domain/list/general-direct-list-writer";
import { applyGroupListProjection } from "@/lib/chat-domain/list/group-list-writer";
import { applyStoreOrderListProjection } from "@/lib/chat-domain/list/store-order-list-writer";
import { applyTradeListProjection } from "@/lib/chat-domain/list/trade-list-writer";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const snap = { totalUnread: 1, versionMs: 1 };

describe("Phase H surface projection writers", () => {
  it("badge writers exist and stay not_wired (no product cutover)", () => {
    expect(applyHubBadgeProjection(snap)).toEqual({
      status: "not_wired",
      error: SURFACE_PROJECTION_NOT_WIRED,
    });
    expect(applyBellBadgeProjection(snap)).toEqual({
      status: "not_wired",
      error: SURFACE_PROJECTION_NOT_WIRED,
    });
    expect(applyAppIconBadgeProjection(snap)).toEqual({
      status: "not_wired",
      error: SURFACE_PROJECTION_NOT_WIRED,
    });
  });

  it("domain list writers stay not_wired (applyHomeListPatch KEEP)", () => {
    const listSnap = {
      chatDomain: "general_direct" as const,
      items: [],
      versionMs: 1,
    };
    expect(applyGeneralDirectListProjection(listSnap).status).toBe("not_wired");
    expect(applyGroupListProjection({ ...listSnap, chatDomain: "group" }).status).toBe("not_wired");
    expect(applyTradeListProjection({ ...listSnap, chatDomain: "trade" }).status).toBe("not_wired");
    expect(applyStoreOrderListProjection({ ...listSnap, chatDomain: "store_order" }).status).toBe(
      "not_wired",
    );
  });

  it("freeze TARGET writer files exist; quarantine list is R1–R4 only (no delete)", () => {
    const root = resolve(__dirname, "../../..");
    for (const rel of PHASE_H_PROJECTION_WRITER_PATHS) {
      expect(existsSync(resolve(root, rel)), rel).toBe(true);
    }
    expect(PHASE_H_QUARANTINE_CANDIDATES.map((c) => c.id)).toEqual(["R1", "R2", "R3", "R4"]);
  });
});
