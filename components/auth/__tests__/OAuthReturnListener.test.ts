import { describe, expect, it } from "vitest";
import { buildWebOAuthCallbackUrlFromNativeReturn } from "@/components/auth/OAuthReturnListener";

describe("OAuthReturnListener bridge", () => {
  it("maps dibay callback URL to the app callback route", () => {
    expect(
      buildWebOAuthCallbackUrlFromNativeReturn(
        "dibay://auth/callback?code=abc&provider=google&next=%2Fmarket",
      ),
    ).toBe("/auth/callback?code=abc&provider=google&next=%2Fmarket");
  });

  it("ignores non OAuth app URLs", () => {
    expect(buildWebOAuthCallbackUrlFromNativeReturn("dibay://other/callback?code=abc")).toBeNull();
  });
});
