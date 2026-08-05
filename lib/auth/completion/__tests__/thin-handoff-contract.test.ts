import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildNativeAuthCompletionHandoff } from "@/lib/auth/completion/build-native-auth-completion-handoff.client";
import { COMMON_AUTH_COMPLETION_OWNERS } from "@/lib/auth/completion/types";

describe("Slice 6-4 thin handoff contract", () => {
  it("builds minimum Completion input with sync flag and no side-effect fields", () => {
    const handoff = buildNativeAuthCompletionHandoff({
      redirectTo: "/mypage",
      needsTermsAgreement: false,
      signupComplete: true,
    });
    expect(handoff).toEqual({
      redirectTo: "/mypage",
      needsTermsAgreement: false,
      signupComplete: true,
      consentComplete: true,
      syncFromNativeExchangeCookies: true,
    });
  });

  it("Google isNewUser forces terms-incomplete handoff", () => {
    const handoff = buildNativeAuthCompletionHandoff({
      redirectTo: "/mypage",
      needsTermsAgreement: false,
      signupComplete: true,
      isNewUser: true,
    });
    expect(handoff.needsTermsAgreement).toBe(true);
    expect(handoff.signupComplete).toBe(false);
    expect(handoff.syncFromNativeExchangeCookies).toBe(true);
  });

  it("Native G/K/Apple start modules use shared Thin Handoff builder", () => {
    const files = [
      "lib/auth/native/start-native-google-login.client.ts",
      "lib/auth/native/start-native-kakao-login.client.ts",
      "lib/auth/native/start-native-apple-login.client.ts",
    ];
    for (const rel of files) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(src, rel).toMatch(/buildNativeAuthCompletionHandoff/);
      expect(src, rel).not.toMatch(/syncClientSessionAfterNativeExchange/);
      expect(src, rel).not.toMatch(/syncCommonClientSessionAfterAuth/);
      expect(src, rel).not.toMatch(/runCommonAuthClientCompletion\(/);
      expect(src, rel).not.toMatch(/window\.location\.replace/);
      expect(src, rel).not.toMatch(/ensureAuthProfileForLogin/);
      expect(src, rel).not.toMatch(/resolveCommonAuthDestination/);
    }
  });

  it("Google recover uses same Thin Handoff builder then finishClientAuthLogin once", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/auth/native/start-native-google-login.client.ts"),
      "utf8",
    );
    expect(src).toMatch(/buildNativeAuthCompletionHandoff/);
    expect(src).toMatch(/finishNativeGoogleRecoverNavigation/);
    expect(src).toMatch(/finishClientAuthLogin\(\{ \.\.\.handoff/);
    // Only recover path calls finish inside google start — normal path returns handoff.
    const finishCalls = src.match(/finishClientAuthLogin\(/g) ?? [];
    expect(finishCalls.length).toBe(1);
  });

  it("Apple start does not call finish/navigation (handoff only)", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/auth/native/start-native-apple-login.client.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/await finishClientAuthLogin/);
    expect(src).not.toMatch(/finishClientAuthLogin\s*\(/);
    expect(src).not.toMatch(/runCommonAuthClientCompletion\s*\(/);
  });

  it("Slice 6-1/6-2/6-3 authorities remain declared", () => {
    expect(COMMON_AUTH_COMPLETION_OWNERS.destination).toBe("resolveCommonAuthDestination");
    expect(COMMON_AUTH_COMPLETION_OWNERS.profile).toBe("ensureAuthProfileForLogin");
    expect(COMMON_AUTH_COMPLETION_OWNERS.clientSync).toBe("syncCommonClientSessionAfterAuth");
    expect(COMMON_AUTH_COMPLETION_OWNERS.navigation).toBe("runCommonAuthClientCompletion");
  });

  it("Web/Naver HTTP callback structure unchanged (no client finish)", () => {
    for (const rel of ["app/auth/callback/route.ts", "app/api/auth/naver/callback/route.ts"]) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(src, rel).not.toMatch(/finishClientAuthLogin/);
      expect(src, rel).not.toMatch(/runCommonAuthClientCompletion/);
      expect(src, rel).toMatch(/NextResponse\.redirect|headers\.set\("Location"/);
      expect(src, rel).toMatch(/resolveCommonAuthDestination/);
      expect(src, rel).toMatch(/ensureAuthProfileForLogin|upsertOAuthProfileFromUser/);
    }
  });
});
