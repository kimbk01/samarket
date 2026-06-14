import { describe, expect, it } from "vitest";
import {
  inferProviderUserIdFromSyntheticAuthEmail,
  isAdminSyntheticAuthEmail,
  resolveAdminDisplayEmail,
  resolveAdminLoginIdentifier,
  resolveAdminProviderUserId,
} from "@/lib/admin-users/resolve-admin-user-display";

describe("isAdminSyntheticAuthEmail", () => {
  it("detects native bridge and manual auth emails", () => {
    expect(isAdminSyntheticAuthEmail("google.abc@google.native.dibay.internal")).toBe(true);
    expect(isAdminSyntheticAuthEmail("kakao.123@kakao.native.dibay.internal")).toBe(true);
    expect(isAdminSyntheticAuthEmail("apple.sub@apple.native.dibay.internal")).toBe(true);
    expect(isAdminSyntheticAuthEmail("ops01@manual.local")).toBe(true);
    expect(isAdminSyntheticAuthEmail("user@gmail.com")).toBe(false);
  });
});

describe("inferProviderUserIdFromSyntheticAuthEmail", () => {
  it("extracts provider user id from native synthetic emails", () => {
    expect(
      inferProviderUserIdFromSyntheticAuthEmail(
        "google.107373086399795697553@google.native.dibay.internal",
      ),
    ).toBe("107373086399795697553");
    expect(inferProviderUserIdFromSyntheticAuthEmail("kakao.4944733937@kakao.native.dibay.internal")).toBe(
      "4944733937",
    );
  });
});

describe("resolveAdminDisplayEmail", () => {
  it("prefers auth_login_email over synthetic auth email", () => {
    expect(
      resolveAdminDisplayEmail({
        authUser: { email: "google.abc@google.native.dibay.internal" },
        profile: {
          auth_login_email: "member@gmail.com",
          email: "google.abc@google.native.dibay.internal",
        },
        provider: "google",
      }),
    ).toBe("member@gmail.com");
  });

  it("uses metadata email hint when profile email is missing", () => {
    expect(
      resolveAdminDisplayEmail({
        authUser: {
          email: "google.abc@google.native.dibay.internal",
          user_metadata: { google_email_hint: "hint@gmail.com" },
        },
        profile: null,
        provider: "google",
      }),
    ).toBe("hint@gmail.com");
  });

  it("returns undefined when only synthetic auth email exists", () => {
    expect(
      resolveAdminDisplayEmail({
        authUser: { email: "kakao.4944733937@kakao.native.dibay.internal" },
        profile: { email: null, auth_login_email: null },
        provider: "kakao",
      }),
    ).toBeUndefined();
  });
});

describe("resolveAdminLoginIdentifier", () => {
  it("shows real gmail for native Google when auth_login_email exists", () => {
    expect(
      resolveAdminLoginIdentifier({
        provider: "google",
        authUser: {
          email: "google.107373086399795697553@google.native.dibay.internal",
          identities: [{ provider: "email" }],
        },
        profile: {
          auth_login_email: "samarketcha01@gmail.com",
          provider_user_id: "107373086399795697553",
        },
      }),
    ).toBe("samarketcha01@gmail.com");
  });

  it("falls back to provider user id when no display email for SNS", () => {
    expect(
      resolveAdminLoginIdentifier({
        provider: "kakao",
        authUser: {
          email: "kakao.4944733937@kakao.native.dibay.internal",
          identities: [{ provider: "email" }],
        },
        profile: { provider_user_id: "4944733937" },
      }),
    ).toBe("4944733937");
  });

  it("parses provider user id from synthetic auth email when profile is empty", () => {
    expect(
      resolveAdminLoginIdentifier({
        provider: "google",
        authUser: {
          email: "google.102331570787821363519@google.native.dibay.internal",
        },
        profile: null,
      }),
    ).toBe("102331570787821363519");
  });

  it("shows real email for email signups", () => {
    expect(
      resolveAdminLoginIdentifier({
        provider: "email",
        authUser: { email: "member@example.com", identities: [{ provider: "email" }] },
        profile: { email: "member@example.com" },
      }),
    ).toBe("member@example.com");
  });

  it("strips manual.local suffix for manual members", () => {
    expect(
      resolveAdminLoginIdentifier({
        provider: "manual",
        authUser: { email: "ops01@manual.local" },
        profile: { username: "ops01" },
        testUser: { username: "ops01" },
      }),
    ).toBe("ops01");
  });

  it("uses linked identity email and provider user id", () => {
    expect(
      resolveAdminLoginIdentifier({
        provider: "google",
        authUser: { email: "google.abc@google.native.dibay.internal" },
        profile: null,
        linkedIdentities: [
          {
            provider: "google",
            providerUserId: "g-linked",
            email: "linked@gmail.com",
          },
        ],
      }),
    ).toBe("linked@gmail.com");

    expect(
      resolveAdminProviderUserId({
        provider: "google",
        authUser: { email: "google.abc@google.native.dibay.internal" },
        linkedIdentities: [
          {
            provider: "google",
            providerUserId: "g-linked",
            email: null,
          },
        ],
      }),
    ).toBe("g-linked");
  });

  it("uses apple_sub from user_metadata when profile is missing", () => {
    expect(
      resolveAdminProviderUserId({
        provider: "apple",
        authUser: {
          email: "apple.001234@apple.native.dibay.internal",
          user_metadata: { apple_sub: "001234.abc" },
        },
        profile: null,
      }),
    ).toBe("001234.abc");
  });

  it("shows kakao email only when profile stored auth_login_email", () => {
    expect(
      resolveAdminLoginIdentifier({
        provider: "kakao",
        authUser: {
          email: "kakao.4944733937@kakao.native.dibay.internal",
          user_metadata: { kakao_email_hint: "kakao.user@example.com" },
        },
        profile: { auth_login_email: "kakao.user@example.com", provider_user_id: "4944733937" },
      }),
    ).toBe("kakao.user@example.com");
  });

  it("shows apple sub as login id when no display email was shared", () => {
    expect(
      resolveAdminLoginIdentifier({
        provider: "apple",
        authUser: { email: "apple.001234.abcd@apple.native.dibay.internal" },
        profile: { provider_user_id: "001234.abcd" },
      }),
    ).toBe("001234.abcd");
    expect(
      resolveAdminDisplayEmail({
        authUser: { email: "apple.001234.abcd@apple.native.dibay.internal" },
        profile: { provider_user_id: "001234.abcd" },
        provider: "apple",
      }),
    ).toBeUndefined();
  });

  it("classifies legacy kakao rows consistently for login id and email columns", () => {
    expect(
      resolveAdminLoginIdentifier({
        provider: "kakao",
        authUser: {
          email: "kakao.4944733937@kakao.native.dibay.internal",
          identities: [{ provider: "email" }],
        },
        profile: {
          email: "kakao.4944733937@kakao.native.dibay.internal",
          provider_user_id: "4944733937",
        },
      }),
    ).toBe("4944733937");
    expect(
      resolveAdminDisplayEmail({
        authUser: {
          email: "kakao.4944733937@kakao.native.dibay.internal",
        },
        profile: {
          email: "kakao.4944733937@kakao.native.dibay.internal",
        },
        provider: "kakao",
      }),
    ).toBeUndefined();
  });
});
