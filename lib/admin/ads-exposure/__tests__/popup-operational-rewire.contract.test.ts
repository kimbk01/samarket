import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이 시험은 어드민 문구를 검사한다 (전역 준비 파일에서 옮김, C3 2026-11-11)
import { readFileSync } from "node:fs";
import { withCatalogCopy } from "@/lib/i18n/__tests__/support/source-with-catalog-copy";
import { describe, expect, it } from "vitest";
import { MESSAGES } from "@/lib/i18n/messages";

const read = (path: string) => withCatalogCopy(readFileSync(`${process.cwd()}/${path}`, "utf8"));

describe("popup operational rewire source contracts", () => {
  it("requires a hub name and no longer posts an untitled fallback", () => {
    const route = read("app/api/admin/platform-popup-campaigns/route.ts");
    expect(route).not.toContain('"Untitled popup"');
  });

  it("creates draft first and approves only after creative readiness", () => {
    const source = read("lib/platform-popup/admin-direct-complete-create.ts");
    const createAt = source.indexOf("createPlatformPopupAdminCampaign");
    const creativeAt = source.indexOf("replacePlatformPopupReadyCreative", createAt);
    const approveAt = source.indexOf("adminApprovePlatformPopupCampaign", creativeAt);
    expect(createAt).toBeGreaterThan(-1);
    expect(creativeAt).toBeGreaterThan(createAt);
    expect(approveAt).toBeGreaterThan(creativeAt);
    expect(source).toContain('status: "draft"');
    expect(source).toContain("incomplete: true");
  });

  it("renders creative and uses a distinct preview destination", () => {
    const workspace = read("components/admin/ads/AdminAdvertisingWorkspace.tsx");
    expect(workspace).toContain("selectedShell.creativeImageUrl");
    expect(workspace).toContain("r.previewHref");
    expect(workspace).toContain("selectedShell.previewHref");
    /** Preview CTA ≠ product detail — labels stay separate (not a combined edit/detail). */
    expect(workspace).toContain('t("admin_ads_preview")');
    expect(workspace).toContain('t("admin_ads_placement_product_detail")');
    expect(MESSAGES.ko.admin_ads_preview).toBe("미리보기");
    expect(MESSAGES.en.admin_ads_preview).toBe("Preview");
    expect(MESSAGES.ko.admin_ads_placement_product_detail).toBe("상품 상세");
    expect(MESSAGES.en.admin_ads_placement_product_detail).toBe("Product detail");
    expect(workspace).not.toContain("수정 / 상세");
  });
});
