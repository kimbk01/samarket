import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  adsWorkspacePurposeCopy,
  channelSummaryFromDistributionRows,
  eventDistributionHref,
  eventIsContentDestinationCopy,
  inlineSharesPlacementCopy,
  placementInventoryPurposeCopy,
  placementSourceBadgeLabel,
  popupApprovalStatusLabel,
  popupEditHref,
  promotionWorkspacePurposeCopy,
  resolvePopupBenefitOperationalHint,
  resolvePopupListCompositionLabel,
} from "@/lib/admin/promotion-ownership-visibility";
import {
  assertApproveIsNotPublishOrSend,
  assertSaveIsNotSend,
  PROMOTION_ADMIN_ACTION_META,
  promotionAdminActionLabel,
} from "@/lib/admin/promotion-operation-actions";
import { projectFeedPoolInventories } from "@/lib/admin/ads-exposure/placement-inventory";
import type { FeedAdCampaignView } from "@/lib/ads/feed-ad-placement";
import type { PromotionDistributionRow } from "@/lib/platform-promotion-distribution/types";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(`${ROOT}/${path}`, "utf8");

function campaign(
  partial: Partial<FeedAdCampaignView> & Pick<FeedAdCampaignView, "id" | "placement" | "status">
): FeedAdCampaignView {
  return {
    name: partial.name ?? "Campaign",
    domain: partial.domain ?? "trade",
    targetCategoryId: null,
    targetTopicSlug: null,
    priority: 100,
    startAt: null,
    endAt: null,
    destinationType: "internal_page",
    destinationId: "",
    destinationUrl: "",
    source: partial.source ?? "ADMIN_DIRECT",
    requestId: null,
    slides: [],
    ...partial,
  };
}

function dist(
  partial: Partial<PromotionDistributionRow> &
    Pick<PromotionDistributionRow, "id" | "channel" | "enabled">
): PromotionDistributionRow {
  return {
    contentType: "platform_event",
    contentId: "evt-1",
    status: "configured",
    channelRefType: null,
    channelRefId: null,
    config: {},
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("Phase 1 promotion ownership visibility", () => {
  it("workspace purpose copies distinguish Ads vs Promotion", () => {
    expect(adsWorkspacePurposeCopy("ko")).toContain("유료 광고");
    expect(promotionWorkspacePurposeCopy("ko")).toContain("이벤트 콘텐츠");
    expect(placementInventoryPurposeCopy("ko")).toContain("인라인 프로모션");
    expect(eventIsContentDestinationCopy("ko")).toContain("노출 채널");
    expect(inlineSharesPlacementCopy("ko")).toContain("노출 위치 현황");
  });

  it("Popup composition labels distinguish Artwork vs Card despite shared center_modal", () => {
    expect(
      resolvePopupListCompositionLabel({
        presentationType: "center_modal",
        creativeMode: "artwork",
        lang: "ko",
      })
    ).toBe("아트워크 팝업");
    expect(
      resolvePopupListCompositionLabel({
        presentationType: "center_modal",
        creativeMode: "card",
        lang: "ko",
      })
    ).toBe("프로모션 카드");
    expect(
      resolvePopupListCompositionLabel({
        presentationType: "bottom_sheet",
        creativeMode: "card",
        lang: "ko",
      })
    ).toBe("하단 프로모션 시트");
    expect(
      resolvePopupListCompositionLabel({
        presentationType: "benefit_dialog",
        creativeMode: "card",
        lang: "ko",
      })
    ).toBe("혜택/쿠폰 다이얼로그");
  });

  it("Benefit dependency hints without collapsing to Card", () => {
    expect(
      resolvePopupBenefitOperationalHint({
        presentationType: "benefit_dialog",
        creativeMode: "card",
        linkedEventId: null,
      })
    ).toBe("event_link_needed");
    expect(
      resolvePopupBenefitOperationalHint({
        presentationType: "benefit_dialog",
        creativeMode: "card",
        linkedEventId: "evt",
        linkedEventHasBenefit: false,
      })
    ).toBe("benefit_info_needed");
    expect(
      resolvePopupBenefitOperationalHint({
        presentationType: "benefit_dialog",
        creativeMode: "card",
        linkedEventId: "evt",
        linkedEventHasBenefit: true,
      })
    ).toBe("none");
  });

  it("channel summary prefers Inline/Hero labels from Dist rows", () => {
    const summary = channelSummaryFromDistributionRows(
      [
        dist({
          id: "1",
          channel: "popup",
          enabled: true,
        }),
        dist({
          id: "2",
          channel: "banner",
          enabled: true,
          config: { presentation: "INLINE_BANNER", placement: "TRADE_HOME" },
        }),
        dist({
          id: "3",
          channel: "push",
          enabled: true,
        }),
        dist({
          id: "4",
          channel: "bell",
          enabled: false,
        }),
      ],
      "ko"
    );
    expect(summary).toContain("팝업");
    expect(summary).toContain("인라인 배너");
    expect(summary).toContain("Push");
    expect(summary).not.toContain("앱 알림");
  });

  it("placement source badges and Event Dist deep-links use IDs", () => {
    expect(placementSourceBadgeLabel("event_promotion", "ko")).toBe("이벤트 프로모션");
    expect(placementSourceBadgeLabel("paid", "ko")).toBe("유료 광고");
    expect(eventDistributionHref("abc-123")).toBe(
      "/admin/platform-events/abc-123#distribution"
    );
    expect(popupEditHref("camp-9")).toBe("/admin/platform-popup/camp-9");
  });

  it("projectFeedPoolInventories marks Event promotion via Dist map (not title)", () => {
    const pools = projectFeedPoolInventories(
      [
        campaign({
          id: "feed-1",
          placement: "TRADE_HOME",
          status: "active",
          name: "Event banner · QA",
          source: "ADMIN_DIRECT",
        }),
        campaign({
          id: "feed-2",
          placement: "TRADE_HOME",
          status: "active",
          name: "Merchant ad",
          source: "MEMBER_REQUESTED",
        }),
      ],
      new Map([["feed-1", { eventId: "evt-99" }]])
    );
    const trade = pools.find((p) => p.placementKey === "TRADE_HOME")!;
    const promo = trade.campaigns.find((c) => c.id === "feed-1")!;
    const paid = trade.campaigns.find((c) => c.id === "feed-2")!;
    expect(promo.ownershipKind).toBe("event_promotion");
    expect(promo.manageHref).toBe("/admin/platform-events/evt-99#distribution");
    expect(promo.eventId).toBe("evt-99");
    expect(paid.ownershipKind).toBe("paid");
    expect(paid.manageHref).toBeNull();
  });

  it("action vocabulary keeps SAVE ≠ SEND and APPROVE ≠ ACTIVATE", () => {
    expect(assertSaveIsNotSend()).toBe(true);
    expect(assertApproveIsNotPublishOrSend()).toBe(true);
    expect(promotionAdminActionLabel("SAVE", "ko")).toBe("저장");
    expect(promotionAdminActionLabel("ACTIVATE", "ko")).toBe("노출 시작");
    expect(promotionAdminActionLabel("PAUSE_STOP", "ko")).toBe("노출 중지");
    expect(promotionAdminActionLabel("SEND_PUSH", "ko")).toBe("Push 보내기");
    expect(PROMOTION_ADMIN_ACTION_META.ACTIVATE.customerVisible).toBe(true);
    expect(popupApprovalStatusLabel("not_submitted", "ko")).toBe("작성 중");
  });

  it("UI surfaces keep single canonical editors (no new writers)", () => {
    const bannerClient = read(
      "components/admin/platform-promotion/AdminPromotionBannerListClient.tsx"
    );
    const popupList = read("components/admin/platform-popup/AdminPlatformPopupListPage.tsx");
    const notif = read(
      "components/admin/platform-promotion/AdminPromotionNotificationsHubClient.tsx"
    );
    const placements = read("components/admin/ads/AdminAdsPlacementManagementView.tsx");
    expect(bannerClient).toContain("eventDistributionHref");
    expect(bannerClient).toContain("PLACEMENTS_INVENTORY_HREF");
    expect(bannerClient).not.toContain("method: \"POST\"");
    expect(popupList).toContain("resolvePopupListCompositionLabel");
    expect(popupList).not.toContain("item.presentationType ||");
    expect(notif).toContain('data-admin-promotion-channel="push"');
    expect(notif).toContain('data-admin-promotion-channel="bell"');
    expect(notif).toContain("SEND_PUSH");
    expect(placements).toContain("data-placement-source-badge");
    expect(placements).toContain("event-dist");
  });

  it("does not add navigation to trade-post-ads in Phase 1", () => {
    const landing = read(
      "components/admin/platform-promotion/AdminPromotionLandingClient.tsx"
    );
    const banner = read(
      "components/admin/platform-promotion/AdminPromotionBannerListClient.tsx"
    );
    expect(landing).not.toContain("/admin/trade-post-ads");
    expect(banner).not.toContain("/admin/trade-post-ads");
  });
});
