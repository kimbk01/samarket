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
import { projectPromoteOrderToActionItem } from "@/lib/admin/ads-control-plane/project-family-rows";

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
    const row = toAdsShellListRow(
      item({
        runtimeDisplayStatus: "live_now",
        operatingStatusLabel: "노출 중",
      }),
      true
    );
    expect(row.kindLabel).toBe("배달 홈 상단 배너");
    expect(row.placementLabel).toContain("상단 배너");
    expect(row.statusTab).toBe("live");
    expect(row.applicationStatusLabel).toBe("—");
    expect(row.campaignStatusLabel).toBe("노출 중");
    expect(row.runtimeExposureStatusLabel).toBe("현재 노출 중");
    expect(row.liveHref).toBe("/stores");
    expect(row.memberOrStore).toBe("매장 store-1");
  });

  it("keeps popup target separate when creative is a URL", () => {
    const row = toAdsShellListRow(
      item({
        domain: "popup",
        product: "platform_popup",
        applicantLabel: "Admin 직접 등록",
        storeId: null,
        memberId: null,
        sourceKind: "admin_direct",
        title: "9월 팝업",
        placementHint: "GLOBAL",
        creativeHint: "https://cdn.example.com/popup.webp",
        creativeImageUrl: "https://cdn.example.com/popup.webp",
        runtimeDisplayStatus: "eligible_waiting",
        paymentLabel: "결제 없음",
        previewHref: "/admin/platform-popup/1?focus=preview",
      }),
      true
    );
    expect(row.targetLabel).toBe("전체 서비스");
    expect(row.placementLabel).toBe("전체 서비스 > Popup");
    expect(row.targetLabel).not.toBe(row.placementLabel);
    expect(row.creativeImageUrl).toContain("popup.webp");
    expect(row.statusTab).toBe("waiting");
    expect(row.statusLabel).toBe("노출 중");
    expect(row.runtimeExposureStatusLabel).toBe("노출 대기");
    expect(row.memberOrStore).toBe("—");
    expect(row.paymentLabel).toBe("결제 없음");
    expect(row.previewHref).not.toBe(row.href);
  });

  it("does not count draft/incomplete as pending", () => {
    const row = toAdsShellListRow(
      item({
        domain: "popup",
        product: "platform_popup",
        status: "임시저장",
        storeId: null,
        memberId: null,
        sourceKind: "admin_direct",
        runtimeDisplayStatus: "draft",
        completenessClass: "draft_ready",
        paymentLabel: "결제 없음",
      }),
      true
    );
    expect(row.statusTab).toBe("incomplete");
  });
});

describe("adsShellKindLabel + filters", () => {
  it("labels promote / sponsored families", () => {
    expect(adsShellKindLabel("community_promote", "x", true)).toBe("Community 상위노출");
    expect(adsShellKindLabel("delivery", "store_sponsored", true)).toBe("배달 매장 홍보");
  });

  it("filters by status tab and product family", () => {
    const rows = [
      toAdsShellListRow(
        item({
          id: "a",
          status: "ACTIVE",
          exposureLabel: "노출 중",
          runtimeDisplayStatus: "live_now",
        }),
        true
      ),
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
          runtimeDisplayStatus: "pending",
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
          runtimeDisplayStatus: "rejected",
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

describe("Boost shell runtime — never Pre-approval / 승인 전", () => {
  const forbidden = [/Pre-approval/i, /승인\s*전/, /확인중/, /심사중/, /Pending approval/i];

  function assertBoostRuntime(label: string) {
    for (const re of forbidden) {
      expect(label).not.toMatch(re);
    }
  }

  it("Community Boost + legacy entity=application + mode=boosts uses operational runtime", () => {
    const live = toAdsShellListRow(
      item({
        id: "community_promo:kkk",
        domain: "community_promote",
        product: "community_promote_7",
        entity: "application",
        sourceKind: "member",
        storeId: null,
        memberId: "83ce3d18-aaaa",
        applicantLabel: "Kkk",
        title: "Kkk",
        status: "노출 중",
        exposureLabel: "노출 중",
        runtimeDisplayStatus: "live_now",
        periodLabel: "2026-09-01 → 2026-09-10",
      }),
      false,
      "boosts"
    );
    expect(live.runtimeExposureStatusLabel).toBe("Live now");
    assertBoostRuntime(live.runtimeExposureStatusLabel);

    const legacyPending = toAdsShellListRow(
      item({
        id: "community_promo:legacy",
        domain: "community_promote",
        product: "community_promote_3",
        entity: "application",
        sourceKind: "member",
        storeId: null,
        memberId: "m1",
        applicantLabel: "Legacy",
        status: "승인 대기",
        exposureLabel: "승인 대기",
        periodLabel: null,
      }),
      true,
      "boosts"
    );
    expect(legacyPending.runtimeExposureStatusLabel).toBe("비노출");
    assertBoostRuntime(legacyPending.runtimeExposureStatusLabel);
    expect(legacyPending.applicationStatusLabel).toBe("—");
  });

  it("Trade Boost + entity=application never uses approval runtime on boosts/all", () => {
    const paused = toAdsShellListRow(
      item({
        id: "trade_promo:1",
        domain: "trade_promote",
        product: "trade_promote_7",
        entity: "application",
        sourceKind: "member",
        storeId: null,
        memberId: "m2",
        status: "일시중지",
        exposureLabel: "일시중지",
        runtimeDisplayStatus: "paused",
      }),
      true,
      "boosts"
    );
    expect(paused.runtimeExposureStatusLabel).toBe("제재 중");
    assertBoostRuntime(paused.runtimeExposureStatusLabel);

    const onAll = toAdsShellListRow(
      item({
        id: "trade_promo:2",
        domain: "trade_promote",
        product: "trade_promote_7",
        entity: "application",
        sourceKind: "member",
        storeId: null,
        memberId: "m2",
        status: "예약",
        exposureLabel: "예약",
        runtimeDisplayStatus: "scheduled",
      }),
      true,
      "all"
    );
    expect(onAll.runtimeExposureStatusLabel).toBe("예약");
    assertBoostRuntime(onAll.runtimeExposureStatusLabel);
  });

  it("Kkk-shaped ended Boost: period not 기간 정보 오류; runtime stays Ended", () => {
    const action = projectPromoteOrderToActionItem({
      id: "de06f845-c12a-43a1-8b34-e7ec75afa388",
      user_id: "83ce3d18-5340-4ed9-8834-77e404d3bedb",
      domain: "community",
      order_status: "ended",
      product_id: "community_promote_3",
      point_cost: 10000,
      target_title: "Kkk",
      start_at: "2026-08-10T13:40:34.73051+00:00",
      end_at: "1970-01-01T00:00:00+00:00",
      duration_days: 3,
      created_at: "2026-08-10T13:40:34.73051+00:00",
    });
    expect(action.periodLabel).toBeTruthy();
    expect(action.periodLabel).not.toMatch(/기간 정보 오류|1970/);
    expect(action.remainingLabel).toBe("종료됨");

    const row = toAdsShellListRow(action, true, "boosts");
    expect(row.runtimeExposureStatusLabel).toBe("종료");
    assertBoostRuntime(row.runtimeExposureStatusLabel);
    expect(row.periodLabel).not.toMatch(/기간 정보 오류|1970/);
    expect(row.remainingLabel).not.toMatch(/기간 정보 오류|1970/);
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
