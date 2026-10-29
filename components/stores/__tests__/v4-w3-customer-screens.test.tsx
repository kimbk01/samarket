// @vitest-environment jsdom
/**
 * v4 W3 — 배달 고객 화면 렌더·정적 계약.
 * - PL-02 홈 선반 카드 5종(+에디토리얼 = 음식 카드)·상품 상세에 `StoreSampleStoreBadge`
 * - UI-17 「이 매장 비우기」 확인 대화상자 경유·44px·원시 red 금지
 * - UI-19·UI-21 검색 한국어 하드코딩·aria 리터럴 → i18n 키 (ko/en)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translate } from "@/lib/i18n/messages";
import type { MessageKey } from "@/lib/i18n/message-key";
import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/stores",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/dibay/delivery-store-menus-prewarm", () => ({
  deliveryStoreMenusPrewarm: vi.fn(),
}));

import { StoresHomeFoodRailCard } from "@/components/stores/home/presentation/StoresHomeFoodRailCard";
import { StoresHomeStoreHorizontalCard } from "@/components/stores/home/presentation/StoresHomeStoreHorizontalCard";
import { StoresHomeStoreTeaserCard } from "@/components/stores/home/presentation/StoresHomeStoreTeaserCard";
import { StoresHomeHighRatingFoodCard } from "@/components/stores/home/presentation/StoresHomeHighRatingFoodCard";
import { StoresHomeBrandCircularCard } from "@/components/stores/home/presentation/StoresHomeBrandCircularCard";
import { StoreBaeminProductDetailInfo } from "@/components/stores/product-detail/baemin/StoreBaeminProductDetailInfo";
import {
  buildHomeSampleStoreIdSet,
  readHomeShelfEntryIsSample,
} from "@/components/stores/home/presentation/stores-home-entry-sample";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

let root: Root | null = null;
let host: HTMLDivElement | null = null;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});
function render(node: ReactNode) {
  act(() => root!.render(node));
  return host!;
}

const entry: StoresHomeFoodEntry = {
  storeId: "s1",
  storeSlug: "demo",
  storeName: "Demo Store",
  productId: "p1",
  name: "Chicken",
  price: 100,
  imageUrl: null,
  etaLabel: null,
  rating: 0,
};

const CARDS = [
  ["FoodRail", StoresHomeFoodRailCard],
  ["StoreHorizontal", StoresHomeStoreHorizontalCard],
  ["StoreTeaser", StoresHomeStoreTeaserCard],
  ["HighRating", StoresHomeHighRatingFoodCard],
  ["BrandCircular", StoresHomeBrandCircularCard],
] as const;

describe("PL-02 — 홈 선반 카드 샘플 배지", () => {
  for (const [name, Card] of CARDS) {
    it(`${name}: isSampleStore=true 일 때만 배지`, () => {
      let el = render(<Card entry={entry} imageUrl={null} loadingImage={false} isSampleStore />);
      expect(el.querySelector("[data-store-sample-badge]")).not.toBeNull();
      el = render(<Card entry={entry} imageUrl={null} loadingImage={false} />);
      expect(el.querySelector("[data-store-sample-badge]")).toBeNull();
    });
    it(`${name}: 엔트리의 서버 필드(isSampleStore)로도 표시`, () => {
      const withField = { ...entry, isSampleStore: true } as StoresHomeFoodEntry;
      const el = render(<Card entry={withField} imageUrl={null} loadingImage={false} />);
      expect(el.querySelector("[data-store-sample-badge]")).not.toBeNull();
    });
  }

  it("판정 헬퍼 — 서버 응답 값만 사용", () => {
    expect(readHomeShelfEntryIsSample(entry)).toBe(false);
    expect(readHomeShelfEntryIsSample(entry, true)).toBe(true);
    const ids = buildHomeSampleStoreIdSet([
      { id: "a", isSampleStore: true },
      { id: "b", isSampleStore: false },
      { id: "c" },
    ]);
    expect([...ids]).toEqual(["a"]);
  });

  it("composition 섹션이 6종 카드 모두에 샘플 여부를 전달", () => {
    const s = src("components/stores/home/hub/StoresHomeCompositionSlotSection.tsx");
    expect(s).toContain("buildHomeSampleStoreIdSet(feedStores)");
    expect((s.match(/isSampleStore=\{isSampleStore\}/g) ?? []).length).toBe(6);
    expect(s).toContain("isSampleStore={store.isSampleStore === true}");
  });

  it("상품 상세 정보 영역 배지 + 상품 페이지 전달", () => {
    let el = render(
      <StoreBaeminProductDetailInfo
        title="Chicken"
        summary={null}
        badges={[]}
        isSampleStore
      />
    );
    expect(el.querySelector("[data-store-sample-badge]")).not.toBeNull();
    el = render(
      <StoreBaeminProductDetailInfo
        title="Chicken"
        summary={null}
        badges={[]}
      />
    );
    expect(el.querySelector("[data-store-sample-badge]")).toBeNull();
    const page = src("components/stores/StoreProductPublic.tsx");
    expect(page).toContain("isSampleStore={isSampleStore}");
    expect(page).toContain("readProductResponseIsSampleStore(json)");
    expect(page).toContain("readStoreCacheIsSampleStore(");
  });
});

describe("PERF-09 — 상품 상세 첫 로드는 캐시 재사용", () => {
  it("첫 로드 force 해제, 오류 재시도만 force", () => {
    const page = src("components/stores/StoreProductPublic.tsx");
    expect(page).not.toContain("force: !silent");
    expect(page).toContain("force: opts?.force === true");
    expect(page).toContain("loadProductPage({ force: true })");
  });
});

describe("UI-17 — 빈 장바구니 「이 매장 비우기」", () => {
  const cart = src("components/stores/StoreCommerceCartPageClient.tsx");
  it("확인 대화상자 경유(직접 비우기 금지)", () => {
    expect(cart).not.toContain("onClick={() => cart.clearStoreCart(b.storeId)}");
    expect(cart).toContain("setOtherBucketClearTarget({ storeId: b.storeId, storeName: b.storeName })");
    expect(cart).toContain("open={otherBucketClearTarget != null}");
    expect(cart).toContain("if (target) cart.clearStoreCart(target.storeId);");
  });
  it("44px 터치·원시 red 금지·AA 토큰(text-sam-fg)", () => {
    const start = cart.indexOf("data-store-cart-other-bucket-clear");
    const btn = cart.slice(start, start + 600);
    expect(btn).toContain("min-h-[var(--sam-tap-min)]");
    expect(btn).toContain("text-sam-fg");
    expect(btn).not.toMatch(/text-red-\d/);
  });
});

const NEW_KEYS: MessageKey[] = [
  "ui_delivery_search_result_count",
  "ui_delivery_search_recent_clear_all",
  "ui_delivery_search_recent_delete_aria",
  "ui_delivery_search_fallback_kw_1",
  "ui_delivery_search_fallback_kw_10",
  "ui_delivery_sub_categories_aria",
  "ui_delivery_banner_slides_aria",
  "ui_delivery_banner_slide_aria",
  "ui_delivery_product_photo_thumb_aria",
];

describe("UI-19·UI-21 — i18n 키 ko/en", () => {
  it("새 키는 ko·en 모두 번역(키 그대로 노출 금지)", () => {
    for (const k of NEW_KEYS) {
      const ko = translate("ko", k, { count: 3, keyword: "x", n: 1, total: 2 });
      const en = translate("en", k, { count: 3, keyword: "x", n: 1, total: 2 });
      expect(ko).not.toBe(k);
      expect(en).not.toBe(k);
      expect(en).not.toMatch(/[가-힣]/);
    }
    expect(translate("en", "ui_delivery_search_result_count", { count: 3 })).toBe("3 results");
  });

  it("검색 화면 한국어 하드코딩 제거", () => {
    expect(src("components/delivery/search/DeliverySearchResults.tsx")).not.toContain("· 결과 {");
    const recent = src("components/delivery/search/RecentSearchChips.tsx");
    expect(recent).not.toContain("전체 삭제");
    expect(recent).not.toContain("가 없습니다");
    expect(recent).not.toContain("} 삭제`");
    const page = src("components/delivery/search/DeliverySearchPage.tsx");
    expect(page).not.toMatch(/"(치킨|피자|한식|무료배달)"/);
    expect(page).toContain("FALLBACK_RECOMMENDED_KEYS");
  });

  it("aria 리터럴 제거", () => {
    expect(src("components/stores/home/hub/StoresHomeSubCategoryPanel.tsx")).not.toContain(
      'aria-label="store sub categories"'
    );
    const hero = src("components/stores/home/hub/StoresHomeHeroBanner.tsx");
    expect(hero).not.toContain('aria-label="Banner slides"');
    expect(hero).not.toContain("aria-label={`Slide ${i + 1}`}");
    expect(src("components/stores/product-detail/baemin/StoreProductDetailPageChrome.tsx")).toContain(
      'aria-label={t("ui_delivery_product_photo_thumb_aria"'
    );
    expect(src("components/delivery/navigation/DeliveryDomainSwitcherOverlay.tsx")).not.toContain(
      'useStoreBusinessHubEntryModal("확인"'
    );
  });
});
