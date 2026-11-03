import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adShortagePoints, canAffordAd, recommendChargePlanId } from "@/lib/points/ad-shortage";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

describe("광고하기 창 — 부족 포인트 (시안 v3)", () => {
  it("모자란 만큼만 · 충분하면 0", () => {
    expect(adShortagePoints(500, 320)).toBe(180);
    expect(adShortagePoints(8000, 1320)).toBe(6680);
    expect(adShortagePoints(500, 1320)).toBe(0);
    expect(adShortagePoints(500, 500)).toBe(0);
  });
  it("잔액을 모르면 고를 수 없다", () => {
    expect(canAffordAd(500, null)).toBe(false);
    expect(adShortagePoints(500, null)).toBe(500);
    expect(canAffordAd(500, 500)).toBe(true);
  });
});

describe("충전 상품 추천 — 부족분을 채우는 가장 작은 상품 (어드민 충전 상품 값)", () => {
  const plans = [
    { id: "p10000", paymentAmount: 10000, pointAmount: 10000, bonusPointAmount: 1000 },
    { id: "p1000", paymentAmount: 1000, pointAmount: 1000, bonusPointAmount: 0 },
    { id: "p5000", paymentAmount: 5000, pointAmount: 5000, bonusPointAmount: 250 },
  ];
  it("180P 부족 → 1,000P", () => expect(recommendChargePlanId(plans, 180)).toBe("p1000"));
  it("5,200P 부족 → 5,250P(보너스 포함)", () => expect(recommendChargePlanId(plans, 5200)).toBe("p5000"));
  it("모두 모자라면 가장 큰 상품", () => expect(recommendChargePlanId(plans, 50000)).toBe("p10000"));
  it("상품 없음 → null", () => expect(recommendChargePlanId([], 100)).toBeNull());
});

describe("광고하기 창 계약", () => {
  const sheet = read("components/trade/seller-ad/TradeAdQuickSheet.tsx");
  it("모자란 상품은 막고 줄마다 부족 표시 · 가격은 서버 카탈로그", () => {
    expect(sheet).toContain("disabled={!enabled}");
    expect(sheet).toContain("trade_ad_short");
    expect(sheet).toContain("/api/me/points/promotion-orders?catalog=1&domain=trade");
    expect(sheet).toContain("/api/me/feed-ad-requests?domain=trade");
  });
  it("결제는 화면 금액을 보내고 price_changed 면 다시 읽는다", () => {
    expect(sheet).toContain("expectedPointCost: selected.pointCost");
    expect(sheet).toContain('err === "price_changed"');
  });
  it("버튼: 고객 문의(보조·왼쪽) · 시작/충전(주·오른쪽) · 광고 창에 ₱·계좌 없음", () => {
    expect(sheet.indexOf("trade_ad_support")).toBeLessThan(sheet.indexOf('t("trade_ad_charge")'));
    expect(sheet).toContain('category: "AD", referenceType: "TRADE_POST"');
    expect(sheet).not.toMatch(/₱|points_ui_deposit_account/);
  });
  it("충전 화면은 부족분·돌아갈 곳을 받는다 (앱 안 경로만)", () => {
    const page = read("app/(main)/mypage/points/charge/page.tsx");
    expect(page).toContain('searchParams.get("need")');
    expect(page).toContain('sanitizeNextPath(searchParams.get("returnTo"))');
    expect(read("components/points/PointChargeForm.tsx")).not.toContain('"bank_transfer"] as PointPaymentMethod');
  });
});

describe("내 글이면 어디서든 「광고하기」 (Owner 2026-11-03)", () => {
  it.each([
    "components/post/PostCard.tsx",
    "components/product/ProductCard.tsx",
    "components/chats/ChatProductSummary.tsx",
    "components/post/PostDetailView.tsx",
    "components/mypage/products/MyProductCard.tsx",
  ])("%s → 광고하기 창", (f) => {
    expect(read(f)).toContain("TradeAdQuickSheet");
  });
  it("목록 카드·검색·채팅: 내 글·노출 가능 글만, 마운트 뒤에만 (hydration 차이 없음)", () => {
    for (const f of ["components/post/PostCard.tsx", "components/product/ProductCard.tsx", "components/chats/ChatProductSummary.tsx"]) {
      const s = read(f);
      expect(s).toContain("isPostEligibleForPromotionBoost(");
      expect(s).toContain("showOwnerAdEntry");
    }
    expect(read("components/post/PostCard.tsx")).toContain("nowMs != null &&");
  });
  it("길게 누름 메뉴(내 글) 맨 위 「광고하기」", () => {
    const menu = read("components/post/PostListMenuBottomSheet.tsx");
    expect(menu).toContain('"promote_own"');
    expect(menu.indexOf('handle("promote_own")')).toBeLessThan(menu.indexOf('handle("edit_own")'));
  });
});
