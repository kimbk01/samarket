import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMON_AUTH_COMPLETION_OWNERS } from "@/lib/auth/completion/types";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** Production Auth entry / Completion edge surfaces — must not re-introduce quarantined entry. */
const PRODUCTION_AUTH_ENTRIES = [
  "app/login/LoginPageClient.tsx",
  "components/auth/AuthModal.tsx",
  "lib/auth/oauth/use-oauth-login.ts",
  "lib/auth/finish-client-auth-login.client.ts",
  "lib/auth/completion/run-common-auth-client-completion.client.ts",
  "lib/auth/native/start-native-google-login.client.ts",
  "lib/auth/native/start-native-kakao-login.client.ts",
  "lib/auth/native/start-native-apple-login.client.ts",
  "lib/auth/native/post-native-exchange.client.ts",
  "app/auth/callback/route.ts",
  "app/api/auth/naver/callback/route.ts",
  "lib/auth/native/google-native-session.server.ts",
  "lib/auth/native/kakao-native-session.server.ts",
  "lib/auth/native/apple-native-session.server.ts",
] as const;

const PROTECTED_AUTHORITIES = [
  "ensureAuthProfileForLogin",
  "resolveCommonAuthDestination",
  "resolvePostLoginRoute",
  "syncCommonClientSessionAfterAuth",
  "finishClientAuthLogin",
  "runCommonAuthClientCompletion",
  "buildNativeAuthCompletionHandoff",
] as const;

const QUARANTINED_IMPL_FILES = [
  "lib/auth/native/sync-client-session-after-native-exchange.client.ts",
  "lib/auth/oauth-profile-upsert.ts",
] as const;

describe("Slice 6-6 dead completion quarantine contract", () => {
  it("1: quarantine impl entry is not imported by Production Auth entry", () => {
    for (const rel of PRODUCTION_AUTH_ENTRIES) {
      const src = read(rel);
      expect(src, rel).not.toMatch(
        /from\s+["']@\/lib\/auth\/native\/sync-client-session-after-native-exchange\.client["']/,
      );
      expect(src, rel).not.toMatch(
        /import\s*\(\s*["']@\/lib\/auth\/native\/sync-client-session-after-native-exchange\.client["']\s*\)/,
      );
    }
  });

  it("2: quarantine impl is not called as Completion Authority from Production entry", () => {
    for (const rel of PRODUCTION_AUTH_ENTRIES) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/await\s+syncClientSessionAfterNativeExchange\s*\(/);
      expect(src, rel).not.toMatch(/(?<![A-Za-z])syncClientSessionAfterNativeExchange\s*\(/);
    }
    const syncOwner = read("lib/auth/completion/sync-common-client-session.client.ts");
    expect(syncOwner).toMatch(/syncClientSessionAfterNativeExchange\s*\(/);
    expect(syncOwner).not.toMatch(/export\s*\{\s*syncClientSessionAfterNativeExchange\s*\}/);
  });

  it("3: Production Profile owner is ensureAuthProfileForLogin", () => {
    expect(COMMON_AUTH_COMPLETION_OWNERS.profile).toBe("ensureAuthProfileForLogin");
    const edges = [
      "app/auth/callback/route.ts",
      "app/api/auth/naver/callback/route.ts",
      "lib/auth/native/google-native-session.server.ts",
      "lib/auth/native/kakao-native-session.server.ts",
      "lib/auth/native/apple-native-session.server.ts",
    ];
    for (const rel of edges) {
      expect(read(rel), rel).toMatch(/ensureAuthProfileForLogin/);
      expect(read(rel), rel).not.toMatch(/ensurePendingAuthProfileRow\s*\(/);
      expect(read(rel), rel).not.toMatch(/(?<![A-Za-z])ensureUserProfile\s*\(/);
    }
  });

  it("4: Production Destination owner is resolveCommonAuthDestination", () => {
    expect(COMMON_AUTH_COMPLETION_OWNERS.destination).toBe("resolveCommonAuthDestination");
    const edges = [
      "app/auth/callback/route.ts",
      "app/api/auth/naver/callback/route.ts",
      "lib/auth/native/google-native-session.server.ts",
      "lib/auth/native/kakao-native-session.server.ts",
      "lib/auth/native/apple-native-session.server.ts",
    ];
    for (const rel of edges) {
      expect(read(rel), rel).toMatch(/resolveCommonAuthDestination/);
      expect(read(rel), rel).not.toMatch(/resolvePostLoginRoute\s*\(/);
    }
  });

  it("5: Native Client Sync owner is syncCommonClientSessionAfterAuth", () => {
    expect(COMMON_AUTH_COMPLETION_OWNERS.clientSync).toBe("syncCommonClientSessionAfterAuth");
    const run = read("lib/auth/completion/run-common-auth-client-completion.client.ts");
    expect(run).toMatch(/syncCommonClientSessionAfterAuth/);
    expect(run).not.toMatch(/syncClientSessionAfterNativeExchange/);
  });

  it("6: Native Handoff owner is buildNativeAuthCompletionHandoff", () => {
    for (const rel of [
      "lib/auth/native/start-native-google-login.client.ts",
      "lib/auth/native/start-native-kakao-login.client.ts",
      "lib/auth/native/start-native-apple-login.client.ts",
    ]) {
      expect(read(rel), rel).toMatch(/buildNativeAuthCompletionHandoff/);
    }
  });

  it("7: Email/Native Completion goes through finishClientAuthLogin", () => {
    expect(COMMON_AUTH_COMPLETION_OWNERS.navigation).toBe("runCommonAuthClientCompletion");
    const finish = read("lib/auth/finish-client-auth-login.client.ts");
    expect(finish).toMatch(/runCommonAuthClientCompletion/);
    expect(read("app/login/LoginPageClient.tsx")).toMatch(/finishClientAuthLogin/);
    expect(read("components/auth/AuthModal.tsx")).toMatch(/finishClientAuthLogin/);
    expect(read("lib/auth/native/start-native-google-login.client.ts")).toMatch(
      /finishClientAuthLogin/,
    );
  });

  it("8: Web/Naver HTTP 30x navigation is retained", () => {
    for (const rel of ["app/auth/callback/route.ts", "app/api/auth/naver/callback/route.ts"]) {
      const src = read(rel);
      expect(src, rel).toMatch(/NextResponse\.redirect|headers\.set\("Location"/);
      expect(src, rel).not.toMatch(/finishClientAuthLogin/);
      expect(src, rel).not.toMatch(/runCommonAuthClientCompletion/);
    }
  });

  it("9: State Machine modules are not part of this quarantine slice", () => {
    for (const rel of [
      ...PRODUCTION_AUTH_ENTRIES,
      "lib/auth/completion/sync-common-client-session.client.ts",
      "lib/auth/oauth-profile-upsert.ts",
    ]) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/dibay-session-manager/);
      expect(src, rel).not.toMatch(/AuthStateMachine/);
    }
  });

  it("10: quarantine symbols are not physically deleted", () => {
    for (const rel of QUARANTINED_IMPL_FILES) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(true);
    }
    for (const name of PROTECTED_AUTHORITIES) {
      // At least one production/completion module still defines or exports the authority.
      const hits = [
        "lib/auth/completion/ensure-auth-profile-for-login.server.ts",
        "lib/auth/completion/resolve-common-auth-destination.server.ts",
        "lib/auth/resolve-post-login-route.ts",
        "lib/auth/completion/sync-common-client-session.client.ts",
        "lib/auth/finish-client-auth-login.client.ts",
        "lib/auth/completion/run-common-auth-client-completion.client.ts",
        "lib/auth/completion/build-native-auth-completion-handoff.client.ts",
      ].filter((rel) => read(rel).includes(name));
      expect(hits.length, name).toBeGreaterThan(0);
    }
    expect(read("lib/auth/native/google-native-session.server.ts")).toMatch(/ensureProfileForUserId/);
  });
});
