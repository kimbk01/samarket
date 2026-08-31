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

  it("body pad uses bar height + nav gap + effectiveBottomInset", () => {
    expect(ownerAdminFormBodyPadStyle(34)).toEqual({
      paddingBottom: "calc(68px + 34px)",
    });
    expect(ownerAdminFormBodyPadStyle(-4)).toEqual({
      paddingBottom: "calc(68px + 0px)",
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
    expect(above).toContain("bottom-[68px]");
    expect(above).not.toContain("safe-bottom");
  });
});
