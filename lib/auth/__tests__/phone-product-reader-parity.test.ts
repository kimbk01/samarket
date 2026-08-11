import { describe, expect, it } from "vitest";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { hasPhilippinePhoneVerification } from "@/lib/auth/store-member-policy";

const cases = [
  { name: "empty", input: {} },
  { name: "flag", input: { phone_verified: true } },
  { name: "verified_at", input: { phone_verified: false, phone_verified_at: "2026-01-01T00:00:00.000Z" } },
  { name: "blank verified_at", input: { phone_verified: false, phone_verified_at: "   " } },
  { name: "admin_manual method", input: { phone_verified: false, phone_verification_method: "admin_manual" } },
  {
    name: "manual provider",
    input: { phone_verified: false, auth_provider: "manual_admin", email: "x@example.com" },
  },
  {
    name: "manual.local email",
    input: { phone_verified: false, auth_provider: "email", email: "ops@manual.local" },
  },
  {
    name: "unverified google",
    input: { phone_verified: false, auth_provider: "google", email: "u@gmail.com" },
  },
  {
    name: "privileged admin unverified",
    input: { phone_verified: false, privilegedAdmin: true, role: "user" },
  },
] as const;

describe("phone product reader parity", () => {
  it("hasPhilippinePhoneVerification matches hasVerifiedPhone on the product matrix", () => {
    for (const c of cases) {
      expect(hasPhilippinePhoneVerification(c.input), c.name).toBe(hasVerifiedPhone(c.input));
    }
  });
});
