import { describe, expect, it } from "vitest";
import {
  philippinesPhoneDb09,
  philippinesPhoneE164,
  philippinesPhoneLookupVariants,
  philippinesPhonesMatchForOtp,
} from "@/lib/auth/phone-otp-phone-canonical";

describe("phone-otp-phone-canonical", () => {
  it("normalizes local 09 and +63 to the same E.164", () => {
    expect(philippinesPhoneE164("09171234567")).toBe("+639171234567");
    expect(philippinesPhoneE164("+63 917 123 4567")).toBe("+639171234567");
  });

  it("stores db09 for both input formats", () => {
    expect(philippinesPhoneDb09("+639171234567")).toBe("09171234567");
    expect(philippinesPhoneDb09("09171234567")).toBe("09171234567");
  });

  it("matches otp phones across 09 and +63", () => {
    expect(philippinesPhonesMatchForOtp("09171234567", "+639171234567")).toBe(true);
    expect(philippinesPhonesMatchForOtp("+639171234567", "09179999999")).toBe(false);
  });

  it("collects lookup variants for duplicate checks", () => {
    expect(philippinesPhoneLookupVariants("09171234567").sort()).toEqual(
      ["+639171234567", "09171234567"].sort(),
    );
  });
});
