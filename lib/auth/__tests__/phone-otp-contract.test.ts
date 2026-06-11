import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isValidPhoneOtpCodeInput,
  PHONE_OTP_CODE_LENGTH,
  PHONE_OTP_CODE_RE,
} from "@/lib/auth/phone-otp-contract";

const ROOT = process.cwd();

function readRepoFile(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf8");
}

describe("phone-otp-contract", () => {
  it("accepts exactly 6 digit codes", () => {
    expect(PHONE_OTP_CODE_LENGTH).toBe(6);
    expect(PHONE_OTP_CODE_RE.test("123456")).toBe(true);
    expect(isValidPhoneOtpCodeInput("123456")).toBe(true);
    expect(isValidPhoneOtpCodeInput("12345")).toBe(false);
    expect(isValidPhoneOtpCodeInput("1234567")).toBe(false);
    expect(isValidPhoneOtpCodeInput("12a456")).toBe(false);
  });

  it("send route does not duplicate profile phone patch after service", () => {
    const src = readRepoFile("app/api/me/phone-verification/send/route.ts");
    expect(src.includes("sendPhoneOtpForUser")).toBe(true);
    expect(src.includes("patchProfileDisplayName")).toBe(true);
    expect(src.includes('.from("profiles")')).toBe(false);
    expect(src.includes("phone_country_code")).toBe(false);
  });

  it("verify routes sync server cache after service verify", () => {
    for (const path of [
      "app/api/me/phone-verification/verify/route.ts",
      "app/api/account/phone/verify-otp/route.ts",
    ]) {
      const src = readRepoFile(path);
      expect(src.includes("verifyPhoneOtpForUser")).toBe(true);
      expect(src.includes("syncPhoneVerifiedServerCache")).toBe(true);
      expect(src.match(/from\s+["']profiles["']\s*\)\s*\.update\([\s\S]*phone_verified:\s*true/)).toBeNull();
    }
  });

  it("only phone-otp-service touches phone_otp_challenges", () => {
    const offenders = [
      "app/api/me/phone-verification/send/route.ts",
      "app/api/me/phone-verification/verify/route.ts",
      "app/api/account/phone/send-otp/route.ts",
      "app/api/account/phone/verify-otp/route.ts",
      "components/mypage/profile/PhoneVerificationBox.tsx",
      "components/my/PhoneVerificationRequestForm.tsx",
    ];
    for (const path of offenders) {
      expect(readRepoFile(path).includes("phone_otp_challenges")).toBe(false);
    }
    expect(readRepoFile("lib/auth/phone-otp-service.ts").includes("phone_otp_challenges")).toBe(true);
  });
});
