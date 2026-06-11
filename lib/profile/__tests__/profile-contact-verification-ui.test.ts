import { describe, expect, it } from "vitest";
import {
  isProfileContactVerified,
  resolveProfileLoginEmail,
} from "@/lib/profile/profile-contact-verification-ui";

describe("profile-contact-verification-ui", () => {
  it("resolveProfileLoginEmail prefers auth_login_email", () => {
    expect(
      resolveProfileLoginEmail({
        auth_login_email: "oauth@example.com",
        email: "legacy@example.com",
      })
    ).toBe("oauth@example.com");
  });

  it("isProfileContactVerified treats privileged admin as verified without phone", () => {
    expect(
      isProfileContactVerified({
        role: "admin",
        phone_verified: false,
        phone_verified_at: null,
        provider: "google",
        auth_provider: "google",
        email: "admin@example.com",
        auth_login_email: "admin@example.com",
      })
    ).toBe(true);
  });

  it("isProfileContactVerified requires phone for regular members", () => {
    expect(
      isProfileContactVerified({
        role: "user",
        phone_verified: false,
        phone_verified_at: null,
        provider: "google",
        auth_provider: "google",
        email: "user@example.com",
        auth_login_email: "user@example.com",
      })
    ).toBe(false);

    expect(
      isProfileContactVerified({
        role: "user",
        phone_verified: true,
        phone_verified_at: null,
        provider: "google",
        auth_provider: "google",
        email: "user@example.com",
        auth_login_email: "user@example.com",
      })
    ).toBe(true);
  });
});
