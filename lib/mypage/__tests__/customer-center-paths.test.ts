import { describe, expect, it } from "vitest";
import {
  CUSTOMER_CENTER_HREF,
  customerCenterChildHref,
  resolveCustomerCenterBackHref,
  withCustomerCenterFrom,
  resolveNoticeListBackHref,
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

  it("preserves from on grandchild links", () => {
    expect(withCustomerCenterFrom("/mypage/points/charge", "customer-center")).toBe(
      "/mypage/points/charge?from=customer-center",
    );
    expect(withCustomerCenterFrom("/mypage/points/charge", null)).toBe("/mypage/points/charge");
    expect(resolveNoticeListBackHref("customer-center")).toBe(
      "/mypage/customer-center/notice?from=customer-center",
    );
    expect(resolveNoticeListBackHref("notifications")).toBe("/notifications");
  });

  it("redirects legacy support stub to hub", () => {
    expect(resolveMypageSectionLegacyHubRedirect("settings", "support")).toBe(
      CUSTOMER_CENTER_HREF,
    );
  });

  it("wires support section to Customer Center hub only", () => {
    expect(MYPAGE_HOME_SUPPORT_ITEMS).toEqual([
      {
        href: CUSTOMER_CENTER_HREF,
        titleKey: "mypage_comp_menu_support_cs_title",
        icon: "help-circle",
      },
    ]);
  });
});
