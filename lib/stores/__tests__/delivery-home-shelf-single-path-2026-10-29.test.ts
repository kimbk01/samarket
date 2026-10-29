/**
 * 2단계 홈 선반 단일화 (Owner 2026-10-29) — 소스 판정 1함수 · 배정 1함수 + 진단 · 레거시 경로 삭제 ·
 * 미리보기 = 고객 렌더 · 카드 매퍼 1개 · 숨김 사유는 실제 이유만.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  allocateHomeFoodShelf,
  composeStoresHomeFeedWithDiagnostics,
} from "@/lib/stores/stores-home-composer";
import { allocateHomeShelvesForAdmin } from "@/lib/stores/product/stores-home-shelf-draft-allocation";
import { resolveHomeShelfProductCatalog } from "@/lib/stores/product/stores-home-shelf-product-resolve";
import { storeHomeFeedItemToShelfEntry } from "@/lib/stores/product/stores-home-store-to-shelf-entry";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function item(id: string, over: Partial<StoreHomeFeedItem> = {}): StoreHomeFeedItem {
  return {
    id, slug: id, nameKo: id, tagline: null, primarySlug: "restaurant", primaryNameKo: "음식", regionLabel: "Manila",
    status: "open", rating: 0, reviewCount: 0, deliveryAvailable: true, pickupAvailable: true, minOrderLabel: null,
    estPrepLabel: "20분", prepMinutes: 20, rideMinutes: null, etaLabel: "약 25분", deliveryFeeLabel: null,
    deliveryFeeStrikePhp: null, paymentMethodsLine: "", distanceKm: null,
    featuredItems: [{ productId: `p-${id}`, name: "메뉴", price: 100 }], profileImageUrl: null, isFeatured: false,
    commerce: {
      minOrderPhp: null, deliveryFeePhp: null, freeDeliveryOverPhp: null, deliveryCourierLabel: null, deliveryFeeMode: null,
      deliveryFeeStrikeReferencePhp: null, prepMinutes: 20, estPrepLabel: "20분", deliveryRideDisplayManual: null,
      paymentMethodsLegacy: null, paymentMethodsConfig: null,
    },
    firstListedAt: null,
    ...over,
  };
}

describe("배정 1함수 + 진단", () => {
  it("후보 수·대표 메뉴 없음·배정 수를 같은 계산에서", () => {
    const pool = [item("a", { isFeatured: true }), item("b", { isFeatured: true, featuredItems: [] }), item("c")];
    const r = allocateHomeFoodShelf(pool, "recommended", 20, Date.now());
    expect(r.entries.map((e) => e.storeId)).toEqual(["a"]);
    expect(r.diagnostics).toEqual({ candidateCount: 2, noProductCount: 1, max: 20, allocatedCount: 1 });
  });

  it("관리자 숨김 사유 = 실제 이유 (「위 선반이 먼저 노출」 없음)", () => {
    const shelves = resolveHomeShelfProductCatalog([]);
    const alloc = allocateHomeShelvesForAdmin([item("x", { featuredItems: [] })], null, shelves);
    const orderNow = shelves.find((s) => s.composerSlot === "slot0Food")!;
    expect(alloc[orderNow.shelfId]?.hiddenReason).toBe("no_product");
    const recommended = shelves.find((s) => s.composerSlot === "slot5Food")!;
    expect(alloc[recommended.shelfId]?.hiddenReason).toBe("empty_candidate");
    expect(read("components/admin/stores/AdminStoresHomeShelvesPage.tsx")).not.toContain("위 선반이 같은 매장을 먼저 노출");
    expect(read("lib/stores/product/stores-home-shelf-draft-allocation.ts")).not.toContain("preemptedByUpperShelves");
  });

  it("진단과 구성 결과가 같은 실행에서 나온다", () => {
    const { composition, diagnostics } = composeStoresHomeFeedWithDiagnostics([item("a"), item("b")]);
    expect(diagnostics.slot0Food?.allocatedCount).toBe(composition.slot0Food.length);
    expect(diagnostics.slot6RestStores?.allocatedCount).toBe(2);
  });
});

describe("중복 구조 삭제", () => {
  it("레거시 composer·노출 레지스트리·composer 소스 필터 없음", () => {
    const src = read("lib/stores/stores-home-composer.ts");
    for (const gone of [
      "composeStoresHomeFeedLegacy",
      "SourceInstanceProductGate",
      "rotateAvoidAdjacentFirst",
      "deprioritizeByRoles",
      "hasDeliveryFeeStrikeEvidence",
      "isTopRatedCandidate",
      "isNormalListEligible",
      "OOR allowed",
    ]) {
      expect(src, gone).not.toContain(gone);
    }
    expect(existsSync(join(process.cwd(), "lib/stores/stores-home-exposure-registry.ts"))).toBe(false);
  });

  it("매장→카드 매퍼 1개 — 매장형 카드에도 샘플 배지", () => {
    expect(storeHomeFeedItemToShelfEntry(item("s", { isSample: true })).isSample).toBe(true);
    for (const f of [
      "lib/stores/stores-home-feed-sections.ts",
      "lib/stores/product/stores-home-store-to-shelf-entry.ts",
    ]) {
      expect(read(f), f).toContain("storeToHomeFoodEntry(");
    }
  });
});

describe("미리보기 = 고객 렌더", () => {
  it("고객 섹션 컴포넌트를 그대로 쓰고 자체 카드 분기·별도 fetch 없음", () => {
    const src = read("components/admin/stores/AdminStoresHomeShelfLivePreview.tsx");
    expect(src).toContain("<StoresHomeCompositionSlotSection");
    expect(src).not.toContain("fetch(");
    expect(src).not.toContain("StoresHomeFoodCard");
  });
});

describe("기본 부제는 슬롯 기본 소스일 때만", () => {
  it("다른 소스를 고르면 슬롯 기본 부제를 붙이지 않는다", () => {
    const [def] = resolveHomeShelfProductCatalog([]).filter((s) => s.composerSlot === "slot0Food");
    expect(def?.subtitleKo).toBeTruthy();
    const [changed] = resolveHomeShelfProductCatalog([
      { shelfId: def!.shelfId, productConfig: { dataSource: "new_store" } },
    ]).filter((s) => s.composerSlot === "slot0Food");
    expect(changed?.subtitleKo).toBeNull();
  });
});
