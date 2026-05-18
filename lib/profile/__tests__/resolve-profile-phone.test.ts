import { describe, expect, it } from "vitest";
import {
  hydrateProfileRowPhone,
  profilePhoneStorageFieldsFromDb09,
  resolveProfilePhoneDb09,
} from "@/lib/profile/resolve-profile-phone";

describe("resolveProfilePhoneDb09", () => {
  it("returns phone when set in 09 format", () => {
    expect(resolveProfilePhoneDb09({ phone: "09171234567" })).toBe("09171234567");
  });

  it("reconstructs from phone_number with country code", () => {
    expect(
      resolveProfilePhoneDb09({
        phone: null,
        phone_country_code: "+63",
        phone_number: "9171234567",
      })
    ).toBe("09171234567");
  });

  it("reconstructs when only phone_number has leading 0", () => {
    expect(
      resolveProfilePhoneDb09({
        phone: null,
        phone_country_code: "+63",
        phone_number: "09171234567",
      })
    ).toBe("09171234567");
  });
});

describe("profilePhoneStorageFieldsFromDb09", () => {
  it("splits 09 into phone and national number", () => {
    expect(profilePhoneStorageFieldsFromDb09("09171234567")).toEqual({
      phone: "09171234567",
      phone_country_code: "+63",
      phone_number: "9171234567",
    });
  });
});

describe("hydrateProfileRowPhone", () => {
  it("fills phone from phone_number", () => {
    const row = hydrateProfileRowPhone({
      phone: null,
      phone_country_code: "+63",
      phone_number: "9171234567",
    });
    expect(row.phone).toBe("09171234567");
    expect(row.phone_number).toBe("9171234567");
  });
});
