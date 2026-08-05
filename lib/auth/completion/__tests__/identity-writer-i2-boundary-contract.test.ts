/**
 * Slice 7-4 PLAN_I2 — Identity Writer boundary contract.
 * PRODUCT behavior unchanged; ownership + call-order + failure semantics locked.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTH_IDENTITY_ROW_WRITERS,
  CANONICAL_LOGIN_PROFILE_WRITER,
  CANONICAL_PROFILE_POLICY_KEYS,
  GOOGLE_PROFILE_HARD_GATE,
  IDENTITY_COLUMN_KEYS,
  IDENTITY_COLUMN_WRITERS,
} from "@/lib/auth/completion/identity-writer-i2-boundary";

function readSrc(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function indexOfRequired(src: string, needle: string, label: string): number {
  const idx = src.indexOf(needle);
  expect(idx, `${label} missing: ${needle}`).toBeGreaterThanOrEqual(0);
  return idx;
}

const FACADE = "lib/auth/completion/ensure-auth-profile-for-login.server.ts";
const GOOGLE = "lib/auth/native/google-native-session.server.ts";
const KAKAO = "lib/auth/native/kakao-native-session.server.ts";
const APPLE = "lib/auth/native/apple-native-session.server.ts";
const NAVER = "app/api/auth/naver/callback/route.ts";
const WEB = "app/auth/callback/route.ts";
const WEB_POLICY = "lib/auth/provider-identity/web-oauth-policy.server.ts";
const BRIDGE = "lib/auth/provider-identity/native-session-bridge.server.ts";
const RECOVER = "lib/auth/native/start-native-google-login.client.ts";

describe("Slice 7-4 Identity Writer I2 boundary", () => {
  it("SSOT lists Canonical / Identity / Hard Gate without merging", () => {
    expect(CANONICAL_LOGIN_PROFILE_WRITER).toBe("ensureAuthProfileForLogin");
    expect(GOOGLE_PROFILE_HARD_GATE).toBe("ensureProfileForUserId");
    expect(IDENTITY_COLUMN_WRITERS).toContain("persistGoogleProfileIdentity");
    expect(IDENTITY_COLUMN_WRITERS).toContain("naverCallbackProfilesIdentityUpdate");
    expect(AUTH_IDENTITY_ROW_WRITERS).toContain("ensureProviderAuthIdentityRow");
    expect(AUTH_IDENTITY_ROW_WRITERS).toContain("persistOAuthProviderIdentity");
    expect(IDENTITY_COLUMN_KEYS).toEqual(
      expect.arrayContaining(["provider", "auth_provider", "provider_user_id", "auth_login_email"]),
    );
    expect(CANONICAL_PROFILE_POLICY_KEYS).toEqual(
      expect.arrayContaining(["display_name", "username", "nickname", "avatar_url"]),
    );
  });

  it("1. Canonical facade does not own Identity Writers", () => {
    const src = readSrc(FACADE);
    const bodyStart = src.indexOf("export async function ensureAuthProfileForLogin");
    const body = src.slice(bodyStart);
    expect(body).toMatch(/ensurePendingAuthProfileRow/);
    expect(body).toMatch(/ensureUserProfile/);
    expect(body).not.toMatch(/persistGoogleProfileIdentity|persistKakaoProfileIdentity|persistAppleProfileIdentity/);
    expect(body).not.toMatch(/ensureProviderAuthIdentityRow\(|persistOAuthProviderIdentity\(/);
    expect(body).not.toMatch(/user_auth_identities/);
    expect(body).not.toMatch(/from\(["']profiles["']\)\.update/);
    // Imports above the export must also stay free of Identity Writer modules.
    const imports = src.slice(0, bodyStart);
    expect(imports).not.toMatch(/provider-identity|persistGoogle|persistKakao|persistApple/);
  });

  it("2. Identity column writers do not set Canonical display/username/avatar policy", () => {
    for (const [rel, fn] of [
      [GOOGLE, "async function persistGoogleProfileIdentity"],
      [KAKAO, "async function persistKakaoProfileIdentity"],
      [APPLE, "async function persistAppleProfileIdentity"],
    ] as const) {
      const src = readSrc(rel);
      const start = indexOfRequired(src, fn, rel);
      const end = src.indexOf("\nasync function ", start + 1);
      const body = end > start ? src.slice(start, end) : src.slice(start, start + 800);
      for (const key of CANONICAL_PROFILE_POLICY_KEYS) {
        expect(body, `${rel} must not patch ${key}`).not.toMatch(new RegExp(`${key}\\s*:`));
      }
      expect(body).toMatch(/provider_user_id/);
      expect(body).toMatch(/\.then\(\(\)\s*=>\s*undefined,\s*\(\)\s*=>\s*undefined\)/);
    }

    const naver = readSrc(NAVER);
    const iUpdate = indexOfRequired(naver, 'from("profiles")', "naver profiles update");
    const patch = naver.slice(iUpdate, iUpdate + 350);
    expect(patch).toMatch(/provider:\s*"naver"/);
    expect(patch).toMatch(/provider_user_id:\s*profile\.id/);
    expect(patch).not.toMatch(/display_name/);
    expect(patch).not.toMatch(/username:/);
    expect(patch).not.toMatch(/avatar_url/);
  });

  it("3–4. Google: reconcile → canonical → identity column → auth identity → hard gate", () => {
    const src = readSrc(GOOGLE);
    const iReconcile = indexOfRequired(src, "await reconcileGoogleNativeProviderProfileConflict(", "reconcile");
    const iCanonical = indexOfRequired(src, "await ensureAuthProfileForLogin(", "canonical");
    const iCol = indexOfRequired(src, "await persistGoogleProfileIdentity(", "identity column");
    const iRow = indexOfRequired(src, "await ensureProviderAuthIdentityRow(", "auth identity");
    const iHard = indexOfRequired(src, "await ensureProfileForUserId(", "hard gate");
    expect(iReconcile).toBeLessThan(iCanonical);
    expect(iCanonical).toBeLessThan(iCol);
    expect(iCol).toBeLessThan(iRow);
    expect(iRow).toBeLessThan(iHard);
    expect(src).not.toMatch(/enrichMemberProfile:\s*false/);
  });

  it("5–6. Google soft identity column then hard auth-identity 409; hard gate 500 distinct", () => {
    const src = readSrc(GOOGLE);
    const persistBodyStart = src.indexOf("async function persistGoogleProfileIdentity");
    const persistBody = src.slice(persistBodyStart, persistBodyStart + 600);
    expect(persistBody).toMatch(/\.then\(\(\)\s*=>\s*undefined,\s*\(\)\s*=>\s*undefined\)/);

    const iRow = indexOfRequired(src, "await ensureProviderAuthIdentityRow(", "auth row");
    const catch409 = src.indexOf('errorCode: "provider_account_conflict"', iRow);
    expect(catch409).toBeGreaterThan(iRow);
    expect(src.slice(iRow, catch409 + 220)).toMatch(/status:\s*409/);

    const iHard = indexOfRequired(src, "await ensureProfileForUserId(", "hard");
    expect(src.slice(iHard, iHard + 350)).toMatch(/profile_ensure_failed/);
    expect(src.slice(iHard, iHard + 350)).toMatch(/status:\s*500/);
  });

  it("7. A→B: auth identity row refuses other user_id; column writers scope to signed user id", () => {
    const bridge = readSrc(BRIDGE);
    expect(bridge).toMatch(/existing\.user_id !== userId/);
    expect(bridge).toMatch(/provider_user_id already linked to another user/);

    for (const rel of [GOOGLE, KAKAO, APPLE]) {
      const src = readSrc(rel);
      expect(src).toMatch(/\.update\(patch\)\.eq\("id", userId\)/);
    }
    const naver = readSrc(NAVER);
    expect(naver).toMatch(/\.eq\("id", signedUser\.id\)/);
  });

  it("8. Kakao/Apple: canonical → identity column → auth identity (separated)", () => {
    for (const [rel, persistFn] of [
      [KAKAO, "await persistKakaoProfileIdentity("],
      [APPLE, "await persistAppleProfileIdentity("],
    ] as const) {
      const src = readSrc(rel);
      const iCanonical = indexOfRequired(src, "await ensureAuthProfileForLogin(", rel);
      const iCol = indexOfRequired(src, persistFn, rel);
      const iRow = indexOfRequired(src, "await ensureProviderAuthIdentityRow(", rel);
      expect(iCanonical).toBeLessThan(iCol);
      expect(iCol).toBeLessThan(iRow);
      expect(src).not.toMatch(/ensureProfileForUserId/);
    }
  });

  it("8b. Naver: canonical then Identity column update (not merged into facade)", () => {
    const src = readSrc(NAVER);
    const iCanonical = indexOfRequired(src, "await ensureAuthProfileForLogin(", "naver canonical");
    const iUpdate = src.indexOf('from("profiles")', iCanonical);
    expect(iUpdate).toBeGreaterThan(iCanonical);
    expect(src.slice(iUpdate, iUpdate + 280)).toMatch(/provider_user_id:\s*profile\.id/);
  });

  it("9. Web OAuth: facade then persistOAuthProviderIdentity; HTTP redirect retained", () => {
    const web = readSrc(WEB);
    const happyStart = web.indexOf("const status = await getOnboardingStatus");
    const happy = web.slice(happyStart, web.indexOf("onboardingTarget = resolved.destination"));
    const iFacade = happy.indexOf("await ensureAuthProfileForLogin(");
    const iIdentity = happy.indexOf("persistOAuthProviderIdentity(");
    const iDest = happy.indexOf("resolveCommonAuthDestination(");
    expect(iFacade).toBeGreaterThanOrEqual(0);
    expect(iIdentity).toBeGreaterThan(iFacade);
    expect(iDest).toBeGreaterThan(iIdentity);
    expect(web).toMatch(/NextResponse\.redirect/);
    expect(web).toMatch(/response\.headers\.set\("Location"/);

    const policy = readSrc(WEB_POLICY);
    expect(policy).toMatch(/export async function persistOAuthProviderIdentity/);
    expect(policy).toMatch(/ensureProviderAuthIdentityRow/);
    expect(policy).not.toMatch(/display_name|username|avatar_url/);
  });

  it("10. Slice 6 Completion / Destination / Client Sync untouched by Identity boundary file", () => {
    const boundary = readSrc("lib/auth/completion/identity-writer-i2-boundary.ts");
    expect(boundary).not.toMatch(/resolveCommonAuthDestination|syncCommonClientSessionAfterAuth|finishClientAuthLogin/);
    for (const rel of [GOOGLE, WEB, NAVER]) {
      const src = readSrc(rel);
      expect(src).toMatch(/resolveCommonAuthDestination/);
      expect(src).not.toMatch(/syncCommonClientSessionAfterAuth/);
      expect(src).not.toMatch(/finishClientAuthLogin/);
    }
  });

  it("Recover shares Google establish stack (no separate Identity writer fork)", () => {
    const recover = readSrc(RECOVER);
    expect(recover).toMatch(/completeNativeGoogleSession/);
    expect(recover).not.toMatch(/persistGoogleProfileIdentity|ensureProviderAuthIdentityRow|ensureAuthProfileForLogin/);
  });
});
