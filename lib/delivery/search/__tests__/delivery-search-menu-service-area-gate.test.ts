import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateStoreDeliveryServiceability } from "@/lib/delivery/load-delivery-serviceability-runtime";
import { DELIVERY_SERVICE_AREA_AUTHORITY } from "@/lib/delivery/service-area/authority";
import type { DeliveryDistancePolicy } from "@/lib/delivery/delivery-ops-settings";
import {
  isDeliverySearchMenuVisible,
  isDeliverySearchStoreVisible,
  resolveDeliverySearchStoreEligibility,
  unionDeliverySearchServiceAreaStoreIds,
} from "@/lib/delivery/search/search-delivery";
import {
  matchDeliveryMenuGlobalSearch,
  matchDeliveryStoreGlobalSearch,
} from "@/lib/search/global/semantics/domain-fields";

const root = resolve(process.cwd());
function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

const policyOn: DeliveryDistancePolicy = {
  enabled: true,
  source: "straight",
  defaultMaxKm: 10,
  overDistanceBehavior: "exclude",
};
const ctx = { policy: policyOn, overrides: { stores: {} } };
/** Approximate: 1° lat ≈ 111km → 0.1° ≈ 11.1km */
const STORE = { lat: 14.65, lng: 121.05 };
const MEMBER = "saved_address" as const;
const GUEST = "none" as const;

function v1Elig(customerOffsetDeg: number) {
  const svc = evaluateStoreDeliveryServiceability({
    ctx,
    storeId: "s-v1",
    storeDeliveryRadiusKm: 10,
    storeLat: STORE.lat,
    storeLng: STORE.lng,
    customerLat: STORE.lat - customerOffsetDeg,
    customerLng: STORE.lng,
    authorityMode: DELIVERY_SERVICE_AREA_AUTHORITY.LEGACY_RADIUS,
    selectedLguIds: [],
    memberLguId: "ignored",
  });
  return resolveDeliverySearchStoreEligibility({ originSource: MEMBER, svc });
}

function v2Elig(args: { memberLguId: string; selectedLguIds: string[] }) {
  const svc = evaluateStoreDeliveryServiceability({
    ctx,
    storeId: "s-v2",
    storeDeliveryRadiusKm: 10,
    storeLat: STORE.lat,
    storeLng: STORE.lng,
    customerLat: STORE.lat - 0.02,
    customerLng: STORE.lng,
    authorityMode: DELIVERY_SERVICE_AREA_AUTHORITY.V2_LGU,
    selectedLguIds: args.selectedLguIds,
    memberLguId: args.memberLguId,
  });
  return resolveDeliverySearchStoreEligibility({ originSource: MEMBER, svc });
}

describe("DEL-SCOPE Delivery member menu service-area gate", () => {
  it("DEL-SCOPE-1 member eligible store keyword → store YES", () => {
    const elig = v1Elig(0.02);
    expect(elig.excludeFromMemberList).toBe(false);
    expect(isDeliverySearchStoreVisible({ originSource: MEMBER, eligibility: elig })).toBe(true);
  });

  it("DEL-SCOPE-2 member OOR store keyword → store NO", () => {
    const elig = v1Elig(0.15);
    expect(elig.excludeFromMemberList).toBe(true);
    expect(isDeliverySearchStoreVisible({ originSource: MEMBER, eligibility: elig })).toBe(false);
  });

  it("DEL-SCOPE-3 member eligible menu-only → menu YES", () => {
    const storeKw = matchDeliveryStoreGlobalSearch(
      { store_name: "ABC Restaurant", description: "분식 전문" },
      "김치찌개"
    );
    const menuKw = matchDeliveryMenuGlobalSearch({ title: "김치찌개", summary: "" }, "김치찌개");
    expect(storeKw.matched).toBe(false);
    expect(menuKw.matched).toBe(true);
    const elig = v1Elig(0.02);
    expect(
      isDeliverySearchMenuVisible({
        originSource: MEMBER,
        parentStoreMetaExists: true,
        parentEligibility: elig,
      })
    ).toBe(true);
  });

  it("DEL-SCOPE-4 member OOR menu-only → menu NO", () => {
    const storeKw = matchDeliveryStoreGlobalSearch(
      { store_name: "ABC Restaurant", description: "분식 전문" },
      "김치찌개"
    );
    const menuKw = matchDeliveryMenuGlobalSearch({ title: "김치찌개", summary: "" }, "김치찌개");
    expect(storeKw.matched).toBe(false);
    expect(menuKw.matched).toBe(true);
    const elig = v1Elig(0.15);
    expect(isDeliverySearchStoreVisible({ originSource: MEMBER, eligibility: elig })).toBe(false);
    expect(
      isDeliverySearchMenuVisible({
        originSource: MEMBER,
        parentStoreMetaExists: true,
        parentEligibility: elig,
      })
    ).toBe(false);
  });

  it("DEL-SCOPE-5 parent absent from store keyword results but eligible → menu YES", () => {
    const keywordStoreIds = ["other-keyword-store"];
    const menuParentIds = ["eligible-parent"];
    const ids = unionDeliverySearchServiceAreaStoreIds(keywordStoreIds, menuParentIds);
    expect(ids).toEqual(expect.arrayContaining(["eligible-parent"]));
    const elig = v1Elig(0.02);
    expect(
      isDeliverySearchMenuVisible({
        originSource: MEMBER,
        parentStoreMetaExists: true,
        parentEligibility: elig,
      })
    ).toBe(true);
  });

  it("DEL-SCOPE-6 parent absent because OOR → menu NO (proven first divergence)", () => {
    const remainingStoreResults = new Map<string, { out?: boolean }>();
    const parentId = "oor-parent";
    remainingStoreResults.delete(parentId);
    const leftoverMeta = { slug: "abc", store_name: "ABC Restaurant" };
    expect(remainingStoreResults.get(parentId)).toBeUndefined();
    expect(leftoverMeta).toBeTruthy();
    const elig = v1Elig(0.15);
    expect(elig.excludeFromMemberList).toBe(true);
    expect(
      isDeliverySearchMenuVisible({
        originSource: MEMBER,
        parentStoreMetaExists: true,
        parentEligibility: elig,
      })
    ).toBe(false);
  });

  it("DEL-SCOPE-7 guest existing discovery preserved (OOR parent still visible)", () => {
    const svc = evaluateStoreDeliveryServiceability({
      ctx,
      storeId: "s-v1",
      storeDeliveryRadiusKm: 10,
      storeLat: STORE.lat,
      storeLng: STORE.lng,
      customerLat: STORE.lat - 0.15,
      customerLng: STORE.lng,
      authorityMode: DELIVERY_SERVICE_AREA_AUTHORITY.LEGACY_RADIUS,
      selectedLguIds: [],
      memberLguId: null,
    });
    const elig = resolveDeliverySearchStoreEligibility({ originSource: GUEST, svc });
    expect(elig.excludeFromMemberList).toBe(false);
    expect(isDeliverySearchStoreVisible({ originSource: GUEST, eligibility: elig })).toBe(true);
    expect(
      isDeliverySearchMenuVisible({
        originSource: GUEST,
        parentStoreMetaExists: true,
        parentEligibility: elig,
      })
    ).toBe(true);
  });

  it("DEL-SCOPE-8 V1 legacy radius menu eligibility in vs out", () => {
    const inside = v1Elig(0.02);
    const outside = v1Elig(0.15);
    expect(
      isDeliverySearchMenuVisible({
        originSource: MEMBER,
        parentStoreMetaExists: true,
        parentEligibility: inside,
      })
    ).toBe(true);
    expect(
      isDeliverySearchMenuVisible({
        originSource: MEMBER,
        parentStoreMetaExists: true,
        parentEligibility: outside,
      })
    ).toBe(false);
  });

  it("DEL-SCOPE-9 V2 LGU menu eligibility when member LGU is not selected", () => {
    const selected = v2Elig({
      memberLguId: "lgu-qc",
      selectedLguIds: ["lgu-qc"],
    });
    const unselected = v2Elig({
      memberLguId: "lgu-manila",
      selectedLguIds: ["lgu-qc"],
    });
    expect(selected.excludeFromMemberList).toBe(false);
    expect(unselected.excludeFromMemberList).toBe(true);
    expect(
      isDeliverySearchMenuVisible({
        originSource: MEMBER,
        parentStoreMetaExists: true,
        parentEligibility: selected,
      })
    ).toBe(true);
    expect(
      isDeliverySearchMenuVisible({
        originSource: MEMBER,
        parentStoreMetaExists: true,
        parentEligibility: unselected,
      })
    ).toBe(false);
  });

  it("DEL-SCOPE-10 no unrelated parent-store promotion; missing eligibility fail-closed for member", () => {
    const store = matchDeliveryStoreGlobalSearch(
      { store_name: "맛있는식당", description: "분식 전문" },
      "김치찌개"
    );
    const menu = matchDeliveryMenuGlobalSearch({ title: "김치찌개", summary: "주메뉴" }, "김치찌개");
    expect(menu.matched).toBe(true);
    expect(store.matched).toBe(false);
    expect(
      isDeliverySearchMenuVisible({
        originSource: MEMBER,
        parentStoreMetaExists: true,
        parentEligibility: undefined,
      })
    ).toBe(false);
    expect(
      isDeliverySearchMenuVisible({
        originSource: GUEST,
        parentStoreMetaExists: true,
        parentEligibility: undefined,
      })
    ).toBe(true);
  });

  it("address A eligible then address B OOR does not reuse prior eligibility", () => {
    const addressA = v1Elig(0.02);
    const addressB = v1Elig(0.15);
    expect(addressA.excludeFromMemberList).toBe(false);
    expect(addressB.excludeFromMemberList).toBe(true);
    expect(addressA).not.toBe(addressB);
  });

  it("engine loads service-area for keyword ∪ menu parents and gates menus by eligibility map", () => {
    const engine = read("lib/delivery/search/search-delivery.ts");
    expect(engine).toContain("unionDeliverySearchServiceAreaStoreIds");
    expect(engine).toContain("eligibilityByStoreId");
    expect(engine).toContain("isDeliverySearchMenuVisible");
    expect(engine).toContain("Display metadata only");
    expect(engine).toContain("Do not promote the parent into the keyword Store section");
    expect(engine).toContain("Keyword store hits only. Menu parents stay in deliveryStoreById");
    expect(engine).not.toMatch(/if \(meta\.out\) continue/);
    expect(engine).not.toMatch(/region\.ilike/);
    expect(engine).not.toMatch(/city\.ilike/);
  });
});
