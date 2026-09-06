import { describe, expect, it } from "vitest";
import type { AdsActionItem } from "@/lib/admin/ads-control-plane/types";
import { ADS_FEEDBACK } from "@/lib/admin/ads-exposure/action-feedback";
import {
  adsShellKindLabel,
  filterShellRowsByProductFamily,
  filterShellRowsByTab,
  normalizeAdsShellStatus,
  resolveShellPlacementKey,
  toAdsShellListRow,
} from "@/lib/admin/ads-exposure/shell-row";

function item(partial: Partial<AdsActionItem>): AdsActionItem {
  return {
    id: "delivery_cam:1",
    domain: "delivery",
    product: "banner",
    entity: "execution",
    applicantLabel: "한식당",
    storeId: "store-1",
    memberId: null,
    creativeHint: null,
    placementHint: "STORES_HOME_HERO",
    amountLabel: "₩50,000",
    currency: "CASH",
    status: "ACTIVE",
    whyActionable: null,
    paymentLabel: "결제 완료",
    periodLabel: "9/1–9/14",
    remainingLabel: null,
    exposureLabel: "노출 중",
    eligibility: null,
    ageHours: null,
    at: "2026-09-07T00:00:00.000Z",
    source: "test",
    href: "/admin/delivery-ads/manage/1",
    statementHref: null,
    financeHref: null,
    memberHref: null,
    ...partial,
  };
}

describe("normalizeAdsShellStatus", () => {
  it("maps raw + exposure labels into shell tabs", () => {
    expect(normalizeAdsShellStatus("PENDING_REVIEW")).toBe("pending");
    expect(normalizeAdsShellStatus("ACTIVE", "노출 중")).toBe("live");
    expect(normalizeAdsShellStatus("APPROVED", null, "예약")).toBe("scheduled");
    expect(normalizeAdsShellStatus("REJECTED")).toBe("rejected");
  });
});

describe("resolveShellPlacementKey / toAdsShellListRow", () => {
  it("uses feed_boost / community_top_pin for promote domains", () => {
    expect(
      resolveShellPlacementKey({
        domain: "trade_promote",
        product: "boost",
        placementHint: null,
      })
    ).toBe("feed_boost");
    expect(
      resolveShellPlacementKey({
        domain: "community_promote",
        product: "boost",
        placementHint: null,
      })
    ).toBe("community_top_pin");
  });

  it("defaults popup placement to GLOBAL", () => {
    expect(
      resolveShellPlacementKey({
        domain: "popup",
        product: "platform_popup",
        placementHint: null,
      })
    ).toBe("GLOBAL");
    expect(
      resolveShellPlacementKey({
        domain: "popup",
        product: "platform_popup",
        placementHint: "DELIVERY",
      })
    ).toBe("DELIVERY");
  });

  it("projects human placement and live href for HERO banner", () => {
    const row = toAdsShellListRow(item({}), true);
    expect(row.kindLabel).toBe("배달 배너");
    expect(row.placementLabel).toContain("상단 배너");
    expect(row.statusTab).toBe("live");
    expect(row.liveHref).toBe("/stores");
    expect(row.memberOrStore).toBe("한식당");
  });
});

describe("adsShellKindLabel + filters", () => {
  it("labels promote / sponsored families", () => {
    expect(adsShellKindLabel("community_promote", "x", true)).toBe("게시물 상위노출");
    expect(adsShellKindLabel("delivery", "store_sponsored", true)).toBe("매장 상위홍보");
  });

  it("filters by status tab and product family", () => {
    const rows = [
      toAdsShellListRow(item({ id: "a", status: "ACTIVE", exposureLabel: "노출 중" }), true),
      toAdsShellListRow(
        item({
          id: "b",
          domain: "trade_promote",
          product: "boost",
          status: "PENDING_REVIEW",
          placementHint: null,
          storeId: null,
          memberId: "m1",
          applicantLabel: "회원A",
        }),
        true
      ),
      toAdsShellListRow(
        item({
          id: "c",
          domain: "popup",
          product: "popup",
          status: "REJECTED",
          placementHint: "GLOBAL",
        }),
        true
      ),
    ];
    expect(filterShellRowsByTab(rows, "pending").map((r) => r.id)).toEqual(["b"]);
    expect(filterShellRowsByProductFamily(rows, "promote").map((r) => r.id)).toEqual(["b"]);
    expect(filterShellRowsByProductFamily(rows, "popup").map((r) => r.id)).toEqual(["c"]);
    expect(filterShellRowsByProductFamily(rows, "banner").map((r) => r.id)).toEqual(["a"]);
  });
});

describe("ADS_FEEDBACK Owner LOCK copy", () => {
  it("uses Owner capacity / order language", () => {
    expect(ADS_FEEDBACK.capacityFull.ko).toBe(
      "선택한 기간에는 이 광고 위치의 예약이 가득 찼습니다."
    );
    expect(ADS_FEEDBACK.orderSaved.ko).toBe("배너 순서를 변경했습니다.");
    expect(ADS_FEEDBACK.approved.ko).toBe("광고를 승인했습니다.");
  });
});
