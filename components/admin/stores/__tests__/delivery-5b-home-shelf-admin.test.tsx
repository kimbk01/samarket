/**
 * 5-B HS-01·HS-03·HS-04·HS-05·HS-06·HS-08 — HOME 선반 관리자 계약.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({
    language: "ko",
    t: (key: string) => key,
    safeT: (key: string) => key,
    tt: (text: string) => text,
  }),
}));

import { AdminHomeShelfTabFields, type AdminHomeDraftShelf } from "../AdminHomeShelfTabFields";
import { resolveHomeShelfProductCatalog } from "@/lib/stores/product/stores-home-shelf-product-resolve";
import {
  HOME_SHELF_ADMIN_IMAGE_OPTIONS,
  HOME_SHELF_ADMIN_TABS,
  HOME_SHELF_ADMIN_TAB_FIELDS,
  homeRestAdIntegrationFromToggle,
  homeShelfAdminImageDisplayValue,
  homeShelfEmptyCandidateReason,
  normalizeHomeShelfAdIntegrationForSave,
  syncHomePaidAdInsertionRail,
  type HomeShelfAdminFieldKey,
} from "@/lib/stores/product/stores-home-shelf-admin-tabs";
import { presentationsAllowedForDataSource } from "@/lib/stores/product/stores-home-data-source";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

function draft(shelfId: string): AdminHomeDraftShelf {
  const shelf = resolveHomeShelfProductCatalog([]).find((s) => s.shelfId === shelfId);
  if (!shelf) throw new Error(`missing shelf ${shelfId}`);
  return { ...shelf, draftMax: shelf.max == null ? "" : String(shelf.max), draftOrder: String(shelf.order) };
}

function renderTab(shelf: AdminHomeDraftShelf, tab: (typeof HOME_SHELF_ADMIN_TABS)[number]["id"], candidateCount = 3) {
  return renderToStaticMarkup(
    <AdminHomeShelfTabFields
      shelf={shelf}
      tab={tab}
      onUpdate={() => {}}
      onUpdateProductConfig={() => {}}
      candidateCount={candidateCount}
      renderedCount={candidateCount}
      popularityUntilIso="2026-10-29T00:00:00.000Z"
      showAllHref={null}
    />
  );
}

function fieldKeys(html: string): string[] {
  return [...html.matchAll(/data-home-shelf-field="([a-zA-Z]+)"/g)].map((m) => m[1]!);
}

describe("HS-01 탭당 필드 1회", () => {
  it("정적 계약: 필드 키는 한 탭에만 속한다", () => {
    const all = Object.values(HOME_SHELF_ADMIN_TAB_FIELDS).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(HOME_SHELF_ADMIN_TAB_FIELDS.basic).toEqual(["titleKo", "titleEn", "subtitleKo", "subtitleEn", "enabled"]);
    expect(HOME_SHELF_ADMIN_TAB_FIELDS.data).toEqual(["dataSource", "popularityWindowDays", "max", "candidates"]);
    expect(HOME_SHELF_ADMIN_TAB_FIELDS.presentation).toEqual(["presentation", "imageSource"]);
    expect(HOME_SHELF_ADMIN_TAB_FIELDS.exposure).toEqual(["order", "schedule", "showAll"]);
    expect(HOME_SHELF_ADMIN_TAB_FIELDS.advanced).toEqual(["operatorMemo"]);
  });

  for (const shelfId of ["order_now", "rest_stores"]) {
    it(`렌더: ${shelfId} — 각 탭이 자기 필드만 1번씩 그린다`, () => {
      const shelf = draft(shelfId);
      const seen: HomeShelfAdminFieldKey[] = [];
      for (const { id } of HOME_SHELF_ADMIN_TABS) {
        const keys = fieldKeys(renderTab(shelf, id)) as HomeShelfAdminFieldKey[];
        expect(keys).toEqual([...HOME_SHELF_ADMIN_TAB_FIELDS[id]]);
        seen.push(...keys);
      }
      expect(new Set(seen).size).toBe(seen.length);
    });
  }

  it("편집기는 모든 탭에서 미리보기를 그린다 (탭 조건부 미리보기 제거)", () => {
    const src = read("components/admin/stores/AdminStoresHomeShelvesPage.tsx");
    expect(src).toContain("AdminHomeShelfTabFields");
    expect(src).not.toMatch(/tab === "basic" \|\| tab === "presentation"/);
    expect(src).toContain("AdminStoresHomeShelfLivePreview");
  });
});

describe("HS-08 후보 0 원인 안내", () => {
  it("데이터 탭은 후보 0 일 때 데이터 원인을 보여 준다", () => {
    const html = renderTab(draft("delivery_fee_benefit"), "data", 0);
    expect(html).toContain('data-home-shelf-empty-reason="delivery_fee_benefit"');
    expect(html).toContain("배달비 할인");
    expect(homeShelfEmptyCandidateReason("recommended", true)).toContain("추천 매장");
  });
});

describe("HS-03·HS-09 광고 연동 단일 기준", () => {
  it("일반 선반은 광고 선택 UI 가 없고 저장 시 off", () => {
    const html = renderTab(draft("order_now"), "coupon_ad");
    expect(html).not.toContain("sponsored_badge");
    expect(html).not.toContain('role="switch" aria-checked="true" aria-label="「더 많은 매장」');
    expect(
      normalizeHomeShelfAdIntegrationForSave({ shelfId: "order_now", composerSlot: "slot0Food", adIntegration: "sponsored_badge" })
    ).toBe("off");
    expect(
      normalizeHomeShelfAdIntegrationForSave({ shelfId: "rest_stores", composerSlot: "slot6RestStores", adIntegration: "both" })
    ).toBe("both");
  });

  it("「더 많은 매장」은 켜기/끄기 스위치 1개", () => {
    const html = renderTab(draft("rest_stores"), "coupon_ad");
    expect(html.match(/aria-label="「더 많은 매장」 광고 삽입"/g)?.length).toBe(1);
    expect(homeRestAdIntegrationFromToggle(true, "off")).toBe("sponsored_badge");
    expect(homeRestAdIntegrationFromToggle(true, "benefit_line")).toBe("benefit_line");
    expect(homeRestAdIntegrationFromToggle(false, "both")).toBe("off");
  });

  it("선반 저장 배치가 레거시 homePaidAdInsertion 레일을 같은 값으로 동기화한다", () => {
    const rows = [
      { slot: "slot6RestStores", enabled: true },
      { slot: "homePaidAdInsertion", enabled: true },
    ];
    expect(syncHomePaidAdInsertionRail(rows, "off").find((r) => r.slot === "homePaidAdInsertion")?.enabled).toBe(false);
    expect(syncHomePaidAdInsertionRail(rows, "sponsored_badge").find((r) => r.slot === "homePaidAdInsertion")?.enabled).toBe(
      true
    );
    expect(syncHomePaidAdInsertionRail(rows, undefined)).toEqual(rows);
    const route = read("app/api/admin/stores-home-shelves/route.ts");
    expect(route).toContain("normalizeHomeShelfAdIntegrationForSave");
    expect(route).toContain("syncHomePaidAdInsertionRail");
  });
});

describe("HS-04·HS-05·HS-06", () => {
  it("이미지 옵션에서 캠페인 이미지·브랜드 로고 제거, 기존 값은 같은 결과 옵션으로 표시", () => {
    expect(HOME_SHELF_ADMIN_IMAGE_OPTIONS).not.toContain("campaign_creative");
    expect(HOME_SHELF_ADMIN_IMAGE_OPTIONS).not.toContain("brand_logo");
    expect(homeShelfAdminImageDisplayValue("brand_logo")).toBe("store_profile");
    expect(homeShelfAdminImageDisplayValue("campaign_creative")).toBe("representative_product");
    const html = renderTab(draft("order_now"), "presentation");
    expect(html).not.toContain("admin_stores_home_shelves_image_brand_logo");
    expect(html).not.toContain("admin_stores_home_shelves_image_campaign_creative");
  });

  it("「더 많은 매장」 순서 칸 잠금 + 항상 마지막", () => {
    const html = renderTab(draft("rest_stores"), "exposure");
    expect(html).toContain('data-home-shelf-order-locked="1"');
    expect(html).toContain("항상 마지막");
    expect(html).not.toContain('type="number"');
    const src = read("components/admin/stores/AdminStoresHomeShelvesPage.tsx");
    expect(src).toContain("draggable={!restLocked}");
    expect(src).toContain("항상 마지막");
  });

  it("「더 많은 매장」 표현에서 평점 가로 제외", () => {
    expect(presentationsAllowedForDataSource("rest_stores")).not.toContain("high_rating_horizontal");
    expect(presentationsAllowedForDataSource("rest_stores")).toEqual([
      "timesale_vertical",
      "store_horizontal",
      "store_teaser_horizontal",
    ]);
  });
});
