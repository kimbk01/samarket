import { describe, expect, it, vi } from "vitest";
import {
  logOAuthNativeEvent,
  parseOAuthNativeCallbackLogPayload,
} from "@/lib/auth/oauth/oauth-native-callback-log";

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

describe("logOAuthNativeEvent", () => {
  it("logs exchange_success as info (not console.error)", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logOAuthNativeEvent("exchange_success", { userId: "u1", provider: "email" });
    expect(info).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
    info.mockRestore();
    error.mockRestore();
  });

  it("logs *_failed as error", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logOAuthNativeEvent("google_native_exchange_failed", { code: "x" });
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
