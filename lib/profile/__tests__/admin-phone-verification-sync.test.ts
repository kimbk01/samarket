import { describe, expect, it } from "vitest";
import {
  buildPhoneVerifiedMemberPatch,
  buildPhoneVerificationResetPatch,
  formatProfilePhoneForDisplay,
} from "@/lib/profile/admin-phone-verification-sync";

describe("admin-phone-verification-sync", () => {
  it("buildPhoneVerifiedMemberPatch mirrors OTP verify member fields", () => {
    const patch = buildPhoneVerifiedMemberPatch({
      method: "admin_manual",
      phoneRow: { phone: null, phone_country_code: "+63", phone_number: "9000000000" },
      nowIso: "2026-06-15T00:00:00.000Z",
    });
    expect(patch).toMatchObject({
      phone_verified: true,
      phone_verification_status: "verified",
      phone_verification_method: "admin_manual",
      member_status: "active",
      status: "verified_user",
      preferred_country: "PH",
      phone: "09000000000",
      phone_country_code: "+63",
      phone_number: "9000000000",
    });
  });

  it("formatProfilePhoneForDisplay renders +63 example from phone_number only", () => {
    expect(
      formatProfilePhoneForDisplay({
        phone: null,
        phone_country_code: "+63",
        phone_number: "9000000000",
      }),
    ).toBe("+63 900 000 0000");
  });

  it("buildPhoneVerificationResetPatch clears verified state", () => {
    expect(buildPhoneVerificationResetPatch("2026-06-15T00:00:00.000Z")).toMatchObject({
      phone_verified: false,
      phone_verification_status: "unverified",
      member_status: "pending",
    });
  });
});
