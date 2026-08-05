import { describe, expect, it } from "vitest";
import {
  CUSTOMER_CENTER_HREF,
  customerCenterChildHref,
  resolveCustomerCenterBackHref,
} from "@/lib/mypage/customer-center-paths";
import { resolveMypageSectionLegacyHubRedirect } from "@/lib/mypage/mypage-section-legacy-redirect";
import { MYPAGE_HOME_SUPPORT_ITEMS } from "@/lib/mypage/mypage-home-menu-config";

describe("customer-center paths", () => {
  it("builds child href with from query", () => {
    expect(customerCenterChildHref("/mypage/inquiries")).toBe(
      "/mypage/inquiries?from=customer-center",
    );
    expect(customerCenterChildHref("/mypage/points?x=1")).toBe(
      "/mypage/points?x=1&from=customer-center",
    );
  });

  it("resolves back to hub only when from=customer-center", () => {
    expect(resolveCustomerCenterBackHref("customer-center")).toBe(CUSTOMER_CENTER_HREF);
    expect(resolveCustomerCenterBackHref(null)).toBe("/mypage");
    expect(resolveCustomerCenterBackHref("other", "/mypage/section/settings")).toBe(
      "/mypage/section/settings",
    );
  });

  it("redirects legacy support stub to hub", () => {
    expect(resolveMypageSectionLegacyHubRedirect("settings", "support")).toBe(
      CUSTOMER_CENTER_HREF,
    );
  });

  it("wires support section CS row to hub (not stub)", () => {
    const cs = MYPAGE_HOME_SUPPORT_ITEMS.find(
      (i) => i.titleKey === "mypage_comp_menu_support_cs_title",
    );
    expect(cs?.href).toBe(CUSTOMER_CENTER_HREF);
    expect(MYPAGE_HOME_SUPPORT_ITEMS.map((i) => i.href)).not.toContain(
      "/mypage/section/settings/support",
    );
  });
});
