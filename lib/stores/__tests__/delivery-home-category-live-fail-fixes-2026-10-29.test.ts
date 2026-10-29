/**
 * 2026-10-29 운영 실측 FAIL 11건 — 홈 화면 구성 5건 · 매장 목록 노출 정책 6건 (감사 문서 §6).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateHomeShelfSourceAndPresentation } from "@/lib/stores/product/stores-home-data-source";
import { renumberHomeCompositionOrders } from "@/lib/stores/product/stores-home-shelf-order";
import {
  resolveHomeShelfForComposerSlot,
  resolveHomeShelfSubtitle,
} from "@/lib/stores/product/stores-home-shelf-product-resolve";
import { resolveHomeShelfFoodEntryImage } from "@/lib/stores/product/stores-home-shelf-image-resolve";
import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";
import {
  isScheduleIsoWithOffset,
  phtDateTimeLocalToIso,
} from "@/lib/stores/product/stores-home-shelf-schedule-pht";
import {
  resolveBrowseScopePolicy,
  type StoresBrowseScopePolicyRow,
} from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import { isBrowseScopeCustomerVisible } from "@/lib/stores/product/stores-browse-scope-customer-meta";
import {
  applyCustomerBrowseTaxonomyMeta,
  buildStoresTaxonomyCustomerBrowseMeta,
} from "@/lib/stores/store-taxonomy-customer-browse";
import {
  parseStoreTaxonomySnapshot,
  resolveCanonicalPrimaryIndustries,
  resolveCanonicalSecondaryIndustries,
} from "@/lib/stores/store-taxonomy-canonical";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("홈 — 부제 비우기", () => {
  it("저장한 적 없음(null) = 기본 부제, 빈 문자열 = 부제 없음(재저장해도 유지)", () => {
    const untouched = resolveHomeShelfForComposerSlot("slot0Food", [{ shelfId: "order_now", subtitleKo: null }])!;
    expect(resolveHomeShelfSubtitle(untouched, "ko")).toBe("영업 중 · 배달 또는 포장이 열려 있어요");
    const cleared = resolveHomeShelfForComposerSlot("slot0Food", [{ shelfId: "order_now", subtitleKo: "" }])!;
    expect(resolveHomeShelfSubtitle(cleared, "ko")).toBeNull();
    // 관리자 초안으로 돌아가는 값이 "" 라야 다음 저장도 「지움」
    expect(cleared.subtitleKo).toBe("");
  });

  it("관리자 입력이 빈 값을 null 로 바꾸지 않는다", () => {
    const src = read("components/admin/stores/AdminStoresHomeShelvesPage.tsx");
    expect(src).not.toContain("subtitleKo: e.target.value || null");
    expect(src).not.toContain("subtitleEn: e.target.value || null");
  });
});

describe("홈 — 데이터 소스·표현 저장 검증 (조용한 변환 금지)", () => {
  it("음식 선반에 나머지 매장 소스는 저장 거부", () => {
    expect(
      validateHomeShelfSourceAndPresentation({ slot: "slot0Food", dataSource: "rest_stores", presentation: "food_horizontal" })
    ).toMatchObject({ code: "data_source_not_allowed_for_slot" });
  });
  it("소스가 그리지 않는 표현은 저장 거부 · 허용 조합은 통과", () => {
    expect(
      validateHomeShelfSourceAndPresentation({ slot: "slot2Food", dataSource: "popular_menu", presentation: "timesale_vertical" })
    ).toMatchObject({ code: "presentation_not_allowed_for_data_source" });
    expect(
      validateHomeShelfSourceAndPresentation({ slot: "slot0Food", dataSource: "order_now", presentation: "editorial_grid" })
    ).toBeNull();
    expect(
      validateHomeShelfSourceAndPresentation({ slot: "slot6RestStores", dataSource: "rest_stores", presentation: "timesale_vertical" })
    ).toBeNull();
    expect(
      validateHomeShelfSourceAndPresentation({ slot: "slot0Food", dataSource: "made_up", presentation: undefined })
    ).toMatchObject({ code: "invalid_data_source" });
  });
  it("PUT 이 검증을 호출한다", () => {
    expect(read("app/api/admin/stores-home-shelves/route.ts")).toContain("validateHomeShelfSourceAndPresentation(");
  });
});

describe("홈 — 에디토리얼 그리드는 모든 음식 선반에서 격자", () => {
  it("음식 렌더러 하나가 그리드 컨테이너를 고른다 (slot5 전용 분기 없음)", () => {
    const src = read("components/stores/home/hub/StoresHomeCompositionSlotSection.tsx");
    expect(src).toContain('shelf.presentation === "editorial_grid" ? "grid grid-cols-2 gap-2 sm:grid-cols-4" : STORES_HOME_RAIL_SCROLL');
    expect(src.match(/grid grid-cols-2 gap-2 sm:grid-cols-4/g)?.length).toBe(1);
  });
});

describe("홈 — 음식 선반 이미지 소스", () => {
  const entry = {
    storeId: "s",
    storeSlug: "s",
    storeName: "s",
    productId: "p",
    name: "메뉴",
    price: 1,
    imageUrl: "https://x/product.jpg",
    storeProfileImageUrl: "https://x/profile.jpg",
    etaLabel: null,
    rating: 0,
  } satisfies StoresHomeFoodEntry;
  it("매장 프로필·브랜드 로고 = 프로필 사진, 대표 상품·자동 = 상품 사진", () => {
    expect(resolveHomeShelfFoodEntryImage(entry, [], "store_profile").imageUrl).toBe("https://x/profile.jpg");
    expect(resolveHomeShelfFoodEntryImage(entry, [], "brand_logo").imageUrl).toBe("https://x/profile.jpg");
    expect(resolveHomeShelfFoodEntryImage(entry, [], "representative_product").imageUrl).toBe("https://x/product.jpg");
    expect(resolveHomeShelfFoodEntryImage(entry, [], "auto").imageUrl).toBe("https://x/product.jpg");
  });
  it("프로필 사진이 없으면 상품 사진", () => {
    expect(
      resolveHomeShelfFoodEntryImage({ ...entry, storeProfileImageUrl: null }, [], "store_profile").imageUrl
    ).toBe("https://x/product.jpg");
  });
});

describe("홈 — 순서가 숨은 보존 행과 겹쳐도 저장", () => {
  it("상대 순서 유지·동률은 편집 선반 우선·0..n-1", () => {
    const edited = [
      { slot: "slot2Food", order: 0 },
      { slot: "slot0Food", order: 1 },
      { slot: "slot6RestStores", order: 10 },
    ];
    const preserved = [
      { slot: "slot1Stores", order: 1 },
      { slot: "homeBannerBeforeRest", order: 9 },
    ];
    const out = renumberHomeCompositionOrders(edited, preserved);
    expect(out.map((r) => r.slot)).toEqual([
      "slot2Food",
      "slot0Food",
      "slot1Stores",
      "homeBannerBeforeRest",
      "slot6RestStores",
    ]);
    expect(out.map((r) => r.order)).toEqual([0, 1, 2, 3, 4]);
  });
});

function scopeRow(over: Partial<StoresBrowseScopePolicyRow>): StoresBrowseScopePolicyRow {
  return {
    scopeKey: "restaurant",
    primarySlug: "restaurant",
    subSlug: null,
    enabled: true,
    displayTitleKo: null,
    displayTitleEn: null,
    adEnabled: "inherit",
    couponEnabled: "inherit",
    maxInsertion: "inherit",
    intervalEveryN: "inherit",
    presentationMode: "inherit",
    scheduleStart: null,
    scheduleEnd: null,
    productConfig: null,
    ...over,
  } as StoresBrowseScopePolicyRow;
}

describe("업종 — 노출 기간 PHT", () => {
  it("관리자 입력(PHT 벽시계)은 +08:00 으로 저장 · 오프셋 없는 값은 서버 거부", () => {
    expect(phtDateTimeLocalToIso("2026-10-30T09:00")).toBe("2026-10-30T09:00:00+08:00");
    expect(isScheduleIsoWithOffset("2026-10-30T09:00")).toBe(false);
    expect(isScheduleIsoWithOffset("2026-10-30T09:00:00+08:00")).toBe(true);
    expect(isScheduleIsoWithOffset(null)).toBe(true);
    const page = read("components/admin/stores/AdminStoresCategoryPolicyPage.tsx");
    expect(page).toContain("phtDateTimeLocalToIso(draftPrimary.draftScheduleStart)");
    expect(page).not.toContain("getTimezoneOffset");
    expect(read("app/api/admin/stores-category-policy/route.ts")).toContain("invalid_schedule_timezone");
  });

  it("지금이 기간 안이면 노출", () => {
    const now = Date.parse("2026-10-29T06:38:00Z"); // 14:38 PHT
    const resolved = resolveBrowseScopePolicy({
      primarySlug: "restaurant",
      subSlug: null,
      primaryRow: scopeRow({
        scheduleStart: phtDateTimeLocalToIso("2026-10-29T13:38"),
        scheduleEnd: phtDateTimeLocalToIso("2026-10-29T15:38"),
      }),
      subRow: null,
    });
    expect(isBrowseScopeCustomerVisible(resolved, now)).toBe(true);
  });
});

describe("업종 — 별도 설정 2차도 1차 기간 상속", () => {
  it("2차 기간 null = 1차 기간", () => {
    const resolved = resolveBrowseScopePolicy({
      primarySlug: "restaurant",
      subSlug: "chinese",
      primaryRow: scopeRow({ scheduleStart: "2026-11-01T00:00:00+08:00", scheduleEnd: "2026-11-02T00:00:00+08:00" }),
      subRow: scopeRow({
        scopeKey: "restaurant/chinese",
        subSlug: "chinese",
        intervalEveryN: 8,
        scheduleStart: null,
        scheduleEnd: null,
      }),
    });
    expect(resolved.scheduleStart).toBe("2026-11-01T00:00:00+08:00");
    expect(isBrowseScopeCustomerVisible(resolved, Date.parse("2026-10-29T06:00:00Z"))).toBe(false);
  });
});

describe("업종 — 변경 없는 저장 · 2차 클릭", () => {
  it("바뀐 2차만 저장하고, 2차 열기는 별도 설정으로 바꾸지 않는다", () => {
    const page = read("components/admin/stores/AdminStoresCategoryPolicyPage.tsx");
    expect(page).toContain("JSON.stringify(baseline) === JSON.stringify(draft)");
    expect(page).not.toContain('return { ...prev, [first.subSlug]: { ...current, mode: "override" } };');
  });
});

describe("업종 — OFF·기간 밖이면 목록·배너·탭 모두 숨김, 1차 표시명 반영", () => {
  const categories = [
    { id: "c1", name: "식당", name_en: "Restaurant", slug: "restaurant", sort_order: 1 },
    { id: "c2", name: "마트", name_en: "Mart", slug: "mart", sort_order: 2 },
  ];
  const topics = [
    { id: "t1", store_category_id: "c1", name: "중식", slug: "chinese", sort_order: 1 },
    { id: "t2", store_category_id: "c2", name: "편의점", slug: "convenience", sort_order: 1 },
  ];

  it("고객 메타 → 숨김 표시·표시명 (행은 유지)", () => {
    const meta = buildStoresTaxonomyCustomerBrowseMeta({
      categories,
      topics,
      resolvePrimary: (slug) => ({
        visible: slug !== "mart",
        displayTitleKo: slug === "restaurant" ? "맛집" : null,
        displayTitleEn: null,
      }),
      resolveSub: () => ({ visible: true, displayTitleKo: null, displayTitleEn: null }),
    });
    expect(meta.hiddenScopeKeys).toEqual(["mart"]);
    const snap = parseStoreTaxonomySnapshot({ ok: true, categories, topics, customerBrowse: meta })!;
    const primaries = resolveCanonicalPrimaryIndustries(snap);
    expect(primaries.map((p) => [p.slug, p.nameKo, p.customerBrowseHidden])).toEqual([
      ["restaurant", "맛집", false],
      ["mart", "마트", true],
    ]);
    expect(resolveCanonicalSecondaryIndustries(snap, "mart")[0]?.customerBrowseHidden).toBe(true);
  });

  it("메타 없으면 원본 그대로 (사장님 폼·정책 조회 실패)", () => {
    const out = applyCustomerBrowseTaxonomyMeta(categories, topics, undefined);
    expect(out.categories).toBe(categories);
  });

  it("배너·탭·칩·홈 탭이 같은 숨김 판정을 쓴다", () => {
    expect(read("app/api/stores/browse-top-banners/route.ts")).toContain("isBrowseScopeCustomerVisible(resolved)");
    expect(read("app/api/stores/taxonomy/route.ts")).toContain("isBrowseScopeCustomerVisible(resolved, nowMs)");
    expect(read("components/stores/browse/StoresBrowseHeaderChrome.tsx")).toContain("primaries={navPrimaries}");
    expect(read("components/stores/browse/StoresBrowseHeaderSubTopicChips.tsx")).toContain("!s.customerBrowseHidden");
    expect(read("components/stores/home/hub/StoresHomeQuickCategories.tsx")).toContain("!c.customer_browse_hidden");
  });
});
