import { describe, expect, it } from "vitest";
import {
  inferAdminAuthProviderFromSyntheticEmail,
  resolveAdminAuthProvider,
} from "@/lib/admin-users/resolve-admin-auth-provider";

describe("inferAdminAuthProviderFromSyntheticEmail", () => {
  it("maps native synthetic domains to SNS providers", () => {
    expect(
      inferAdminAuthProviderFromSyntheticEmail(
        "google.107373086399795697553@google.native.dibay.internal",
      ),
    ).toBe("google");
    expect(inferAdminAuthProviderFromSyntheticEmail("kakao.4944733937@kakao.native.dibay.internal")).toBe(
      "kakao",
    );
    expect(inferAdminAuthProviderFromSyntheticEmail("apple.sub@apple.native.dibay.internal")).toBe("apple");
    expect(inferAdminAuthProviderFromSyntheticEmail("user@gmail.com")).toBeNull();
  });
});

describe("resolveAdminAuthProvider", () => {
  it("prefers profile auth_provider over Supabase email identity for native Google", () => {
    expect(
      resolveAdminAuthProvider({
        authUser: {
          email: "google.107373086399795697553@google.native.dibay.internal",
          identities: [{ provider: "email" }],
          user_metadata: { provider: "google" },
        },
        profile: { auth_provider: "google", provider: "google" },
      }),
    ).toBe("google");
  });

  it("infers Google/Kakao from synthetic auth email when profile is empty", () => {
    expect(
      resolveAdminAuthProvider({
        authUser: {
          email: "google.102331570787821363519@google.native.dibay.internal",
          identities: [{ provider: "email" }],
        },
        profile: { auth_provider: null, provider: null },
      }),
    ).toBe("google");

    expect(
      resolveAdminAuthProvider({
        authUser: {
          email: "kakao.4943313369@kakao.native.dibay.internal",
          identities: [{ provider: "email" }],
        },
        profile: null,
      }),
    ).toBe("kakao");
  });

  it("uses linked user_auth_identities before generic email fallback", () => {
    expect(
      resolveAdminAuthProvider({
        authUser: {
          email: "google.100476010924728947859@google.native.dibay.internal",
          identities: [{ provider: "email" }],
        },
        profile: null,
        linkedProviders: ["google"],
      }),
    ).toBe("google");
  });

  it("keeps real email signups as email", () => {
    expect(
      resolveAdminAuthProvider({
        authUser: {
          email: "member@example.com",
          identities: [{ provider: "email" }],
        },
        profile: { auth_provider: "email", provider: "email" },
      }),
    ).toBe("email");
  });

  it("prefers OAuth google identity for web signups", () => {
    expect(
      resolveAdminAuthProvider({
        authUser: {
          email: "samarketcha01@gmail.com",
          identities: [{ provider: "google" }],
        },
        profile: { auth_provider: "google", provider: "google" },
      }),
    ).toBe("google");
  });

  it("returns manual for admin test users", () => {
    expect(
      resolveAdminAuthProvider({
        isManualTestUser: true,
        authUser: { email: "ops@example.com", identities: [{ provider: "email" }] },
      }),
    ).toBe("manual");
  });

  it("classifies legacy kakao profile with synthetic profiles.email as kakao", () => {
    expect(
      resolveAdminAuthProvider({
        authUser: {
          email: "kakao.4944733937@kakao.native.dibay.internal",
          identities: [{ provider: "email" }],
        },
        profile: {
          email: "kakao.4944733937@kakao.native.dibay.internal",
          auth_provider: "email",
          provider: "email",
          provider_user_id: "4944733937",
        },
      }),
    ).toBe("kakao");
  });
});
