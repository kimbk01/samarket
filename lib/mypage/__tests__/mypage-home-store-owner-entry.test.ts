import { describe, expect, it } from "vitest";
import { resolveMypageHomeStoreOwnerEntry } from "@/lib/mypage/mypage-home-menu-config";
import { getOwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { showStoreBusinessApplyLink } from "@/components/business/store-business-blocked-copy";
import { OwnerRoutes } from "@/lib/business/owner-routes";

describe("resolveMypageHomeStoreOwnerEntry", () => {
  it("EMPTY / null → 매장 신청 → apply", () => {
    const empty = resolveMypageHomeStoreOwnerEntry({ kind: "empty" });
    expect(empty.href).toBe(OwnerRoutes.apply());
    expect(empty.titleKey).toBe("mypage_hub_store_apply");

    const unknown = resolveMypageHomeStoreOwnerEntry(null);
    expect(unknown.href).toBe(OwnerRoutes.apply());
  });

  it("PENDING / UNDER_REVIEW → 승인 진행 → /stores/owner", () => {
    for (const status of ["pending", "under_review"] as const) {
      const gate = getOwnerStoreGateState([{ id: "s1", approval_status: status }]);
      const entry = resolveMypageHomeStoreOwnerEntry(gate, "s1");
      expect(entry.href).toBe(OwnerRoutes.hub());
      expect(entry.titleKey).toBe("mypage_comp_menu_store_approval_progress_title");
      expect(entry.approvalStatusForBadge).toBe(status);
      expect(showStoreBusinessApplyLink(gate)).toBe(false);
    }
  });

  it("REVISION_REQUESTED → 승인 진행 → /stores/owner", () => {
    const gate = getOwnerStoreGateState([
      { id: "s1", approval_status: "revision_requested", revision_note: "보완" },
    ]);
    const entry = resolveMypageHomeStoreOwnerEntry(gate, "s1");
    expect(entry.href).toBe(OwnerRoutes.hub());
    expect(entry.titleKey).toBe("mypage_comp_menu_store_approval_progress_title");
    expect(showStoreBusinessApplyLink(gate)).toBe(false);
  });

  it("REJECTED → apply 금지 → /stores/owner", () => {
    const gate = getOwnerStoreGateState([
      { id: "s1", approval_status: "rejected", rejected_reason: "반려" },
    ]);
    expect(gate.kind).toBe("pending");
    const entry = resolveMypageHomeStoreOwnerEntry(gate, "s1");
    expect(entry.href).toBe(OwnerRoutes.hub());
    expect(entry.href.includes("/apply")).toBe(false);
    expect(showStoreBusinessApplyLink(gate)).toBe(false);
  });

  it("SUSPENDED → apply 금지 → /stores/owner", () => {
    const gate = getOwnerStoreGateState([{ id: "s1", approval_status: "suspended" }]);
    const entry = resolveMypageHomeStoreOwnerEntry(gate, "s1");
    expect(entry.href).toBe(OwnerRoutes.hub());
    expect(showStoreBusinessApplyLink(gate)).toBe(false);
  });

  it("APPROVED → 매장 진입 → canonical hub + storeId", () => {
    const gate = getOwnerStoreGateState([{ id: "store-uuid-1", approval_status: "approved" }]);
    const entry = resolveMypageHomeStoreOwnerEntry(gate, "store-uuid-1");
    expect(entry.titleKey).toBe("mypage_comp_menu_store_enter_title");
    expect(entry.href).toBe(OwnerRoutes.hub("store-uuid-1"));
    expect(showStoreBusinessApplyLink(gate)).toBe(false);
  });

  it("empty gate still allows apply link (R1)", () => {
    expect(showStoreBusinessApplyLink({ kind: "empty" })).toBe(true);
  });
});

describe("MyInfoStoreMenuSection network contract (source)", () => {
  it("does not call me-stores list fetch directly", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/mypage/myinfo/MyInfoHomeMenuSections.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/fetchMeStoresListDeduped/);
    expect(src).not.toMatch(/fetch\s*\(\s*[`'"]\/api\/me\/stores/);
    expect(src).toMatch(/resolveMypageHomeStoreOwnerEntry/);
    expect(src).toMatch(/getOwnerStoreGateState/);
    expect(src).toMatch(/useOwnerLiteStore/);
  });
});
