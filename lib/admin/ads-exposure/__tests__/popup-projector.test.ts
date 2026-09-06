import { describe, expect, it } from "vitest";
import { projectPopupCampaignToActionItem } from "@/lib/admin/ads-control-plane/project-family-rows";
import type { PlatformPopupAdminListItem } from "@/lib/platform-popup/admin-campaign-loader";

const campaign: PlatformPopupAdminListItem = {
  id: "12345678-abcd",
  name: "새 팝업 캠페인",
  status: "active",
  approvalStatus: "approved",
  priority: 100,
  startAt: "2026-09-01T00:00:00.000Z",
  endAt: "2026-09-30T00:00:00.000Z",
  timezone: "Asia/Manila",
  suppressionMode: "CLOSE",
  suppressionDurationSeconds: null,
  ctaType: "internal_page",
  ctaTarget: "/stores",
  externalUrl: null,
  surfaces: ["GLOBAL"],
  ownerStoreId: null,
  ownerRequestId: null,
  updatedAt: "2026-09-07T00:00:00.000Z",
  creativeThumbUrl: "https://cdn.example.com/popup.webp",
};

describe("popup campaign action item", () => {
  it("separates admin applicant, operational title, placement and creative", () => {
    const item = projectPopupCampaignToActionItem(campaign, {
      winnerIds: new Set(["12345678-abcd"]),
    });
    expect(item.applicantLabel).toBe("Admin 직접 등록");
    expect(item.title).toBe("팝업 · 09/07 · 12345678");
    expect(item.placementHint).toBe("GLOBAL");
    expect(item.creativeImageUrl).toBe(campaign.creativeThumbUrl);
    expect(item.runtimeDisplayStatus).toBe("live_now");
    expect(item.sourceKind).toBe("admin_direct");
  });
});
