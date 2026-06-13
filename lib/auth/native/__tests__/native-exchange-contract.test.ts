import { describe, expect, it } from "vitest";
import {
  missingCredentialMessage,
  parseNativeExchangeRequest,
  resolveNativeExchangeCredential,
} from "@/lib/auth/native/native-exchange-contract.server";
import {
  isNativeExchangeProvider,
  normalizeNativeExchangeProvider,
} from "@/lib/auth/native/native-exchange-types.server";

describe("native-exchange-contract.server", () => {
  it("parses all native exchange providers except naver", () => {
    for (const provider of ["apple", "kakao", "google", "facebook"] as const) {
      const parsed = parseNativeExchangeRequest({ provider, idToken: "t" });
      expect(parsed?.provider).toBe(provider);
    }
    expect(parseNativeExchangeRequest({ provider: "naver", accessToken: "t" })).toBeNull();
    expect(normalizeNativeExchangeProvider("google")).toBe("google");
    expect(isNativeExchangeProvider("facebook")).toBe(true);
  });

  it("resolves provider-specific credentials", () => {
    expect(
      resolveNativeExchangeCredential({
        provider: "apple",
        identityToken: "apple-jwt",
      }),
    ).toBe("apple-jwt");
    expect(
      resolveNativeExchangeCredential({
        provider: "kakao",
        accessToken: "kakao-at",
      }),
    ).toBe("kakao-at");
    expect(
      resolveNativeExchangeCredential({
        provider: "google",
        idToken: "google-jwt",
      }),
    ).toBe("google-jwt");
    expect(
      resolveNativeExchangeCredential({
        provider: "facebook",
        accessToken: "fb-at",
      }),
    ).toBe("fb-at");
  });

  it("returns null credential when required token missing", () => {
    expect(
      resolveNativeExchangeCredential({ provider: "google", accessToken: "wrong-field" }),
    ).toBeNull();
    expect(missingCredentialMessage("facebook")).toContain("Facebook");
  });
});
