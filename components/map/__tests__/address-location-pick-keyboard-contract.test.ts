import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("address location pick keyboard / CTA contract", () => {
  it("AddressSelectClient map CTA uses form keyboard inset SSOT, not stacked safe-area", () => {
    const src = read("components/map/AddressSelectClient.tsx");
    expect(src).toContain("useFormKeyboardViewport");
    expect(src).toContain("data-form-keyboard-footer");
    expect(src).toContain("effectiveBottomInset");
    expect(src).not.toContain("ADDR_BOTTOM_BAR");
    expect(src).not.toMatch(/safe-area-pb/);
  });

  it("Address Platform Search uses AutocompleteService, not Autocomplete widget", () => {
    const src = read("components/addresses/AddressPlatformSearchClient.tsx");
    expect(src).toContain("AddressEditorLocationSearch");
    expect(src).toContain("fetchPlacePredictionsPh");
    expect(src).not.toContain("new google.maps.places.Autocomplete");
  });

  it("Address Platform Detail saves with footer CTA and does not host FineTune sheet", () => {
    const src = read("components/addresses/AddressPlatformDetailClient.tsx");
    /** 주소 입력 시안(2026-11-09): 일반 = 본문 안 [저장], 배달 = 키보드 위 [저장하고 배달 받기] */
    expect(src).toContain("addr_v3_save");
    expect(src).toContain("addr_v3_save_and_deliver");
    expect(src).toContain("useFormKeyboardViewport");
    expect(src).toContain('data-form-keyboard-footer="1"');
    expect(src).not.toContain("AddressFineTuneSheet");
    expect(src).not.toContain("new google.maps.places.Autocomplete");
  });

  it("AddressSearch member path uses AutocompleteService, not Autocomplete widget", () => {
    const src = read("components/map/AddressSearch.tsx");
    expect(src).toContain("fetchPlacePredictionsPh");
    expect(src).toContain("AddressEditorLocationSearch");
    expect(src).not.toContain("new google.maps.places.Autocomplete");
  });

  it("Address Platform Detail is a page surface, not a nested FineTune modal", () => {
    const src = read("components/addresses/AddressPlatformDetailClient.tsx");
    /** 지도는 저장 화면이 아니라 지도 위치 확인 단계(3번)에 있다 */
    expect(src).not.toContain("AddressFineTuneMapLazy");
    expect(read("components/addresses/AddressMapConfirmClient.tsx")).toContain("AddressCenterPinMapLazy");
    expect(src).not.toContain("AddressFineTuneSheet");
    expect(src).not.toMatch(/fixed inset-0 z-\[80\]/);
  });

  it("member address POST/PATCH do not resync in-flight store_orders destinations", () => {
    const post = read("app/api/me/addresses/route.ts");
    const patch = read("app/api/me/addresses/[id]/route.ts");
    expect(post).not.toContain("refreshStoreOrdersCheckoutGeoAfterUserAddressUpdated");
    expect(patch).not.toContain("refreshStoreOrdersCheckoutGeoAfterUserAddressUpdated");
    expect(read("lib/stores/sync-store-orders-checkout-geo.ts")).not.toContain(
      "refreshStoreOrdersCheckoutGeoAfterUserAddressUpdated",
    );
  });
});
