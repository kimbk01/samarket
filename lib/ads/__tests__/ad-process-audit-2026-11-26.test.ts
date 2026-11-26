/**
 * 광고 프로세스 감사 (2026-11-26 · docs/audit/ad-process-defects-design-2026-11-26.md) — 새 단일 정의 함수 시험.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/messages";
import { promotionPurchaseErrorKey } from "@/lib/points/promotion-purchase-error";
import { memberPromotionProductTitle } from "@/lib/points/promotion-product-title";
import { feedAdMemberErrorKey } from "@/lib/ads/feed-ad-member-error-key";
import { feedAdProductTitle } from "@/lib/ads/feed-ad-product-title";
import { boostPauseCause, myBoostOrderStatusKey } from "@/lib/ads/my-ad-tab";
import { ownerAdErrorKey } from "@/lib/stores/advertising/owner-ad-error-copy";
import { ownerAdHistoryActionKey, ownerAdHistoryActorKey } from "@/lib/stores/advertising/owner-ad-history-copy";
import {
  rotateStorePaidAdsForFairExposure,
  STORE_PAID_AD_ROTATION_WINDOW_MS,
} from "@/lib/stores/store-paid-ad-exposure";
import { isOwnerSellableDeliveryAdPlacement } from "@/lib/stores/advertising/delivery-ad-owner-sellable";
import {
  __resetPtrRevealAdsForTests,
  __setPtrRevealAdForTests,
  finishPtrRevealExposure,
  notePtrRevealRoute,
  readPtrRevealAd,
} from "@/lib/platform-popup/ptr-reveal-client";
import type { PtrRevealAd } from "@/lib/platform-popup/ptr-reveal-payload";

describe("TB-02·FB-07 상품 이름 = 키 + DB 기간", () => {
  it("상위노출·배너 이름이 기간을 따라간다 (ko·en)", () => {
    expect(memberPromotionProductTitle("ko", { domain: "trade", durationDays: 9 })).toBe("거래 상위노출 9일");
    expect(memberPromotionProductTitle("en", { domain: "community", durationDays: 2 })).toBe("Community top exposure · 2 days");
    expect(feedAdProductTitle("ko", { domain: "trade", durationDays: 5 })).toBe("거래 배너 5일");
    expect(feedAdProductTitle("ko", { domain: "community", durationDays: 3 })).toBe("커뮤니티 배너 3일");
  });
});

describe("TB-05·FB-04·SA-04 실패 이유 → 문구 (모르는 코드는 일반 문구, 원문 없음)", () => {
  it("상위노출", () => {
    expect(promotionPurchaseErrorKey({ error: "target_unavailable" })).toBe("promo_err_target_unavailable");
    expect(promotionPurchaseErrorKey({ error: "price_changed" })).toBe("promo_price_changed");
    expect(promotionPurchaseErrorKey({ error: "x", code: "insufficient_balance" })).toBe("points_ui_insufficient");
    expect(promotionPurchaseErrorKey({ error: "boom" })).toBe("promo_sheet_purchase_failed");
  });
  it("회원 배너", () => {
    expect(feedAdMemberErrorKey("price_changed")).toBe("promo_price_changed");
    expect(feedAdMemberErrorKey("destination_not_mine")).toBe("feed_ad_req_dest_not_mine");
    expect(feedAdMemberErrorKey("https_required")).toBe("feed_ad_req_need_https");
    expect(feedAdMemberErrorKey("whatever")).toBe("points_ui_request_failed");
  });
  it("매장 광고 — 견적 세부 코드 우선", () => {
    expect(ownerAdErrorKey("quote_unavailable", "placement_not_sellable")).toBe("owner_ads_error_placement_unavailable");
    expect(ownerAdErrorKey("placement_not_sellable")).toBe("owner_ads_error_placement_unavailable");
    expect(ownerAdErrorKey("capacity_full")).toBe("owner_ads_error_capacity_full");
    expect(ownerAdErrorKey("capacity_check_failed")).toBe("owner_ads_error_check_failed");
    expect(ownerAdErrorKey("home_ads_disabled")).toBe("owner_ads_error_placement_unavailable");
    expect(ownerAdErrorKey(null)).toBeNull();
    expect(ownerAdErrorKey("nope")).toBe("owner_ads_error_generic");
  });
});

describe("TB-06 정지 원인 단일 판정", () => {
  it("커뮤니티 글 숨김(system)·거래 글 숨김 = 내 글 숨김, 관리자 = 운영자", () => {
    expect(boostPauseCause("system")).toBe("own_hidden");
    expect(boostPauseCause("listing_owner_hidden")).toBe("own_hidden");
    expect(boostPauseCause("listing_admin_hidden")).toBe("review");
    expect(boostPauseCause("admin")).toBe("staff");
    expect(boostPauseCause(null)).toBe("staff");
    expect(myBoostOrderStatusKey({ orderStatus: "paused", pausedBy: "system" })).toBe("mypage_oa_ads_boost_status_paused_hidden");
    expect(
      myBoostOrderStatusKey({ orderStatus: "ended", endAt: "2020-01-01T00:00:00Z", endReasonCode: "post_owner_deleted" })
    ).toBe("mypage_oa_ads_boost_status_ended_deleted");
  });
});

describe("TB-01 결제 전 노출 규칙 고지", () => {
  it("위쪽 1자리 · 최근 결제 · 뒤 결제 시 제자리", () => {
    expect(translate("ko", "trade_ad_where_boost")).toContain("1자리");
    expect(translate("ko", "trade_ad_where_boost")).toContain("다른 글이 결제하면");
  });
});

describe("SA-03 홍보 노출 순환", () => {
  it("10분 창마다 시작 위치가 한 칸씩 돈다 · 같은 창 안에서는 같다", () => {
    const rows = ["a", "b", "c"];
    const w = STORE_PAID_AD_ROTATION_WINDOW_MS;
    expect(rotateStorePaidAdsForFairExposure(rows, 0)).toEqual(["a", "b", "c"]);
    expect(rotateStorePaidAdsForFairExposure(rows, w - 1)).toEqual(["a", "b", "c"]);
    expect(rotateStorePaidAdsForFairExposure(rows, w)).toEqual(["b", "c", "a"]);
    expect(rotateStorePaidAdsForFairExposure(rows, 2 * w)).toEqual(["c", "a", "b"]);
    expect(rotateStorePaidAdsForFairExposure(["x"], 5 * w)).toEqual(["x"]);
  });
});

describe("SA-01·E 사장님 판매 지면 판정 (요금 안내와 같은 함수)", () => {
  const p = (inventoryKey: string, sellable = true) => ({ productKind: "store_sponsored" as const, inventoryKey, sellable });
  const on = { homeFeedSellable: true, categoryFeedSellable: true };
  it("홈 홍보는 노출 자리가 꺼지면 판매 안 함 · 검색 상단은 늘 제외", () => {
    expect(isOwnerSellableDeliveryAdPlacement(p("STORES_HOME_FEED"), "store_sponsored", { ...on, homeFeedSellable: false })).toBe(false);
    expect(isOwnerSellableDeliveryAdPlacement(p("STORES_HOME_FEED"), "store_sponsored", on)).toBe(true);
    expect(isOwnerSellableDeliveryAdPlacement(p("STORES_CATEGORY_FEED"), "store_sponsored", { ...on, homeFeedSellable: false })).toBe(true);
    expect(isOwnerSellableDeliveryAdPlacement(p("STORES_CATEGORY_FEED", false), "store_sponsored", on)).toBe(false);
    expect(
      isOwnerSellableDeliveryAdPlacement({ productKind: "banner", inventoryKey: "STORES_SEARCH_TOP", sellable: true }, "banner", on)
    ).toBe(false);
  });
  it("R-23: 업종 광고가 꺼져 있으면 업종 목록 판매 안 함 (홈 홍보와 별개)", () => {
    expect(isOwnerSellableDeliveryAdPlacement(p("STORES_CATEGORY_FEED"), "store_sponsored", { ...on, categoryFeedSellable: false })).toBe(false);
    expect(isOwnerSellableDeliveryAdPlacement(p("STORES_HOME_FEED"), "store_sponsored", { ...on, categoryFeedSellable: false })).toBe(true);
  });
});

describe("SA-11 이력 문구", () => {
  it("운영 DB 동작 값을 이름으로", () => {
    expect(ownerAdHistoryActionKey("owner_sponsored_create_draft")).toBe("owner_ads_history_act_draft");
    expect(ownerAdHistoryActionKey("owner_banner_submit")).toBe("owner_ads_history_act_submitted");
    expect(ownerAdHistoryActionKey("ended_admin")).toBe("owner_ads_history_act_ended");
    expect(ownerAdHistoryActionKey("system_activated")).toBe("owner_ads_history_act_started");
    expect(ownerAdHistoryActionKey("qa_orphan_archived")).toBe("owner_ads_history_act_other");
    expect(ownerAdHistoryActorKey("admin")).toBe("owner_ads_history_by_staff");
    expect(ownerAdHistoryActorKey("")).toBeNull();
  });
});

describe("PT-01 「기록 없이 닫기」 숨김은 화면 기준", () => {
  const ad: PtrRevealAd = {
    campaignId: "c1",
    surface: "TRADE",
    href: "/market",
    ctaLabel: null,
    title: null,
    frequencyMode: "close_only",
    suppressionDurationSeconds: null,
    timezone: "Asia/Manila",
    bands: { default: { creativeId: "b1", imageUrl: "https://cdn.example/a.webp", altText: "a" }, tablet: null, logo: null },
  };
  beforeEach(() => __resetPtrRevealAdsForTests());

  it("PTR 없는 화면을 다녀오면 다시 나온다", () => {
    notePtrRevealRoute("/market");
    __setPtrRevealAdForTests("TRADE", ad);
    expect(readPtrRevealAd("/market", "default")?.campaignId).toBe("c1");
    finishPtrRevealExposure("/market", ad);
    __setPtrRevealAdForTests("TRADE", ad);
    expect(readPtrRevealAd("/market", "default")).toBeNull();
    notePtrRevealRoute("/mypage");
    notePtrRevealRoute("/market");
    expect(readPtrRevealAd("/market", "default")?.campaignId).toBe("c1");
  });

  it("같은 화면에 머무르면 계속 숨김", () => {
    notePtrRevealRoute("/market");
    __setPtrRevealAdForTests("TRADE", ad);
    finishPtrRevealExposure("/market", ad);
    __setPtrRevealAdForTests("TRADE", ad);
    notePtrRevealRoute("/market/");
    expect(readPtrRevealAd("/market", "default")).toBeNull();
  });
});
