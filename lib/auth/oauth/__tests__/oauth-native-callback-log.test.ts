import { describe, expect, it } from "vitest";
import { parseOAuthNativeCallbackLogPayload } from "@/lib/auth/oauth/oauth-native-callback-log";

describe("parseOAuthNativeCallbackLogPayload", () => {
  it("parses dibay callback params without exposing code", () => {
    expect(
      parseOAuthNativeCallbackLogPayload(
        "dibay://auth/callback?code=secret&provider=google&state=abc&next=%2Fmypage",
      ),
    ).toEqual({
      scheme: "dibay",
      host: "auth",
      path: "/callback",
      hasCode: true,
      hasError: false,
      provider: "google",
      hasState: true,
      hasNext: true,
    });
  });

  it("returns null for invalid URLs", () => {
    expect(parseOAuthNativeCallbackLogPayload("not-a-url")).toBeNull();
  });
});
