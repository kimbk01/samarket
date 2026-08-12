import { describe, expect, it } from "vitest";
import {
  parseCustomerCenterContentType,
  resolveCustomerCenterAuthorLabel,
} from "@/lib/notices/customer-center-content";
import {
  buildCustomerCenterBoardDetailPath,
  buildCustomerCenterBoardListPath,
  parseCustomerCenterBoardFromPathname,
} from "@/lib/notices/customer-center-content-paths";
import { buildAppNoticeDetailPath } from "@/lib/notices/app-notice-paths";
import { resolveCustomerCenterCampaignContentBind } from "@/lib/notices/customer-center-campaign-bind";

describe("customer center content SSOT helpers", () => {
  it("parses content_type with notice fallback", () => {
    expect(parseCustomerCenterContentType("marketing")).toBe("marketing");
    expect(parseCustomerCenterContentType("nope")).toBe("notice");
  });

  it("resolves author labels without exposing admin identity", () => {
    expect(resolveCustomerCenterAuthorLabel({ contentType: "notice" })).toBe("DIBAY 운영팀");
    expect(resolveCustomerCenterAuthorLabel({ contentType: "system" })).toBe("DIBAY 시스템");
    expect(resolveCustomerCenterAuthorLabel({ contentType: "marketing" })).toBe("DIBAY");
    expect(
      resolveCustomerCenterAuthorLabel({ contentType: "marketing", authorLabel: "제휴사 A" })
    ).toBe("제휴사 A");
  });

  it("builds PATH board routes and keeps legacy notice detail", () => {
    expect(buildCustomerCenterBoardListPath("notice")).toBe("/mypage/customer-center/notice");
    expect(buildCustomerCenterBoardDetailPath("marketing", "abc")).toBe(
      "/mypage/customer-center/marketing/abc"
    );
    expect(buildAppNoticeDetailPath("abc")).toBe("/mypage/notices/abc");
    expect(parseCustomerCenterBoardFromPathname("/mypage/customer-center/system/x-1")).toEqual({
      contentType: "system",
      contentId: "x-1",
    });
  });

  it("binds campaign content to canonical Push/Bell route", () => {
    expect(
      resolveCustomerCenterCampaignContentBind({ contentId: "A", contentType: "marketing" })
    ).toEqual({
      content_id: "A",
      content_type: "marketing",
      canonical_route: "/mypage/customer-center/marketing/A",
      legacy_route: "/mypage/notices/A",
    });
  });
});
