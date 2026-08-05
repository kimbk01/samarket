/**
 * Slice 8-4 — Completion / Provider / UI Boundary Guard.
 * PRODUCT Runtime unchanged; ownership + import/call-graph only.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTH_STATE_ARCHITECTURE,
  AUTH_STATE_BOUNDARIES,
  SLICE6_PROTECTED_COMPLETION_OWNERS,
} from "@/lib/auth/state/auth-state-boundary-contract";
import { AUTH_TRACE_OBSERVABILITY_PLAN } from "@/lib/auth/state/auth-lifecycle-trace-observability-contract";
import { AUTH_SESSION_LIFECYCLE_OWNER_MODULE } from "@/lib/auth/state/auth-session-lifecycle-ownership-contract";
import {
  AUTH_APPROVED_SERVER_PROFILE_DESTINATION_MODULES,
  AUTH_CLIENT_COMPLETION_CHAIN,
  AUTH_FINISH_CLIENT_AUTH_LOGIN_CALLERS,
  AUTH_NATIVE_PROVIDER_CLIENT_MODULES,
  AUTH_PROVIDER_UI_FORBIDDEN_CLIENT_IMPORTS,
  AUTH_RUN_COMMON_COMPLETION_OWNER,
  AUTH_THIN_HANDOFF_BUILDER,
  AUTH_UI_ALLOWED_NON_SUCCESS_NAV,
  AUTH_UI_HANDOFF_FORWARDERS,
  AUTH_UI_REQUIRED_HANDOFF_FORWARD_FIELDS,
  AUTH_WEB_NAVER_HTTP_REDIRECT_MODULES,
} from "@/lib/auth/state/auth-completion-provider-ui-boundary-contract";
import { COMMON_AUTH_COMPLETION_OWNERS } from "@/lib/auth/completion/types";
import {
  CANONICAL_LOGIN_PROFILE_WRITER,
  GOOGLE_PROFILE_HARD_GATE,
} from "@/lib/auth/completion/identity-writer-i2-boundary";

const ROOT = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function collectImportSpecifiers(src: string): string[] {
  const specs: string[] = [];
  const re =
    /(?:import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?|export\s+(?:type\s+)?[\s\S]*?\s+from\s+|import\s*\(\s*)["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) != null) specs.push(m[1]);
  return specs;
}

function specsHit(spec: string, needle: string): boolean {
  return spec.replace(/^@\//, "").includes(needle) || spec.includes(needle);
}

function countCalls(src: string, fn: string): number {
  // Require call-site object/arg form — ignore JSDoc like `finishClientAuthLogin (Slice…)`
  return (src.match(new RegExp(`\\b${fn}\\s*\\(\\s*[{\`'"]`, "g")) ?? []).length;
}

describe("Slice 8-4 Completion / Provider / UI Boundary Guard", () => {
  it("1. Native G/K/Apple use shared Thin Handoff builder", () => {
    for (const rel of AUTH_NATIVE_PROVIDER_CLIENT_MODULES) {
      const src = readSrc(rel);
      expect(src, rel).toContain(AUTH_THIN_HANDOFF_BUILDER);
      expect(countCalls(src, AUTH_THIN_HANDOFF_BUILDER), rel).toBeGreaterThanOrEqual(1);
    }
    expect(readSrc("lib/auth/completion/build-native-auth-completion-handoff.client.ts")).toMatch(
      /syncFromNativeExchangeCookies:\s*true/,
    );
  });

  it("2–4. Provider client does not own Profile / Destination / Client Sync policy", () => {
    for (const rel of AUTH_NATIVE_PROVIDER_CLIENT_MODULES) {
      const src = readSrc(rel);
      const specs = collectImportSpecifiers(src);
      const hits: string[] = [];
      for (const needle of AUTH_PROVIDER_UI_FORBIDDEN_CLIENT_IMPORTS) {
        if (needle.includes("run-common") || needle.includes("runCommon")) {
          for (const spec of specs) {
            if (specsHit(spec, needle)) hits.push(`${spec}~${needle}`);
          }
          expect(src, rel).not.toMatch(/runCommonAuthClientCompletion\s*\(/);
          continue;
        }
        for (const spec of specs) {
          if (specsHit(spec, needle)) hits.push(`${spec}~${needle}`);
        }
      }
      expect(hits, rel).toEqual([]);
      expect(src, rel).not.toMatch(/ensureAuthProfileForLogin\s*\(/);
      expect(src, rel).not.toMatch(/resolveCommonAuthDestination\s*\(/);
      expect(src, rel).not.toMatch(/syncCommonClientSessionAfterAuth\s*\(/);
    }
    // Server exchange Profile/Destination remains approved separately
    for (const rel of AUTH_APPROVED_SERVER_PROFILE_DESTINATION_MODULES.slice(0, 3)) {
      expect(readSrc(rel)).toMatch(/ensureAuthProfileForLogin/);
      expect(readSrc(rel)).toMatch(/resolveCommonAuthDestination/);
    }
  });

  it("5–6. UI does not own Profile/Destination/Sync; forwards handoff fields", () => {
    for (const rel of ["app/login/LoginPageClient.tsx", "components/auth/AuthModal.tsx"]) {
      const src = readSrc(rel);
      const specs = collectImportSpecifiers(src);
      for (const needle of [
        "ensure-auth-profile-for-login",
        "resolve-common-auth-destination",
        "sync-common-client-session",
        "run-common-auth-client-completion",
        "dibay-session-manager",
      ]) {
        expect(
          specs.filter((s) => specsHit(s, needle)),
          `${rel} ${needle}`,
        ).toEqual([]);
      }
      // OAuth success forward of Thin Handoff flag
      expect(src).toMatch(
        /syncFromNativeExchangeCookies:\s*input\.syncFromNativeExchangeCookies\s*===\s*true/,
      );
      for (const field of AUTH_UI_REQUIRED_HANDOFF_FORWARD_FIELDS) {
        if (field === "syncFromNativeExchangeCookies") continue;
        expect(src, `${rel} ${field}`).toMatch(new RegExp(`${field}:\\s*input\\.${field}`));
      }
    }
    const oauth = readSrc("lib/auth/oauth/use-oauth-login.ts");
    expect(oauth).not.toMatch(/finishClientAuthLogin\s*\(/);
    expect(oauth).not.toMatch(/runCommonAuthClientCompletion\s*\(/);
    expect(oauth).toMatch(/completeAuthSuccess/);
  });

  it("7–8 / 11. Native + Email Completion entry counts; Google recover uses same handoff", () => {
    const google = readSrc("lib/auth/native/start-native-google-login.client.ts");
    expect(google).toMatch(/finishNativeGoogleRecoverNavigation/);
    expect(countCalls(google, "finishClientAuthLogin")).toBe(1);
    expect(google).toMatch(/buildNativeAuthCompletionHandoff/);

    const kakao = readSrc("lib/auth/native/start-native-kakao-login.client.ts");
    const apple = readSrc("lib/auth/native/start-native-apple-login.client.ts");
    expect(countCalls(kakao, "finishClientAuthLogin")).toBe(0);
    expect(countCalls(apple, "finishClientAuthLogin")).toBe(0);

    const login = readSrc("app/login/LoginPageClient.tsx");
    const modal = readSrc("components/auth/AuthModal.tsx");
    // LoginPage: OAuth success + email + optional session auto-restore — all via finish only
    expect(countCalls(login, "finishClientAuthLogin")).toBeGreaterThanOrEqual(2);
    expect(countCalls(login, "runCommonAuthClientCompletion")).toBe(0);
    expect(countCalls(modal, "finishClientAuthLogin")).toBe(2);
    expect(countCalls(modal, "runCommonAuthClientCompletion")).toBe(0);

    const finish = readSrc(AUTH_RUN_COMMON_COMPLETION_OWNER);
    expect(countCalls(finish, "runCommonAuthClientCompletion")).toBe(1);
  });

  it("9–10. Completion failure → Navigation 0; success → Navigation 1 (owner module)", () => {
    const run = readSrc("lib/auth/completion/run-common-auth-client-completion.client.ts");
    expect(run).toMatch(/client_session_sync_failed/);
    expect(run).toMatch(/empty_destination/);
    // Early returns before navigation bump on failure
    const syncFail = run.indexOf('reason: "client_session_sync_failed"');
    const emptyDest = run.indexOf('reason: "empty_destination"');
    const navBump = run.indexOf('bumpAuthLifecycleCounter("navigation")');
    expect(syncFail).toBeGreaterThanOrEqual(0);
    expect(emptyDest).toBeGreaterThanOrEqual(0);
    expect(navBump).toBeGreaterThan(syncFail);
    expect(navBump).toBeGreaterThan(emptyDest);
    expect((run.match(/bumpAuthLifecycleCounter\("navigation"\)/g) ?? []).length).toBe(1);
    expect(run).toMatch(/input\.router\.replace\(target\)|location\.assign/);
  });

  it("12. Web/Naver keep HTTP 30x; no client runCommon", () => {
    for (const rel of AUTH_WEB_NAVER_HTTP_REDIRECT_MODULES) {
      const src = readSrc(rel);
      expect(src).toMatch(/NextResponse\.redirect/);
      expect(src).toMatch(/resolveCommonAuthDestination/);
      expect(src).not.toMatch(/runCommonAuthClientCompletion/);
      expect(src).not.toMatch(/finishClientAuthLogin/);
    }
  });

  it("13–14. Session Lifecycle / Trace not re-owned by Provider/UI Completion path", () => {
    for (const rel of [...AUTH_NATIVE_PROVIDER_CLIENT_MODULES, ...AUTH_UI_HANDOFF_FORWARDERS]) {
      const src = readSrc(rel);
      expect(src, rel).not.toMatch(/setSessionPhase\s*\(/);
      expect(src, rel).not.toMatch(/ensureSessionHealthy\s*\(/);
    }
    expect(AUTH_SESSION_LIFECYCLE_OWNER_MODULE).toContain("dibay-session-manager");
    expect(AUTH_TRACE_OBSERVABILITY_PLAN).toBe("PLAN_T1");
  });

  it("15. Slice 6/7/8-1~8-3 Authority maintained", () => {
    expect(AUTH_STATE_ARCHITECTURE).toBe("NO_MEGA_FSM");
    expect(AUTH_STATE_BOUNDARIES.commonCompletion.ownerModules).toContain(
      "lib/auth/finish-client-auth-login.client.ts",
    );
    expect(COMMON_AUTH_COMPLETION_OWNERS.profile).toBe(SLICE6_PROTECTED_COMPLETION_OWNERS.profile);
    expect(COMMON_AUTH_COMPLETION_OWNERS.destination).toBe(
      SLICE6_PROTECTED_COMPLETION_OWNERS.destination,
    );
    expect(COMMON_AUTH_COMPLETION_OWNERS.clientSync).toBe(
      SLICE6_PROTECTED_COMPLETION_OWNERS.clientSync,
    );
    expect(COMMON_AUTH_COMPLETION_OWNERS.navigation).toBe(
      SLICE6_PROTECTED_COMPLETION_OWNERS.navigation,
    );
    expect(CANONICAL_LOGIN_PROFILE_WRITER).toBe("ensureAuthProfileForLogin");
    expect(GOOGLE_PROFILE_HARD_GATE).toBe("ensureProfileForUserId");
    expect(AUTH_CLIENT_COMPLETION_CHAIN).toEqual([
      "finishClientAuthLogin",
      "runCommonAuthClientCompletion",
    ]);
  });

  it("UI non-success /login replace exception is documented; success nav not in Provider clients", () => {
    const login = readSrc(AUTH_UI_ALLOWED_NON_SUCCESS_NAV.module);
    expect(login).toContain(AUTH_UI_ALLOWED_NON_SUCCESS_NAV.pattern);
    for (const rel of AUTH_NATIVE_PROVIDER_CLIENT_MODULES) {
      const src = readSrc(rel);
      expect(src, rel).not.toMatch(/\brouter\.(push|replace)\s*\(/);
      expect(src, rel).not.toMatch(/location\.(assign|replace)\s*\(/);
    }
  });

  it("Production finishClientAuthLogin caller set matches SSOT", () => {
    for (const rel of AUTH_FINISH_CLIENT_AUTH_LOGIN_CALLERS) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(true);
      expect(readSrc(rel)).toMatch(/finishClientAuthLogin\s*\(/);
    }
  });
});
