import { describe, expect, it } from "vitest";
import {
  OWNER_ADMIN_FORM_FOOTER_BAR_HEIGHT_PX,
  ownerAdminFormBodyPadStyle,
  ownerAdminFormFooterBarHeightMatchesNavShell,
  ownerAdminFormFooterInsetStyle,
} from "@/lib/business/owner-admin-form-keyboard";
import { ownerStoreAdminFooterFixedClass } from "@/lib/business/owner-admin-footer-actions";

describe("owner admin form keyboard SSOT", () => {
  it("footer bar height matches bottom-nav shell", () => {
    expect(OWNER_ADMIN_FORM_FOOTER_BAR_HEIGHT_PX).toBe(60);
    expect(ownerAdminFormFooterBarHeightMatchesNavShell()).toBe(true);
  });

  it("body pad uses bar height + effectiveBottomInset (탭과 간격 없음 — Owner S-A 2026-11-03)", () => {
    expect(ownerAdminFormBodyPadStyle(34)).toEqual({
      paddingBottom: "calc(60px + 34px)",
    });
    expect(ownerAdminFormBodyPadStyle(-4)).toEqual({
      paddingBottom: "calc(60px + 0px)",
    });
  });

  it("footer inset is effectiveBottomInset only (no safe stack)", () => {
    expect(ownerAdminFormFooterInsetStyle(48)).toEqual({ paddingBottom: "48px" });
  });

  it("fixed footer class does not embed safe-bottom padding", () => {
    const base = ownerStoreAdminFooterFixedClass();
    expect(base).toContain("bottom-0");
    expect(base).not.toContain("safe-bottom");
    const above = ownerStoreAdminFooterFixedClass({ aboveBottomNav: true });
    // 탭 실제 높이(60 + 홈 원 돌출) 바로 위 — 바 아래가 탭에 가리지 않음 (Owner S-A 2026-11-03)
    expect(above).toContain("bottom-[calc(60px+var(--delivery-home-overhang,0px))]");
    expect(above).not.toContain("bottom-[68px]");
    // IA-20: ≥1280px 하단 탭 숨김 → 화면 하단에 붙음
    expect(above).toContain("min-[1280px]:bottom-0");
    expect(above).not.toContain("safe-bottom");
  });
});
