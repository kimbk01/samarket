import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildWebOAuthCallbackUrlFromNativeReturn,
  deliverNativeOAuthReturnUrl,
  resetNativeOAuthReturnBridgeForTests,
} from "@/lib/auth/oauth/native-oauth-return-bridge";

vi.mock("@/lib/auth/oauth/oauth-native-callback-log", () => ({
  logOAuthNativeEvent: vi.fn(),
  parseOAuthNativeCallbackLogPayload: vi.fn((url: string) => ({
    hasCode: url.includes("code="),
    hasError: url.includes("error="),
  })),
}));

vi.mock("@/lib/auth/oauth/auth-lifecycle-trace", () => ({
  bumpAuthLifecycleCounter: vi.fn(),
  markAuthLifecycleStage: vi.fn(),
}));

vi.mock("@/lib/auth/oauth/native-oauth-contract", () => ({
  endOAuthFlow: vi.fn(),
}));

describe("native-oauth-return-bridge", () => {
  afterEach(() => {
    resetNativeOAuthReturnBridgeForTests();
    vi.restoreAllMocks();
  });

  it("builds /auth/callback from dibay://auth/callback", () => {
    expect(buildWebOAuthCallbackUrlFromNativeReturn("dibay://auth/callback?code=abc&state=1")).toBe(
      "/auth/callback?code=abc&state=1",
    );
  });

  it("delivers once and ignores duplicate", () => {
    const replace = vi.fn();
    vi.stubGlobal("window", {
      location: { replace },
      dispatchEvent: vi.fn(),
    });

    const first = deliverNativeOAuthReturnUrl(
      "dibay://auth/callback?code=abc",
      "as_web_auth_completion",
    );
    const second = deliverNativeOAuthReturnUrl(
      "dibay://auth/callback?code=abc",
      "app_url_open",
    );

    expect(first).toEqual({
      ok: true,
      webCallbackUrl: "/auth/callback?code=abc",
      navigated: true,
    });
    expect(second).toEqual({ ok: false, reason: "duplicate" });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/auth/callback?code=abc");
  });
});
