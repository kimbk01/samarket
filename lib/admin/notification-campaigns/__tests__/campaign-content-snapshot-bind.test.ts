import { describe, expect, it } from "vitest";
import { buildCampaignContentSnapshot } from "@/lib/admin/notification-campaigns/campaign-content-snapshot";

describe("buildCampaignContentSnapshot content bind", () => {
  it("preserves content bind when re-wrapping an existing snapshot", () => {
    const first = buildCampaignContentSnapshot({
      title: "short",
      body: "delivery",
      type: "marketing",
      channel: "push_and_in_app",
      target_type: "all",
      deeplink_url: null,
      web_url: null,
      push_image_url: null,
      in_app_image_url: null,
      target_payload: {
        appNoticeId: "cid-1",
        content_id: "cid-1",
        content_type: "marketing",
        canonical_route: "/mypage/customer-center/marketing/cid-1",
      },
    });
    expect(first.content_id).toBe("cid-1");
    expect(first.canonical_route).toBe("/mypage/customer-center/marketing/cid-1");

    const second = buildCampaignContentSnapshot(first);
    expect(second.content_id).toBe("cid-1");
    expect(second.content_type).toBe("marketing");
    expect(second.canonical_route).toBe("/mypage/customer-center/marketing/cid-1");
    expect(second.title).toBe("short");
    expect(second.body).toBe("delivery");
  });
});
