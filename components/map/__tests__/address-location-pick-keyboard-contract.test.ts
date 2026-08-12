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

  it("AddressEditorSheet uses AutocompleteService search + footer save, not Autocomplete widget", () => {
    const src = read("components/addresses/AddressEditorSheet.tsx");
    expect(src).toContain("AddressEditorLocationSearch");
    expect(src).toContain("addr_ui_save_address");
    expect(src).toContain("fetchPlacePredictionsPh");
    expect(src).not.toContain("editorPhase");
    expect(src).not.toContain("new google.maps.places.Autocomplete");
  });

  it("AddressEditorSheet modal portals above main sheet and pins to visual viewport", () => {
    const src = read("components/addresses/AddressEditorSheet.tsx");
    expect(src).toContain("BodyPortal");
    expect(src).toContain("MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS");
    expect(src).toContain("useFormKeyboardFocusVisibility");
    expect(src).toContain("visualViewportHeight");
    expect(src).toContain("visualViewportOffsetTop");
    expect(src).toContain("data-form-keyboard-surface");
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
