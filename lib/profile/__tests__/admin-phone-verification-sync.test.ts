import { describe, expect, it } from "vitest";
import {
  buildPhoneVerifiedMemberPatch,
  buildPhoneVerificationResetPatch,
  buildPhoneVerificationStatusPatch,
  formatProfilePhoneForDisplay,
  resolvePhoneVerificationDisplayStatus,
} from "@/lib/profile/admin-phone-verification-sync";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";

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

  it("pending/rejected admin decisions do not pass the phone gate (audit #8)", () => {
    for (const status of ["pending", "rejected"] as const) {
      const patch = buildPhoneVerificationStatusPatch({ status, nowIso: "2026-06-15T00:00:00.000Z" });
      expect(patch.phone_verification_method).toBeNull();
      expect(hasVerifiedPhone(patch as never)).toBe(false);
      expect(resolvePhoneVerificationDisplayStatus(patch as never)).toBe(status);
    }
  });

  it("display status follows the app gate, not the raw status column", () => {
    /** 06-11 OTP 인증 회원 — 상태 컬럼만 unverified 로 남은 과거 데이터 */
    expect(
      resolvePhoneVerificationDisplayStatus({
        phone_verified: true,
        phone_verified_at: "2026-06-11T04:31:45Z",
        phone_verification_method: "semaphore_local",
        phone_verification_status: "unverified",
      }),
    ).toBe("verified");
    expect(
      resolvePhoneVerificationDisplayStatus({
        phone_verified: false,
        phone_verification_status: "verified",
        phone_verification_method: null,
      }),
    ).toBe("unverified");
  });
});
