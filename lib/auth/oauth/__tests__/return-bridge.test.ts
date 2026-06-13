import { describe, expect, it } from "vitest";
import { buildWebOAuthCallbackUrlFromNativeReturn } from "@/lib/auth/oauth/return-bridge";

describe("return-bridge", () => {
  it("bridges dibay callback to https callback", () => {
    expect(
      buildWebOAuthCallbackUrlFromNativeReturn(
        "dibay://auth/callback?provider=google&code=abc",
        "https://samarket.vercel.app",
      ),
    ).toBe("https://samarket.vercel.app/auth/callback?provider=google&code=abc");
  });

  it("returns null for non-oauth urls", () => {
    expect(
      buildWebOAuthCallbackUrlFromNativeReturn("https://example.com", "https://samarket.vercel.app"),
    ).toBeNull();
  });
});
