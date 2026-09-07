import { describe, expect, it } from "vitest";
import {
  adsShellKindLabel,
  isAdsApprovalQueueRow,
  toAdsShellListRow,
} from "@/lib/admin/ads-exposure/shell-row";
import type { AdsActionItem } from "@/lib/admin/ads-control-plane/types";
import { projectFeedRequestToActionItem } from "@/lib/admin/ads-control-plane/project-family-rows";
import { adsWorkspaceMutationConfirmCopy } from "@/lib/admin/ads-exposure/admin-mutation-confirm-copy";
import { filterWorkspaceActionsByMode } from "@/lib/admin/advertising-workspace/resolve-drawer-actions";

function item(partial: Partial<AdsActionItem>): AdsActionItem {
  return {
    id: "feed:1",
    domain: "feed",
    product: "feed_banner_community",
    entity: "application",
    applicantLabel: "회원 abcd1234",
    storeId: null,
    memberId: "u1",
    creativeHint: "https://cdn.example.com/b.png",
    placementHint: "COMMUNITY_HOME",
    amountLabel: null,
    currency: "POINT",
    status: "확인중",
    whyActionable: null,
    paymentLabel: "포인트",
    periodLabel: "9/1–9/7",
    remainingLabel: null,
    exposureLabel: "아직 노출 안 됨",
    eligibility: null,
    ageHours: 1,
    at: "2026-09-07T00:00:00.000Z",
    source: "feed_ad_requests",
    href: "/admin/feed-ad-requests/1",
    statementHref: null,
    financeHref: null,
    memberHref: null,
    title: "가을 배너",
    creativeImageUrl: "https://cdn.example.com/b.png",
    sourceKind: "member",
    ...partial,
  };
}

describe("CUT R3 approval queue inclusion", () => {
  it("includes member Community/Trade banner and Delivery products only", () => {
    const community = toAdsShellListRow(item({}), true, "applications");
    expect(isAdsApprovalQueueRow(community)).toBe(true);
    expect(community.kindLabel).toBe("[Community] 배너");

    const trade = toAdsShellListRow(
      item({ id: "feed:2", product: "feed_banner_trade" }),
      true,
      "applications"
    );
    expect(isAdsApprovalQueueRow(trade)).toBe(true);
    expect(adsShellKindLabel("feed", "feed_banner_trade", true)).toBe("[거래] 배너");

    const sponsored = toAdsShellListRow(
      item({
        id: "delivery:s1",
        domain: "delivery",
        product: "store_sponsored",
        href: "/admin/delivery-ads/manage/s1",
        sourceKind: "owner",
      }),
      true,
      "applications"
    );
    expect(isAdsApprovalQueueRow(sponsored)).toBe(true);

    const hero = toAdsShellListRow(
      item({
        id: "delivery:b1",
        domain: "delivery",
        product: "banner",
        href: "/admin/delivery-ads/manage/b1",
        sourceKind: "owner",
      }),
      true,
      "applications"
    );
    expect(isAdsApprovalQueueRow(hero)).toBe(true);
  });

  it("excludes boost / admin direct / popup / feed campaign hub rows", () => {
    expect(
      isAdsApprovalQueueRow(
        toAdsShellListRow(
          item({
            id: "boost:1",
            domain: "community_promote",
            product: "boost",
            entity: "execution",
            sourceKind: "member",
          }),
          true,
          "applications"
        )
      )
    ).toBe(false);

    expect(
      isAdsApprovalQueueRow(
        toAdsShellListRow(
          item({
            id: "delivery:d1",
            domain: "delivery",
            product: "banner",
            sourceKind: "admin_direct",
            entity: "application",
          }),
          true,
          "applications"
        )
      )
    ).toBe(false);

    expect(
      isAdsApprovalQueueRow(
        toAdsShellListRow(
          item({
            id: "popup_req:1",
            domain: "popup",
            product: "popup",
            entity: "application",
            sourceKind: "owner",
          }),
          true,
          "applications"
        )
      )
    ).toBe(false);

    expect(
      isAdsApprovalQueueRow(
        toAdsShellListRow(
          item({
            id: "feed_campaign:1",
            domain: "feed",
            product: "feed_banner",
            entity: "application",
            href: "/admin/feed-ads",
          }),
          true,
          "applications"
        )
      )
    ).toBe(false);
  });

  it("feed request projector routes to request detail with domain product + creative", () => {
    const row = projectFeedRequestToActionItem({
      id: "req-1",
      user_id: "user-aaaaaaaa",
      status: "pending_review",
      domain: "community",
      product_id: "feed_banner_community_3",
      target_topic_slug: "food",
      placement: "COMMUNITY_HOME",
      created_at: "2026-09-07T00:00:00.000Z",
      creative_image_url: "https://cdn.example.com/c.png",
    });
    expect(row.href).toBe("/admin/feed-ad-requests/req-1");
    expect(row.product).toBe("feed_banner_community");
    expect(row.creativeImageUrl).toContain("c.png");
    expect(row.title).toBe("food");
    expect(row.sourceKind).toBe("member");
  });

  it("applications list mode exposes no mutation CTAs (review on detail only)", () => {
    expect(
      filterWorkspaceActionsByMode(["approve", "reject", "request_changes"], "applications")
    ).toEqual([]);
  });

  it("reject/hold confirm requires reason; feed has no hold writer in copy matrix", () => {
    const reject = adsWorkspaceMutationConfirmCopy("reject", true, { family: "feed_banner" });
    expect(reject.reasonRequired).toBe(true);
    expect(reject.reasonLabel).toContain("반려");
    expect(reject.body).toContain("해당 신청");

    const hold = adsWorkspaceMutationConfirmCopy("request_changes", true, {
      family: "delivery_banner",
    });
    expect(hold.reasonRequired).toBe(true);
    expect(hold.confirmLabel).toBe("보류");
    expect(hold.reasonLabel).toBe("보류 사유");

    const approve = adsWorkspaceMutationConfirmCopy("approve", true);
    expect(approve.body).toContain("노출 조건");
  });
});
