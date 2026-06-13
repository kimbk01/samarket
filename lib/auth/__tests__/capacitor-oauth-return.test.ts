import { describe, expect, it } from "vitest";
import {
  buildWebOAuthCallbackUrlFromNativeReturn,
  NATIVE_OAUTH_CALLBACK_URL,
} from "@/lib/auth/capacitor-oauth-return";

describe("capacitor-oauth-return", () => {
  it("exports native callback URL constant", () => {
    expect(NATIVE_OAUTH_CALLBACK_URL).toBe("dibay://auth/callback");
  });

  it("bridges native deep link to HTTPS auth callback", () => {
    const result = buildWebOAuthCallbackUrlFromNativeReturn(
      "dibay://auth/callback?code=abc123&next=%2Fmarket",
      "https://samarket.vercel.app",
    );
    expect(result).toBe(
      "https://samarket.vercel.app/auth/callback?code=abc123&next=%2Fmarket",
    );
  });

  it("forwards oauth error params", () => {
    const result = buildWebOAuthCallbackUrlFromNativeReturn(
      "dibay://auth/callback?error=access_denied&error_description=cancelled",
      "https://samarket.vercel.app",
    );
    expect(result).toBe(
      "https://samarket.vercel.app/auth/callback?error=access_denied&error_description=cancelled",
    );
  });

  it("forwards code state and next query params without loss", () => {
    const result = buildWebOAuthCallbackUrlFromNativeReturn(
      "dibay://auth/callback?code=abc&state=xyz&next=%2Fmarket",
      "https://samarket.vercel.app",
    );
    expect(result).toBe(
      "https://samarket.vercel.app/auth/callback?code=abc&state=xyz&next=%2Fmarket",
    );
  });

  it("returns null for unrelated deep links", () => {
    expect(
      buildWebOAuthCallbackUrlFromNativeReturn("https://example.com/auth/callback", "https://samarket.vercel.app"),
    ).toBeNull();
    expect(
      buildWebOAuthCallbackUrlFromNativeReturn("dibay://other/path", "https://samarket.vercel.app"),
    ).toBeNull();
  });
});
