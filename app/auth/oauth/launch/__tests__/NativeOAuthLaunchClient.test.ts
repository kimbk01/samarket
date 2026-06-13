import { describe, expect, it } from "vitest";
import { NATIVE_OAUTH_BACKGROUND_DETECT_MS } from "@/lib/auth/oauth/native-oauth-contract";

describe("NativeOAuthLaunchClient contract", () => {
  it("uses 5 second background detect (non-fatal after Custom Tab open)", () => {
    expect(NATIVE_OAUTH_BACKGROUND_DETECT_MS).toBe(5_000);
  });
});
