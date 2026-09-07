import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import {
  canAcceptCartDeliverySelectionId,
  findCartMasterDeliveryAddress,
  isCartDeliverySelectionValid,
  resolveCartDefaultDeliverySelectionId,
  userAddressDeliverySelectionId,
  PROFILE_DELIVERY_SELECTION_ID,
} from "@/lib/store-commerce/delivery-address-book";

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
    province: "Metro Manila",
    cityMunicipality: "Manila",
    barangay: "Malate",
    district: null,
    streetAddress: null,
    buildingName: null,
    unitFloorRoom: null,
    landmark: null,
    latitude: 14.55,
    longitude: 121.03,
    placeId: null,
    formattedAddress: null,
    roadAddress: null,
    detailAddress: null,
    deliveryNote: null,
    fullAddress: null,
    neighborhoodName: null,
    appRegionId: null,
    appCityId: null,
    useForLife: true,
    useForTrade: true,
    useForDelivery: true,
    isDefaultMaster: partial.isDefaultMaster ?? false,
    isDefaultLife: false,
    isDefaultTrade: false,
    isDefaultDelivery: partial.isDefaultDelivery ?? false,
    isActive: true,
    sortOrder: 0,
    lastUsedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("CUT 6 Delivery checkout address authority (OPTION A)", () => {
  it("AUDIT: cart UI filters radios to isDefaultMaster only", () => {
    const src = readFileSync(
      join(process.cwd(), "components/stores/StoreCommerceCartPageClient.tsx"),
      "utf8",
    );
    expect(src).toMatch(/\.filter\(\(a\) => a\.isDefaultMaster/);
    expect(src).toContain("canAcceptCartDeliverySelectionId");
    expect(src).toContain("findCartMasterDeliveryAddress");
  });

  it("AUDIT: order create enforces master-only", () => {
    const orders = readFileSync(join(process.cwd(), "app/api/me/store-orders/route.ts"), "utf8");
    expect(orders).toContain("pickAddressRowForDeliveryRouting");
    expect(orders).toContain("delivery_user_address_not_master");
  });

  it("AUDIT: checkout-contact default_delivery is master", () => {
    const src = readFileSync(join(process.cwd(), "app/api/me/checkout-contact/route.ts"), "utf8");
    expect(src).toContain("pickAddressRowForDeliveryRouting");
    expect(src).toContain("is_default_master");
  });

  it("AUDIT: delivery-eta requires active master for address id", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/stores/[slug]/delivery-eta/route.ts"),
      "utf8",
    );
    expect(src).toContain("is_default_master");
    expect(src).toContain("delivery_user_address_not_master");
  });

  it("AUDIT: serviceability uses server master (no client address id)", () => {
    const client = readFileSync(
      join(process.cwd(), "lib/stores/fetch-store-delivery-serviceability-client.ts"),
      "utf8",
    );
    expect(client).not.toContain("user_address_id");
    const route = readFileSync(
      join(process.cwd(), "app/api/stores/[slug]/delivery-serviceability/route.ts"),
      "utf8",
    );
    expect(route).toContain("getUserAddressDefaults");
    expect(route).toContain("isDeliveryRoutableMasterAddress");
  });

  it("rejects non-master selection; accepts master / profile", () => {
    const master = addr({ id: "m1", isDefaultMaster: true });
    const other = addr({ id: "d1", isDefaultDelivery: true });
    const list = [master, other];
    expect(canAcceptCartDeliverySelectionId(userAddressDeliverySelectionId("d1"), list, null)).toBe(
      false,
    );
    expect(canAcceptCartDeliverySelectionId(userAddressDeliverySelectionId("m1"), list, null)).toBe(
      true,
    );
    expect(
      canAcceptCartDeliverySelectionId(PROFILE_DELIVERY_SELECTION_ID, list, {
        userAddressId: "m1",
      }),
    ).toBe(true);
    expect(findCartMasterDeliveryAddress(list)?.id).toBe("m1");
    expect(resolveCartDefaultDeliverySelectionId(list, { userAddressId: "m1" })).toBe(
      PROFILE_DELIVERY_SELECTION_ID,
    );
    expect(isCartDeliverySelectionValid(userAddressDeliverySelectionId("d1"), list, null)).toBe(
      false,
    );
  });

  it("cart selection does not patch isDefaultMaster", () => {
    const src = readFileSync(
      join(process.cwd(), "components/stores/StoreCommerceCartPageClient.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/isDefaultMaster:\s*true/);
    expect(src).not.toContain("setAsRepresentative");
  });

  it("CUT 4/5 discovery locks remain outside cart file", () => {
    const browse = readFileSync(
      join(process.cwd(), "lib/stores/browse-list-user-origin-coords.ts"),
      "utf8",
    );
    expect(browse).toContain("REMOVED from Delivery browse authority: profiles");
    expect(browse).toContain("isDeliveryRoutableMasterAddress");
  });
});
