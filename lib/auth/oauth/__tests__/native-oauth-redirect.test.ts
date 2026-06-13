import { describe, expect, it } from "vitest";
import { buildOAuthRedirectTo } from "@/lib/auth/oauth/supabase-oauth-start.server";
import {
  buildNativeOAuthAppCallbackUrl,
  isNativeOAuthSupabaseRedirectUrl,
  NATIVE_OAUTH_CAPACITOR_RETURN_PATH,
  WEB_OAUTH_CALLBACK_ORIGIN,
} from "@/lib/auth/oauth/native-oauth-redirect";

describe("native-oauth-redirect", () => {
  it("builds https capacitor-return redirect for native Supabase OAuth", () => {
    expect(buildOAuthRedirectTo("google", true, "/mypage")).toBe(
      `${WEB_OAUTH_CALLBACK_ORIGIN}${NATIVE_OAUTH_CAPACITOR_RETURN_PATH}?provider=google&next=%2Fmypage`,
    );
  });

  it("accepts native Supabase redirect URL", () => {
    expect(
      isNativeOAuthSupabaseRedirectUrl(
        `${WEB_OAUTH_CALLBACK_ORIGIN}${NATIVE_OAUTH_CAPACITOR_RETURN_PATH}?provider=google`,
      ),
    ).toBe(true);
    expect(isNativeOAuthSupabaseRedirectUrl("dibay://auth/callback?provider=google")).toBe(false);
  });

  it("builds dibay app callback from query and hash", () => {
    expect(buildNativeOAuthAppCallbackUrl("?code=abc&provider=google", "")).toBe(
      "dibay://auth/callback?code=abc&provider=google",
    );
  });
});
