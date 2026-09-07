import { describe, expect, it } from "vitest";
import {
  adsCreateConfirmCopy,
  adsPlacementReorderConfirmCopy,
  adsWorkspaceActionNeedsReason,
  adsWorkspaceMutationConfirmCopy,
} from "@/lib/admin/ads-exposure/admin-mutation-confirm-copy";

describe("admin mutation confirm copy (CUT R1)", () => {
  it("requires reason for reject / hold / terminate / delivery pause", () => {
    expect(adsWorkspaceActionNeedsReason("reject", "feed_banner")).toBe(true);
    expect(adsWorkspaceActionNeedsReason("request_changes", "delivery_banner")).toBe(true);
    expect(adsWorkspaceActionNeedsReason("terminate", "delivery_banner")).toBe(true);
    expect(adsWorkspaceActionNeedsReason("pause", "delivery_banner")).toBe(true);
    expect(adsWorkspaceActionNeedsReason("pause", "community_promote")).toBe(false);
    expect(adsWorkspaceActionNeedsReason("approve", "feed_banner")).toBe(false);
  });

  it("uses action-specific Korean copy (not generic)", () => {
    const approve = adsWorkspaceMutationConfirmCopy("approve", true);
    expect(approve.title).toContain("승인");
    expect(approve.confirmLabel).toBe("승인");
    expect(approve.body).not.toMatch(/처리하시겠습니까/);

    const reject = adsWorkspaceMutationConfirmCopy("reject", true);
    expect(reject.tone).toBe("danger");
    expect(reject.reasonRequired).toBe(true);

    const sanction = adsWorkspaceMutationConfirmCopy("pause", true, {
      boostSanction: true,
    });
    expect(sanction.title).toContain("제재");
    expect(sanction.confirmLabel).toBe("제재");
  });

  it("placement reorder has dedicated copy", () => {
    const c = adsPlacementReorderConfirmCopy(true);
    expect(c.title).toContain("순서");
    expect(c.confirmLabel).toBe("저장");
  });

  it("create registration has dedicated copy", () => {
    const c = adsCreateConfirmCopy(true);
    expect(c.title).toContain("등록");
    expect(c.confirmLabel).toBe("등록");
  });

  it("memo copy exists but R1 UI skips confirm for ordinary note save", () => {
    const memo = adsWorkspaceMutationConfirmCopy("add_internal_memo", true);
    expect(memo.confirmLabel).toBe("저장");
  });
});
