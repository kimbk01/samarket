import { describe, expect, it } from "vitest";
import {
  campaignRowHasOfficialSource,
  isLegacyUnboundOfficialCampaign,
  resolveApprovedMarketingLandingRoute,
  validateOfficialCampaignSource,
} from "@/lib/admin/notification-campaigns/campaign-source-authority";

describe("campaign source authority — CASE C blocked", () => {
  it("NOTICE requires content bind", () => {
    expect(
      validateOfficialCampaignSource({
        campaign_type: "notice",
        title_body_only: true,
      } as never).ok
    ).toBe(false);
    const reject = validateOfficialCampaignSource({
      campaign_type: "notice",
    });
    expect(reject.ok).toBe(false);
    if (!reject.ok) expect(reject.error).toBe("notice_content_required");

    const pass = validateOfficialCampaignSource({
      campaign_type: "notice",
      app_notice_id: "a8c5996e-3259-4622-810e-679597987cd8",
      content_type: "notice",
    });
    expect(pass.ok).toBe(true);
    if (pass.ok) {
      expect(pass.mode).toBe("content_bound");
      expect(pass.canonical_route).toContain("/mypage/customer-center/notice/");
    }
  });

  it("SYSTEM bulletin requires content bind", () => {
    const reject = validateOfficialCampaignSource({ campaign_type: "system" });
    expect(reject.ok).toBe(false);
    if (!reject.ok) expect(reject.error).toBe("system_bulletin_content_required");

    const pass = validateOfficialCampaignSource({
      campaign_type: "system",
      app_notice_id: "9f1ca605-04b1-4a16-9fb9-45712cb7fc8c",
      content_type: "system",
    });
    expect(pass.ok).toBe(true);
    if (pass.ok) expect(pass.canonical_route).toContain("/mypage/customer-center/system/");
  });

  it("MARKETING allows content OR approved landing; rejects bare", () => {
    expect(validateOfficialCampaignSource({ campaign_type: "marketing" }).ok).toBe(false);
    expect(
      validateOfficialCampaignSource({
        campaign_type: "marketing",
        deeplink_url: "/notifications",
      }).ok
    ).toBe(false);

    const landing = validateOfficialCampaignSource({
      campaign_type: "marketing",
      deeplink_url: "/market",
    });
    expect(landing.ok).toBe(true);
    if (landing.ok) {
      expect(landing.mode).toBe("approved_landing");
      expect(landing.approved_landing).toBe("/market");
    }

    const content = validateOfficialCampaignSource({
      campaign_type: "marketing",
      app_notice_id: "aba6335a-9e51-4841-8a9c-6a140ccc6575",
      content_type: "marketing",
    });
    expect(content.ok).toBe(true);
  });

  it("resolveApprovedMarketingLandingRoute rejects bare notifications", () => {
    expect(resolveApprovedMarketingLandingRoute("/notifications", null, null)).toBeNull();
    expect(resolveApprovedMarketingLandingRoute("/post/abc", null, null)).toBe("/post/abc");
  });

  it("legacy unbound detection", () => {
    expect(
      isLegacyUnboundOfficialCampaign({
        type: "notice",
        target_payload: {},
      })
    ).toBe(true);
    expect(
      campaignRowHasOfficialSource({
        type: "notice",
        target_payload: {},
      })
    ).toBe(false);
    expect(
      campaignRowHasOfficialSource({
        type: "notice",
        target_payload: {
          appNoticeId: "a8c5996e-3259-4622-810e-679597987cd8",
          content_id: "a8c5996e-3259-4622-810e-679597987cd8",
          content_type: "notice",
        },
      })
    ).toBe(true);
  });
});
