import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  isNativeAppOAuthRequest,
  isNativeOAuthJsonLaunch,
  shouldUseNativeOAuthRedirect,
} from "@/lib/auth/oauth/resolve-native-oauth-request.server";

describe("resolve-native-oauth-request", () => {
  it("returns true for dibay_app query param", () => {
    const req = new NextRequest("https://samarket.vercel.app/api/auth/oauth/start?provider=google&dibay_app=android");
    expect(isNativeAppOAuthRequest(req)).toBe(true);
  });

  it("returns true for dibay_app cookie", () => {
    const req = new NextRequest("https://samarket.vercel.app/api/auth/oauth/start?provider=google");
    req.cookies.set("dibay_app", "ios");
    expect(isNativeAppOAuthRequest(req)).toBe(true);
  });

  it("returns false for web requests", () => {
    const req = new NextRequest("https://samarket.vercel.app/api/auth/oauth/start?provider=google");
    expect(isNativeAppOAuthRequest(req)).toBe(false);
  });

  it("detects launch=native JSON fetch", () => {
    const req = new NextRequest("https://samarket.vercel.app/api/auth/oauth/start?provider=google&launch=native");
    expect(isNativeOAuthJsonLaunch(req)).toBe(true);
    expect(shouldUseNativeOAuthRedirect(req)).toBe(true);
    expect(isNativeAppOAuthRequest(req)).toBe(false);
  });
});
