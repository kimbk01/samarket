import { describe, expect, it } from "vitest";
import { NativeAppleAuthError } from "@/lib/auth/native/native-apple-auth-plugin";
import { summarizeOAuthStartFailure } from "@/lib/auth/oauth/oauth-start-error.client";

describe("oauth-start-error.client", () => {
  it("summarizes failures without leaking token fields", () => {
    const err = new NativeAppleAuthError(
      "apple_native_verify_failed",
      "identityToken=eyJhbG.id_token.secret access_token=abc",
    );
    const summary = summarizeOAuthStartFailure(err);
    expect(summary).toEqual({
      code: "apple_native_verify_failed",
      reason: "apple_native_verify_failed",
    });
    expect(JSON.stringify(summary)).not.toMatch(/eyJhbG|access_token|id_token/);
  });
});
