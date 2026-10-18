import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  classifyCampaignLink,
  validateCampaignLinkInput,
} from "@/lib/admin/notification-campaigns/campaign-link-target";
import {
  resolveCampaignExternalUrl,
  resolveCampaignRouteUrl,
} from "@/lib/admin/notification-campaigns/campaign-types";

const ENV = "NOTIFICATION_CAMPAIGN_EXTERNAL_URL_HOSTS";

describe("ADM-01 campaign link classification", () => {
  let prev: string | undefined;
  beforeEach(() => {
    prev = process.env[ENV];
    delete process.env[ENV];
  });
  afterEach(() => {
    if (prev === undefined) delete process.env[ENV];
    else process.env[ENV] = prev;
  });

  it("relative and DIBAY-host links stay internal (existing campaigns unchanged)", () => {
    expect(classifyCampaignLink("/events/e1")).toEqual({ kind: "internal", path: "/events/e1" });
    expect(classifyCampaignLink("https://samarket.vercel.app/mypage/notices/abc?x=1")).toEqual({
      kind: "internal",
      path: "/mypage/notices/abc?x=1",
    });
    expect(classifyCampaignLink("market")).toEqual({ kind: "internal", path: "/market" });
  });

  it("external host is external and fail-closed without an allowlist", () => {
    expect(classifyCampaignLink("https://partner.example/promo")).toEqual({
      kind: "external",
      url: "https://partner.example/promo",
      allowed: false,
    });
    expect(validateCampaignLinkInput("https://partner.example/promo")).toEqual({
      ok: false,
      error: "external_url_not_allowed",
    });
  });

  it("allowlisted https host is allowed", () => {
    process.env[ENV] = "partner.example, other.example";
    expect(validateCampaignLinkInput("https://partner.example/promo")).toEqual({ ok: true });
    expect(
      resolveCampaignExternalUrl({ deeplink_url: null, web_url: "https://partner.example/promo", target_url: null })
    ).toBe("https://partner.example/promo");
    // The in-app route never becomes the partner path.
    expect(
      resolveCampaignRouteUrl({ deeplink_url: null, web_url: "https://partner.example/market", target_url: null })
    ).toBe("/notifications");
  });

  it.each(["javascript:alert(1)", "http://partner.example/x", "//partner.example/x", "/\\partner.example", "data:text/html,x"])(
    "rejects %j",
    (raw) => {
      process.env[ENV] = "partner.example";
      expect(validateCampaignLinkInput(raw)).toEqual({ ok: false, error: "invalid_campaign_url" });
      expect(resolveCampaignExternalUrl({ deeplink_url: raw, web_url: raw, target_url: raw })).toBeNull();
    }
  );

  it("empty input is valid (no link)", () => {
    expect(validateCampaignLinkInput(null)).toEqual({ ok: true });
    expect(validateCampaignLinkInput("  ")).toEqual({ ok: true });
  });
});
