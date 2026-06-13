import { describe, expect, it } from "vitest";
import { OAUTH_BACKGROUND_WAIT_MS } from "@/app/auth/oauth/launch/NativeOAuthLaunchClient";

describe("NativeOAuthLaunchClient contract", () => {
  it("uses 5 second background wait for Custom Tab open detection", () => {
    expect(OAUTH_BACKGROUND_WAIT_MS).toBe(5_000);
  });
});
