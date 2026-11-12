import { describe, expect, it } from "vitest";
import { hasSupabaseAuthTokenCookie } from "@/lib/home/home-banner-audience-hint";

describe("hasSupabaseAuthTokenCookie (R1 홈 배너 대상 먼저 정하기)", () => {
  it("로그인 쿠키(단일·청크)가 있으면 true", () => {
    expect(hasSupabaseAuthTokenCookie("a=1; sb-abc-auth-token=base64-xyz")).toBe(true);
    expect(hasSupabaseAuthTokenCookie("sb-abc-auth-token.0=base64-x; sb-abc-auth-token.1=y")).toBe(true);
  });

  it("로그인 쿠키가 없거나 비었으면 false", () => {
    expect(hasSupabaseAuthTokenCookie("")).toBe(false);
    expect(hasSupabaseAuthTokenCookie("app_lang=ko; sb-abc-auth-token=")).toBe(false);
    expect(hasSupabaseAuthTokenCookie("sb-abc-auth-token-code-verifier=x")).toBe(false);
  });
});
