/**
 * 재감사 S-2 (Owner 「S-2 진행」 2026-11-03) — 문구·버튼 권한·남은 곳.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canActOnAdminRoute } from "@/lib/admin/access/admin-route-access";
import { translate, type MessageKey } from "@/lib/i18n/messages";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const ko = new Proxy({} as Record<string, string>, { get: (_t, k) => translate("ko", String(k) as MessageKey) });

describe("고객 화면 — 상위노출 관련 「홍보」 문구가 없다", () => {
  it.each([
    "points_ui_promotion_conflict",
    "promo_sheet_success",
    "promo_sheet_extended_success",
    "promo_sheet_cta",
    "promo_sheet_purchase_failed",
    "promo_sheet_already_active",
    "promo_sheet_title_community",
    "notify_community_promotion_ended_title",
    "notify_community_promotion_ended_body",
    "route_ads_title",
    "mypage_oa_promotion_applied",
    "community_top_pin_cta",
  ])("%s", (key) => {
    expect(ko[key], key).toBeTruthy();
    expect(ko[key]).not.toMatch(/홍보|Community/);
  });
});

describe("판매자 광고 창 — 승인 시안과 같다", () => {
  it("위치 「첫 페이지 위쪽」 · 광고 중 끝나는 시각 · 일시정지 안내와 막힌 버튼", () => {
    expect(ko.trade_ad_where_boost).toBe("거래 목록 첫 페이지 위쪽");
    expect(ko.trade_ad_boost_paused_detail).toContain("운영자가 광고를 잠시 멈췄습니다");
    expect(ko.trade_ad_paused_cta).toBe("재개되면 연장할 수 있어요");
    const sheet = read("components/trade/seller-ad/TradeAdQuickSheet.tsx");
    expect(sheet).toContain('t("trade_ad_where_boost_until"');
    expect(sheet).toMatch(/<DibayOverlayButton roleTone="primary" disabled>\s*\{t\("trade_ad_paused_cta"\)\}/);
  });
});

describe("H-4 어드민 버튼 권한 = 서버 가드 키", () => {
  const ads = { role: "admin" as const, permissions: ["ads"] };
  const business = { role: "admin" as const, permissions: ["business"] };
  it.each([
    ["/admin/ptr-reveal-ads/x", ads, business],
    ["/admin/feed-ad-products", ads, business],
    ["/admin/feed-ad-requests/x", ads, business],
    ["/admin/platform-promotion/banners", ads, business],
  ])("%s", (path, allowed, denied) => {
    expect(canActOnAdminRoute(path, allowed)).toBe(true);
    expect(canActOnAdminRoute(path, denied)).toBe(false);
  });
  it("쓰기 함수 맨 앞에서 확인한다 (사유 입력 전에 멈춤)", () => {
    for (const [f, path] of [
      ["components/admin/ptr-reveal/AdminPtrRevealListPage.tsx", "/admin/ptr-reveal-ads"],
      ["components/admin/ptr-reveal/AdminPtrRevealDetailWorkspace.tsx", "/admin/ptr-reveal-ads"],
      ["components/admin/ads/AdminFeedAdProductsClient.tsx", "/admin/feed-ad-products"],
      ["components/admin/ads/AdminFeedAdRequestDetail.tsx", "/admin/feed-ad-requests"],
      ["components/admin/platform-promotion/AdminPromotionBannerListClient.tsx", "/admin/platform-promotion/banners"],
      ["components/admin/stores/AdminDeliveryAdFirstPartyCreateView.tsx", "/admin/delivery-ads"],
      ["components/admin/stores/AdminDeliveryAdCommercialSettingsView.tsx", "/admin/delivery-ads"],
    ] as const) {
      const src = read(f);
      expect(src, f).toContain(`useAdminWriteGuard("${path}")`);
      expect(src, f).toMatch(/if \(!(?:writeGuard|slotWriteGuard)\.guard\(\)\) return/);
    }
  });
  it("공통 광고 화면 목록 행 버튼도 계열별 권한", () => {
    const ws = read("components/admin/ads/AdminAdvertisingWorkspace.tsx");
    expect(ws.match(/rowActionDenied\(item\) != null/g)?.length).toBe(3);
  });
});

describe("H-7 어드민 문구", () => {
  it("옛 메뉴 이름·영어 문구가 한국어 화면에 없다", () => {
    const ws = read("components/admin/ads/AdminAdvertisingWorkspace.tsx");
    expect(ws).not.toContain("프로모션 / 이벤트");
    expect(ws).not.toContain('ko: "상위 노출"');
    expect(ws).not.toContain("writer가");
    expect(ws).not.toContain('"잘못된 Boost');
    for (const f of [
      "components/admin/ads/AdminAdsDirectRegisterHub.tsx",
      "components/admin/ads/AdminAdsPlacementManagementView.tsx",
      "components/admin/ads/AdminAdsProductsCommercialView.tsx",
    ]) {
      expect(read(f), f).not.toContain('"광고 / 노출"');
    }
    const hub = read("components/admin/ads/AdminAdsDirectRegisterHub.tsx");
    expect(hub).not.toContain('titleKo: "Popup"');
    expect(hub).not.toContain("Delivery Sponsored)는");
  });
  it("커뮤니티 어드민 메뉴·화면 = 커뮤니티 상위노출 (P-6 거래와 같게)", () => {
    expect(ko.admin_menu_community_promotions).toBe("커뮤니티 상위노출");
    expect(read("components/admin/community/promotions/AdminCommunityPromotionsPage.tsx")).toContain('title="커뮤니티 상위노출"');
  });
  it("광고 이력 상태는 화면에서만 사람 이름으로 (필터는 원래 값)", () => {
    expect(read("components/admin/ads/AdminAdsHistoryLedgerView.tsx")).toContain("historyStatusDisplay(");
    expect(read("lib/admin/ads-commercial/products-control-model.ts")).toContain("labelKo: humanPlacementLabel(key, true)");
  });
});

describe("I-5 · G-8 · G-10 남은 곳", () => {
  it("I-5: 원인이 붙은 코드·권한 코드·문서 검사 코드·서버 원문도 한국어", () => {
    const page = read("components/admin/launch-intro/LaunchIntroAdminPage.tsx");
    expect(page).toContain('const code = rawCode.split(":")[0]!.trim();');
    expect(page).toContain('code === "forbidden_permission"');
    expect(page).toContain("(image|video|headline|supporting|background)_");
  });
  it("G-8: 거래 홈 버튼 메뉴·커뮤니티 더보기 메뉴 3곳도 열려 있으면 팝업을 미룬다", () => {
    for (const [f, v] of [
      ["components/home/HomeTradeHubFloatingBar.tsx", "menuOpen"],
      ["components/community/ui/CommunityMoreMenu.tsx", "open"],
      ["components/community/ui/CommunityOwnPostMoreMenu.tsx", "open"],
      ["components/community/post-detail/CommunityCommentItem.tsx", "menuOpen"],
    ] as const) {
      expect(read(f), f).toContain(`useRegisterOpenOverlay(${v});`);
    }
  });
  it("G-10: 직접 팝업 만들기·공통 화면 기간 변경 = PHT 도우미", () => {
    expect(read("components/admin/ads/AdminAdsDirectPopupCreateView.tsx")).not.toMatch(/new Date\((startAt|endAt)\)\.toISOString\(\)/);
    expect(read("components/admin/ads/AdminAdsDirectPopupCreateView.tsx")).toContain('timezone: "Asia/Manila"');
    expect(read("components/admin/ads/AdminAdvertisingWorkspace.tsx")).toContain("adminManilaInputToIso(periodStart)");
  });
});
