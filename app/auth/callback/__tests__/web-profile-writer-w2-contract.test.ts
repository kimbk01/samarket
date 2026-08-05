/**
 * Slice 7-3 PLAN_W2 — Web OAuth callback Profile Writer: facade exactly once per success path.
 * PRODUCT scope: app/auth/callback/route.ts only (Naver/Google/Native untouched).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CALLBACK = "app/auth/callback/route.ts";
const NAVER = "app/api/auth/naver/callback/route.ts";
const GOOGLE = "lib/auth/native/google-native-session.server.ts";

function readSrc(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function sliceBetween(src: string, startNeedle: string, endNeedle: string): string {
  const start = src.indexOf(startNeedle);
  const end = src.indexOf(endNeedle, start);
  expect(start, startNeedle).toBeGreaterThanOrEqual(0);
  expect(end, endNeedle).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("Slice 7-3 Web Profile Writer W2 contract", () => {
  it("happy path: status → single facade(enrich=signupComplete) → identity → destination → Location", () => {
    const src = readSrc(CALLBACK);
    expect(src).not.toMatch(/upsertOAuthProfileFromUser/);

    const happy = sliceBetween(
      src,
      "const status = await getOnboardingStatus(writeSb, activeUser.id);",
      "onboardingTarget = resolved.destination;",
    );

    expect(happy).toMatch(/Slice 7-3 PLAN_W2/);
    expect(happy).toMatch(
      /await ensureAuthProfileForLogin\(writeSb, activeUser, \{\s*nicknameOverride: nick \|\| null,\s*enrichMemberProfile: status\.signupComplete === true,/,
    );
    const facadeCalls = happy.match(/await ensureAuthProfileForLogin\(/g) ?? [];
    expect(facadeCalls.length).toBe(1);

    const iFacade = happy.indexOf("await ensureAuthProfileForLogin(");
    const iIdentity = happy.indexOf("persistOAuthProviderIdentity(");
    const iDest = happy.indexOf("resolveCommonAuthDestination(");
    expect(iFacade).toBeGreaterThanOrEqual(0);
    expect(iIdentity).toBeGreaterThan(iFacade);
    expect(iDest).toBeGreaterThan(iIdentity);

    // No second enrich after signupComplete branch.
    expect(happy).not.toMatch(/if\s*\(\s*status\.signupComplete\s*\)/);
  });

  it("keeps HTTP redirect + destination after profile; soft failure; duplicateWarning log only", () => {
    const src = readSrc(CALLBACK);
    const iDest = src.indexOf("resolveCommonAuthDestination(");
    const iLocation = src.indexOf('response.headers.set("Location"');
    expect(iDest).toBeGreaterThanOrEqual(0);
    expect(iLocation).toBeGreaterThan(iDest);
    expect(src).toMatch(/NextResponse\.redirect/);
    expect(src).toMatch(/duplicateWarning/);
    expect(src).not.toMatch(/errorCode:\s*"provider_account_conflict"/);
  });

  it("status-fail fallback seeds pending once without destination enrichment", () => {
    const src = readSrc(CALLBACK);
    const fallback = sliceBetween(
      src,
      "// Status read failed",
      "상태 조회 실패 시 약관 화면으로",
    );
    expect(fallback).toMatch(/enrichMemberProfile:\s*false/);
    expect(fallback.match(/await ensureAuthProfileForLogin\(/g)?.length).toBe(1);
    expect(fallback).not.toMatch(/resolveCommonAuthDestination/);
  });

  it("does not change Naver callback or Google native G2 stack", () => {
    const naver = readSrc(NAVER);
    expect(naver).not.toMatch(/Slice 7-3 PLAN_W2/);

    const google = readSrc(GOOGLE);
    expect(google).toMatch(/Slice 7-2 PLAN_G2/);
    expect(google).not.toMatch(/enrichMemberProfile:\s*false/);
    expect(google.match(/await ensureAuthProfileForLogin\(/g)?.length).toBe(1);
  });

  it("Slice 6 Completion owners remain out of Web callback navigation path", () => {
    const src = readSrc(CALLBACK);
    expect(src).not.toMatch(/syncCommonClientSessionAfterAuth/);
    expect(src).not.toMatch(/finishClientAuthLogin/);
    expect(src).not.toMatch(/runCommonAuthClientCompletion/);
    expect(src).toMatch(/resolveCommonAuthDestination/);
  });
});
