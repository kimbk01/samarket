/**
 * 5-B CP-01·CP-03·CP-04·CP-05·CP-08·CP-09·CP-10·CP-11·CP-12 — 업종 목록 노출 정책 관리자 계약.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  browseSubAdminDraftFrom,
  buildBrowseSubAdminWrite,
  clampBrowseBannerCapacityInput,
  mergeBrowseProductConfig,
  type BrowseSubAdminDraft,
} from "@/lib/stores/product/stores-browse-scope-admin-save";
import {
  isBrowseScopeSubOverrideRow,
  resolveBrowseScopePolicy,
  type StoresBrowseScopePolicyRow,
} from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import { buildAdminBrowsePreviewItems } from "@/lib/stores/stores-browse-admin-preview-items";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import type { StoresBrowseInsertionMetaRow } from "@/lib/stores/composition/stores-composition-browse-insertion-meta";
import type { StoresBrowseDiscoveryShelfPayload } from "@/lib/stores/stores-browse-discovery-shelf";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const PAGE = "components/admin/stores/AdminStoresCategoryPolicyPage.tsx";

const primaryRow: StoresBrowseScopePolicyRow = {
  scopeKey: "restaurant",
  primarySlug: "restaurant",
  subSlug: null,
  enabled: true,
  displayTitleKo: "식당",
  displayTitleEn: "Restaurant",
  adEnabled: true,
  couponEnabled: false,
  maxInsertion: null,
  intervalEveryN: 2,
  presentationMode: "card_benefit_integrated",
  scheduleStart: null,
  scheduleEnd: null,
  productConfig: { bannerAds: { enabled: true, capacity: 1, position: "top_context" } },
};

function inheritDraft(): BrowseSubAdminDraft {
  return browseSubAdminDraftFrom({
    nameKo: "치킨",
    nameEn: "Chicken",
    row: null,
    resolved: resolveBrowseScopePolicy({ primarySlug: "restaurant", subSlug: "chicken", primaryRow, subRow: null }),
  });
}

function write(draft: BrowseSubAdminDraft, existingProductConfig: Record<string, unknown> | null = null) {
  return buildBrowseSubAdminWrite({
    scopeKey: "restaurant/chicken",
    primarySlug: "restaurant",
    subSlug: "chicken",
    nameKo: "치킨",
    nameEn: "Chicken",
    existingProductConfig,
    draft,
  });
}

describe("CP-01 상단 칩 = 하위 탭 이동 버튼", () => {
  it("칩 4개가 basic·ad·coupon·exposure 탭으로 이동한다", async () => {
    const src = read(PAGE);
    expect(src).toMatch(/\{ tab: "basic"[\s\S]*\{ tab: "ad", labelKo: "광고 슬롯"[\s\S]*\{ tab: "coupon", labelKo: "쿠폰 배지"[\s\S]*\{ tab: "exposure", labelKo: "노출 간격"/);
    expect(src).toContain("onClick={() => setTab(chip.tab)}");
    /** 장식 div 칩 제거 */
    expect(src).not.toMatch(/\[previewTitle, label\(ko, "광고 슬롯"/);
    for (const id of ["basic", "ad", "coupon", "exposure"]) {
      expect(src).toContain(`{ id: "${id}"`);
    }
  });
});

describe("CP-03·CP-12", () => {
  it("2차 패널을 열어도 상속 OFF 로 바꾸지 않는다 · 토글은 행 버튼 밖", () => {
    const src = read(PAGE);
    expect(src).not.toContain('return { ...prev, [first.subSlug]: { ...current, mode: "override" } };');
    expect(src).toContain("data-category-sub-inherit-toggle");
    const li = src.slice(src.indexOf('<li key={secondary.subSlug} className="flex items-start gap-2">'));
    const buttonEnd = li.indexOf("</AdminListItemButton>");
    const toggleAt = li.indexOf("data-category-sub-inherit-toggle");
    expect(buttonEnd).toBeGreaterThan(0);
    expect(toggleAt).toBeGreaterThan(buttonEnd);
  });
});

describe("CP-04·CP-05 2차 상속 저장 형식", () => {
  it("초안 표시명 = 2차 이름 (1차 표시명 아님), 간격·최대 빈칸", () => {
    const d = inheritDraft();
    expect(d.mode).toBe("inherit");
    expect(d.draftTitleKo).toBe("치킨");
    expect(d.draftInterval).toBe("");
    expect(d.draftMax).toBe("");
    expect(d.explicit).toEqual({});
  });

  it("상속 = 행 삭제", () => {
    expect(write(inheritDraft()).kind).toBe("delete");
  });

  it("별도 설정에서 바꾼 필드만 값, 나머지 상속(null·inherit) · 간격 빈칸 = null", () => {
    const d: BrowseSubAdminDraft = {
      ...inheritDraft(),
      mode: "override",
      adEnabled: false,
      explicit: { adEnabled: true },
    };
    const w = write(d);
    expect(w.kind).toBe("upsert");
    if (w.kind !== "upsert") return;
    expect(w.row).toMatchObject({
      enabled: true,
      displayTitleKo: null,
      displayTitleEn: null,
      adEnabled: "false",
      couponEnabled: "inherit",
      maxInsertion: null,
      intervalEveryN: null,
      presentationMode: "inherit",
    });
    expect(w.row.productConfig).toEqual({});
    const resolved = resolveBrowseScopePolicy({
      primarySlug: "restaurant",
      subSlug: "chicken",
      primaryRow,
      subRow: {
        ...w.row,
        adEnabled: false,
        couponEnabled: "inherit",
      } as StoresBrowseScopePolicyRow,
    });
    /** 간격은 1차(2) 를 따른다 — 8 로 고정되지 않는다 */
    expect(resolved.intervalEveryN).toBe(2);
    expect(resolved.adEnabled).toBe(false);
  });

  it("별도 설정이지만 값이 없으면(활성·전부 상속) 삭제, 끄기만 해도 별도 설정으로 저장", () => {
    expect(write({ ...inheritDraft(), mode: "override" }).kind).toBe("delete");
    const off = write({ ...inheritDraft(), mode: "override", enabled: false });
    expect(off.kind).toBe("upsert");
    expect(
      isBrowseScopeSubOverrideRow({
        ...primaryRow,
        scopeKey: "restaurant/chicken",
        subSlug: "chicken",
        enabled: false,
        displayTitleKo: null,
        displayTitleEn: null,
        adEnabled: "inherit",
        couponEnabled: "inherit",
        intervalEveryN: null,
        presentationMode: "inherit",
        productConfig: {},
      })
    ).toBe(true);
  });

  it("표시명이 2차 이름과 같으면 null, 다르면 값", () => {
    const same = write({ ...inheritDraft(), mode: "override", enabled: false, draftTitleKo: "치킨" });
    const own = write({ ...inheritDraft(), mode: "override", draftTitleKo: "치킨·닭강정" });
    expect(same.kind === "upsert" && same.row.displayTitleKo).toBe(null);
    expect(own.kind === "upsert" && own.row.displayTitleKo).toBe("치킨·닭강정");
  });

  it("화면은 저장 헬퍼를 쓰고 intervalNumber(8 기본값) 를 쓰지 않는다", () => {
    const src = read(PAGE);
    expect(src).toContain("buildBrowseSubAdminWrite");
    expect(src).not.toContain("function intervalNumber");
    expect(src).not.toMatch(/: 8;\s*\n\}/);
  });
});

describe("CP-08·CP-09·CP-10", () => {
  it("우선순위 행을 선택 순서대로, 미선택은 아래", () => {
    expect(read(PAGE)).toContain(
      "...STORES_BROWSE_ADMIN_RANKING_CRITERION_IDS.filter((x) => !draftPrimary.rankingCriteria.includes(x))"
    );
  });

  it("배너 용량 입력 최대 3", () => {
    expect(clampBrowseBannerCapacityInput("5")).toBe("3");
    expect(clampBrowseBannerCapacityInput("0")).toBe("1");
    expect(clampBrowseBannerCapacityInput("")).toBe("");
  });

  it("product_config 는 기존 키를 보존하며 병합", () => {
    expect(mergeBrowseProductConfig({ legacyKey: 1, bannerAds: { enabled: false } }, { bannerAds: { enabled: true } })).toEqual({
      legacyKey: 1,
      bannerAds: { enabled: true },
    });
    expect(mergeBrowseProductConfig({ legacyKey: 1, bannerAds: {} }, { bannerAds: undefined })).toEqual({ legacyKey: 1 });
    expect(read(PAGE)).toContain("mergeBrowseProductConfig(primaryMeta.row?.productConfig ?? null");
  });
});

describe("CP-11 미리보기 = 앱 응답 그대로", () => {
  const store = (id: string) => ({ id, slug: id, name: id }) as unknown as BrowseStoreListItem;
  const stores = [store("a"), store("b"), store("c")];

  it("쿠폰 배지는 couponBadgeByStoreId 에 있는 매장만", () => {
    const items = buildAdminBrowsePreviewItems({
      stores,
      insertionRows: null,
      couponBadgeByStoreId: { b: { title: "10%" } },
      discoveryShelf: null,
    });
    expect(items.map((i) => (i.kind === "organic" ? `${i.key}:${i.couponBadge}` : i.kind))).toEqual([
      "a:false",
      "b:true",
      "c:false",
    ]);
  });

  it("삽입 행 순서대로 + 탐색 선반 위치", () => {
    const rows: StoresBrowseInsertionMetaRow[] = [
      { kind: "organic", storeId: "a" },
      {
        kind: "paid_ad",
        campaignId: "x",
        storeId: "c",
        title: "t",
        headline: "광고",
        bodyCopy: null,
        imageUrl: null,
        placement: "stores_browse",
        isSponsored: true,
        exposureToken: "tok",
      },
      { kind: "organic", storeId: "b" },
    ];
    const shelf = {
      enabled: true,
      position: "page_top",
      afterN: 1,
      everyN: 1,
      maxShelvesPerPage: 1,
      dataType: "rating",
      stores: [],
    } as StoresBrowseDiscoveryShelfPayload;
    const items = buildAdminBrowsePreviewItems({ stores, insertionRows: rows, couponBadgeByStoreId: {}, discoveryShelf: shelf });
    expect(items.map((i) => i.key)).toEqual(["discovery-shelf", "a", "ad-x", "b"]);
  });

  it("미리보기 소스: couponBadgeByStoreId 사용 · limit 미지정 · 노출 집계 없음", () => {
    const src = read("components/admin/stores/AdminStoresCategoryBrowseLivePreview.tsx");
    expect(src).toContain("couponBadgeByStoreId");
    expect(src).toContain("buildAdminBrowsePreviewItems");
    expect(src).not.toMatch(/limit:\s*"8"/);
    expect(src).not.toContain("DeliveryAdSponsoredBeacon");
    expect(src).not.toContain("exposureToken=");
    expect(src).toContain('renderContext="admin_preview"');
    expect(src).toContain("StoresBrowseDiscoveryShelf");
    /** 쿠폰 행 탐색·일괄 배지 제거 */
    expect(src).not.toContain("insertionBanner");
    expect(src).not.toContain('couponBadgeTitle={couponEnabled');
  });
});
