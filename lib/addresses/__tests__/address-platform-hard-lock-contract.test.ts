import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isCanonicalDefaultAddressSnapshotComplete,
  isCanonicalDefaultMasterPresent,
} from "@/lib/addresses/canonical-default-address";
import { buildExplorationRegionSubtitleLine, buildTradePublicLine } from "@/lib/addresses/user-address-format";
import { toPublicUserAddressApiError } from "@/lib/addresses/user-address-api-error-i18n";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function addr(partial: Partial<UserAddressDTO> & { id: string }): UserAddressDTO {
  return {
    id: partial.id,
    userId: "u1",
    labelType: "home",
    linkedStoreId: null,
    nickname: null,
    recipientName: null,
    phoneNumber: null,
    countryCode: "PH",
    countryName: "Philippines",
    province: partial.province ?? "Metro Manila",
    cityMunicipality: partial.cityMunicipality ?? "Quezon City",
    barangay: partial.barangay ?? "Diliman",
    district: null,
    streetAddress: null,
    buildingName: partial.buildingName ?? "Commonwealth Tower",
    unitFloorRoom: partial.unitFloorRoom ?? null,
    landmark: null,
    latitude: null,
    longitude: null,
    placeId: null,
    formattedAddress: partial.formattedAddress ?? "Commonwealth Avenue, Quezon City",
    roadAddress: partial.roadAddress ?? null,
    detailAddress: partial.detailAddress ?? null,
    deliveryNote: null,
    fullAddress: partial.fullAddress ?? null,
    neighborhoodName: partial.neighborhoodName ?? null,
    appRegionId: "ncr",
    appCityId: "quezon",
    useForLife: true,
    useForTrade: true,
    useForDelivery: true,
    isDefaultMaster: partial.isDefaultMaster ?? false,
    isDefaultLife: false,
    isDefaultTrade: false,
    isDefaultDelivery: false,
    isActive: true,
    sortOrder: 0,
    lastUsedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("ADDR-001 ADDRESS_COMPLETE", () => {
  it("profile geo / region / non-master → incomplete; master present → complete", () => {
    expect(isCanonicalDefaultMasterPresent(null)).toBe(false);
    expect(isCanonicalDefaultMasterPresent({ master: null })).toBe(false);
    expect(isCanonicalDefaultAddressSnapshotComplete({ ok: true, defaults: { master: null } })).toBe(false);
    expect(isCanonicalDefaultAddressSnapshotComplete({ ok: true, defaults: { master: { id: "m1" } } })).toBe(true);
  });
});

describe("ADDR-002 / ADDR-012 GET is not a writer", () => {
  it("listUserAddresses has no update/repair", () => {
    const src = read("lib/addresses/user-address-service.ts");
    expect(src).toMatch(/READ ONLY\. GET must not invent a master/);
    const listFn = src.slice(src.indexOf("export async function listUserAddresses"));
    const listBody = listFn.slice(0, listFn.indexOf("async function repairStoreLinkedMasterAfterWrite"));
    expect(listBody).not.toMatch(/\.update\(/);
    expect(listBody).not.toMatch(/\.insert\(/);
    expect(listBody).not.toMatch(/repairStoreLinkedMasterWhenGeneralAddressExists/);
  });

  it("address-defaults GET does not mutate", () => {
    const src = read("app/api/me/address-defaults/route.ts");
    expect(src).toContain("getUserAddressDefaults");
    expect(src).not.toMatch(/createUserAddress|updateUserAddress|setUserAddressAsDefault/);
    expect(src).toContain('error: "login_required"');
  });
});

describe("ADDR-003 / ADDR-014 master contract", () => {
  it("create does not steal master on second address", () => {
    const src = read("lib/addresses/user-address-service.ts");
    const createFn = src.slice(src.indexOf("export async function createUserAddress"));
    const createBody = createFn.slice(0, src.indexOf("export async function updateUserAddress") - src.indexOf("export async function createUserAddress"));
    expect(createBody).toContain("ensureSomeoneDefaultIfFirst");
    expect(createBody).not.toContain("promoteLastSavedAddressAsPrimaryIfAllowed");
    expect(createBody).toContain("userAddressInsertPayloadWithoutDefaultFlags");
    expect(read("components/addresses/AddressEditorSheet.tsx")).not.toContain("promoteAsLastSavedPrimary");
    expect(read("lib/addresses/user-address-types.ts")).not.toContain("promoteAsLastSavedPrimary");
    expect(read("lib/addresses/address-api-validation.ts")).not.toContain("promoteAsLastSavedPrimary");
  });

  it("management 대표 badge is isDefaultMaster only", () => {
    const src = read("components/addresses/AddressListRowBody.tsx");
    expect(src).toContain("addr_v2_current_address");
    expect(src).toMatch(/row\.isDefaultMaster \?/);
  });
});

describe("ADDR-005 public region no detail leak", () => {
  it("exploration and trade public lines drop unit/floor/room", () => {
    const row = addr({
      id: "m1",
      detailAddress: "Unit 1203 / Room 4",
      unitFloorRoom: "Unit 1203",
      formattedAddress: "Commonwealth Avenue, Quezon City",
    });
    const region = buildExplorationRegionSubtitleLine(row) ?? "";
    const trade = buildTradePublicLine(row);
    expect(region).not.toMatch(/Unit 1203|Room 4/i);
    expect(trade).not.toMatch(/Unit 1203|Room 4/i);
  });
});

describe("ADDRESS BOOK COMPACT FLOW SSOT", () => {
  it("owner list surfaces share AddressUserRowLineText + formatAddressBookLine", () => {
    const listBody = read("components/addresses/AddressListRowBody.tsx");
    const philife = read("components/philife/PhilifeHeaderAddressMenuButton.tsx");
    const cart = read("components/stores/cart/StoreCartCheckoutAddressRowBody.tsx");
    const picker = read("components/addresses/AddressBookPickerList.tsx");
    expect(listBody).toContain("resolveCanonicalDisplayLines");
    expect(listBody).toContain("displayInputFromDto");
    expect(philife).toContain("buildMypageAddressesHrefFromPath");
    expect(cart).toContain("AddressUserRowLineText");
    expect(picker).toContain("AddressListRowBody");
    expect(read("lib/addresses/format-user-address-list-line.ts")).toContain("formatAddressBookLine");
    expect(read("lib/addresses/address-book-line.ts")).toContain("ADDRESS BOOK COMPACT FLOW SSOT");
  });

  it("owner row UI forbids nowrap / truncate / line-clamp on address compact flow", () => {
    const phCard = read("components/addresses/AddressPhCardLineText.tsx");
    const listBody = read("components/addresses/AddressListRowBody.tsx");
    const cart = read("components/stores/cart/StoreCartCheckoutAddressRowBody.tsx");
    const classAttr = /className=(?:\{`[^`]*`|\{"[^"]*"|'[^']*'|"[^"]*")/g;
    for (const [name, src] of [
      ["AddressPhCardLineText", phCard],
      ["AddressListRowBody", listBody],
      ["StoreCartCheckoutAddressRowBody", cart],
    ] as const) {
      const attrs = src.match(classAttr) ?? [];
      for (const a of attrs) {
        expect(a, name).not.toMatch(/\b(truncate|whitespace-nowrap|line-clamp-\d+)\b/);
      }
    }
    expect(phCard).toContain("whitespace-normal");
    expect(phCard).toContain("break-words");
    expect(phCard).toMatch(/\binline\b/);
  });

  it("product address entry surfaces use the single /mypage/addresses book", () => {
    const myInfo = read("components/mypage/myinfo/RequiredInfoList.tsx");
    const mySummary = read("components/mypage/home/MypageRequiredInfoSummary.tsx");
    const profileSettings = read("components/mypage/profile-settings/ProfileSettingsSheet.tsx");
    const storesHome = read("components/stores/home/hub/StoresHomeHeaderChrome.tsx");
    const storesBrowse = read("components/stores/browse/StoresBrowseHeaderChrome.tsx");
    const philife = read("components/philife/PhilifeHeaderAddressMenuButton.tsx");
    const myPageItem = read("components/mypage/MyPageItemScreen.tsx");
    const storeTab = read("components/mypage/tabs/StoreTab.tsx");
    const settingsTab = read("components/mypage/tabs/SettingsTab.tsx");

    for (const [name, src] of [
      ["RequiredInfoList", myInfo],
      ["MypageRequiredInfoSummary", mySummary],
      ["ProfileSettingsSheet", profileSettings],
      ["StoresHomeHeaderChrome", storesHome],
      ["StoresBrowseHeaderChrome", storesBrowse],
      ["PhilifeHeaderAddressMenuButton", philife],
      ["MyPageItemScreen", myPageItem],
      ["StoreTab", storeTab],
      ["SettingsTab", settingsTab],
    ] as const) {
      expect(src, name).toMatch(/buildMypageAddressesHref|\/mypage\/addresses/);
      expect(src, name).not.toContain("openSheet(\"address\")");
      expect(src, name).not.toContain("AddressManagementClient embedded");
      expect(src, name).not.toContain("StoresHomeAddressSheet");
      expect(src, name).not.toContain("MypageAddressSheet");
    }
  });

  it("trade write location uses master address SSOT, not local region pickers", () => {
    const tradeLocation = read("components/write/shared/TradeDefaultLocationBlock.tsx");
    expect(tradeLocation).toContain("resolveCanonicalChipLineFromDto");
    expect(tradeLocation).toContain("buildMypageAddressesHrefFromPath");
    expect(tradeLocation).toContain("router.push(addressesHref)");
    expect(tradeLocation).toContain("defaults?.master");
    expect(tradeLocation).toContain("SAMARKET_ADDRESSES_UPDATED_EVENT");
    expect(tradeLocation).not.toContain("defaults?.trade");
    expect(tradeLocation).not.toContain("neighborhoodFromLife");
    expect(tradeLocation).not.toContain("buildExplorationRegionSubtitleLine");
    expect(tradeLocation).not.toContain("AddressBookPickerList");
    expect(tradeLocation).not.toContain("trade_write_location_select_region");
    expect(tradeLocation).not.toContain("trade_write_manage_addresses");
    expect(tradeLocation).not.toContain("createPortal");
  });
});

describe("ADDR-006 / ADDR-007 / ADDR-015 order snapshot", () => {
  it("order create copies delivery detail; member writers do not resync orders", () => {
    const orders = read("app/api/me/store-orders/route.ts");
    expect(orders).toMatch(/delivery_detail_address_required/);
    expect(orders).toMatch(/delivery_detail_address/);
    expect(orders).toMatch(/delivery_formatted_address/);
    expect(read("app/api/me/addresses/route.ts")).not.toContain("refreshStoreOrdersCheckoutGeoAfterUserAddressUpdated");
    expect(read("app/api/me/addresses/[id]/route.ts")).not.toContain(
      "refreshStoreOrdersCheckoutGeoAfterUserAddressUpdated",
    );
    const sync = read("lib/stores/sync-store-orders-checkout-geo.ts");
    expect(sync).not.toContain("export async function refreshStoreOrdersCheckoutGeoAfterUserAddressUpdated");
    expect(sync).toContain("deliverySnapshotLat");
    expect(sync).toMatch(/배달 주소 스냅샷/);
  });
});

describe("ADDR-004 / ADDR-010 google + writer layer", () => {
  it("member writes go through user-address-service; Google AutocompleteService remains", () => {
    const post = read("app/api/me/addresses/route.ts");
    expect(post).toContain("createUserAddress");
    expect(read("app/api/me/addresses/[id]/route.ts")).toContain("updateUserAddress");
    expect(read("app/api/me/addresses/[id]/route.ts")).toContain("deleteUserAddress");
    expect(read("lib/addresses/ph-google-place-address-components.ts")).toContain("parsePhFromGooglePlaceResult");
    expect(read("lib/addresses/reverse-geocode-ph-client.ts")).toContain("parsePhFromGooglePlaceResult");
    expect(read("lib/addresses/map-user-address-to-app-location.ts")).toContain("mapUserAddressToAppLocation");
    expect(read("lib/addresses/infer-app-location-from-user-address.ts")).toContain("mapUserAddressToAppLocation");
  });
});

describe("ADDR-008 store vs member", () => {
  it("store address columns live on stores, not user_addresses fallback", () => {
    const src = read("lib/addresses/address-source-architecture.ts");
    expect(src).toContain("STORE ADDRESS");
    expect(src).toContain("stores");
    expect(src).toMatch(/Not a `user_addresses` row/);
  });
});

describe("ADDR-011 error contract", () => {
  it("23505 and raw postgres are not public API errors", () => {
    const svc = read("lib/addresses/user-address-service.ts");
    expect(svc).toContain('throw new Error("address_default_conflict")');
    expect(toPublicUserAddressApiError("duplicate key value violates unique constraint", "address_create_failed")).toBe(
      "address_create_failed",
    );
    expect(toPublicUserAddressApiError("address_default_conflict", "address_create_failed")).toBe(
      "address_default_conflict",
    );
    expect(read("app/api/me/addresses/route.ts")).toContain("toPublicUserAddressApiError");
  });

  it("shop-link writer throws codes, not Korean/raw DB", () => {
    const shop = read("lib/addresses/resolve-user-address-shop-write.ts");
    expect(shop).toContain("shop_store_required");
    expect(shop).toContain("shop_owner_required");
    expect(shop).toContain("shop_place_required");
    expect(shop).not.toContain("매장을 선택해 주세요.");
    expect(shop).not.toContain("승인된 매장 오너만");
    expect(shop).not.toContain("throw new Error(error.message)");
  });
});

describe("ADDR-003 last delete", () => {
  it("last active address may be deleted so ADDRESS_COMPLETE can become false", () => {
    const src = read("lib/addresses/user-address-service.ts");
    const del = src.slice(src.indexOf("export async function deleteUserAddress"));
    expect(del).not.toContain("last_address_cannot_delete");
  });
});

describe("ADDR-013 Address Platform V2", () => {
  it("member edit page uses AddressPlatformDetailClient, not FineTune modal", () => {
    expect(read("components/addresses/AddressEditorPageClient.tsx")).toContain("AddressPlatformDetailClient");
    expect(read("components/addresses/AddressEditorPageClient.tsx")).not.toContain("AddressEditorSheet");
    expect(read("components/addresses/AddressPlatformDetailClient.tsx")).not.toContain("AddressFineTuneSheet");
  });

  it("reopen hydrates user detail from saved row even when a canonical draft exists", () => {
    const src = read("components/addresses/AddressPlatformDetailClient.tsx");
    expect(src).toContain("userFieldsHydratedRef");
    expect(src).toContain("initial.detailAddress ?? initial.unitFloorRoom");
    const draftBlock = src.slice(src.indexOf("if (props.draft)"), src.indexOf("if (mode === \"edit\""));
    expect(draftBlock).not.toContain("return;");
  });

  it("AddressSelect pin reverse-geocode keeps the selected Place as preferred", () => {
    const src = read("components/map/AddressSelectClient.tsx");
    expect(src).toContain("preferredRef");
    expect(src).toContain("resolveCanonicalAddressFromLatLng");
    expect(src).toContain("preferredRef.current");
  });

  it("Search → Detail draft is peeked, not consumed, before the address list fetch", () => {
    const src = read("components/addresses/AddressEditorPageClient.tsx");
    expect(src).toContain("readAddressPlatformV2Draft");
    expect(src).toContain("clearAddressPlatformV2Draft");
    expect(src).not.toContain("consumeAddressPlatformV2Draft");
    expect(read("lib/addresses/canonical-address-draft-storage.ts")).not.toContain(
      "export function consumeAddressPlatformV2Draft",
    );
    expect(src).toContain("shouldRedirectCreateDetailToSearch");
    const effect = src.slice(src.indexOf("useEffect(() => {"));
    expect(effect.indexOf("readAddressPlatformV2Draft")).toBeLessThan(
      effect.indexOf("fetchMeAddressesListSingleFlight"),
    );
    const hydrate = effect.slice(0, effect.indexOf("fetchMeAddressesListSingleFlight"));
    expect(hydrate).toContain("setBootstrapping(false)");
  });
});

describe("master ≠ delivery contract", () => {
  it("set-as-representative PATCH is isDefaultMaster only", () => {
    const mgmt = read("components/addresses/AddressManagementClient.tsx");
    const setAs = mgmt.slice(mgmt.indexOf("async function setAsRepresentative"));
    const body = setAs.slice(0, setAs.indexOf("async function setAsDelivery"));
    expect(body).toContain("isDefaultMaster: true");
    expect(body).not.toContain("isDefaultLife: true");
    expect(body).not.toContain("isDefaultTrade: true");
    expect(body).not.toContain("isDefaultDelivery: true");
  });

  it("pickAddressRowForDeliveryRouting is delivery only", () => {
    const src = read("lib/addresses/user-address-service.ts");
    const fn = src.slice(src.indexOf("export function pickAddressRowForDeliveryRouting"));
    const body = fn.slice(0, fn.indexOf("export type BulkRegionPatchResolvedLocation"));
    expect(body).toContain("defs.delivery");
    expect(body).not.toContain("defs.master");
    expect(body).not.toContain("defs.trade");
    expect(body).not.toContain("defs.life");
  });
});
