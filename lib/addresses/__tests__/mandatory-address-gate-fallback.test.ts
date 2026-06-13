import { describe, expect, it } from "vitest";
import { isProfileGeoAddressFallbackSatisfied } from "@/lib/addresses/user-address-service";

describe("isProfileGeoAddressFallbackSatisfied", () => {
  it("accepts profile with coordinates and full_address", () => {
    expect(
      isProfileGeoAddressFallbackSatisfied({
        latitude: 14.5995,
        longitude: 120.9842,
        full_address: "Manila, Metro Manila, Philippines",
      }),
    ).toBe(true);
  });

  it("rejects missing coordinates or address", () => {
    expect(
      isProfileGeoAddressFallbackSatisfied({
        latitude: 14.5995,
        longitude: null,
        full_address: "Manila",
      }),
    ).toBe(false);
    expect(
      isProfileGeoAddressFallbackSatisfied({
        latitude: 14.5995,
        longitude: 120.9842,
        full_address: "",
      }),
    ).toBe(false);
  });
});
