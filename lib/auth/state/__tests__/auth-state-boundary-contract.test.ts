/**
 * Slice 8-1 — Auth State Boundary Authority Contract tests.
 * PRODUCT Runtime behavior unchanged; ownership + import/call-graph only.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTH_STATE_ARCHITECTURE,
  AUTH_STATE_BOUNDARIES,
  AUTH_STATE_BOUNDARY_STRATEGY,
  AUTH_TRACE_NAMING_PLAN,
  COMPLETION_ALLOWED_SESSION_APIS,
  QA_EXTERNAL_CLASSIFICATIONS,
  SESSION_MANAGER_FORBIDDEN_IMPORT_NEEDLES,
  SESSION_RESTORE_OWNER_APIS,
  SLICE6_PROTECTED_COMPLETION_OWNERS,
  TRACE_FORBIDDEN_IMPORT_NEEDLES,
} from "@/lib/auth/state/auth-state-boundary-contract";
import { COMMON_AUTH_COMPLETION_OWNERS } from "@/lib/auth/completion/types";
import {
  CANONICAL_LOGIN_PROFILE_WRITER,
  GOOGLE_PROFILE_HARD_GATE,
} from "@/lib/auth/completion/identity-writer-i2-boundary";

const ROOT = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** Collect static import/require module specifiers from a TS/JS source. */
function collectImportSpecifiers(src: string): string[] {
  const specs: string[] = [];
  const importRe =
    /(?:import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?|export\s+(?:type\s+)?[\s\S]*?\s+from\s+|import\s*\(\s*)["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(src)) != null) {
    specs.push(m[1]);
  }
  const requireRe = /require\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = requireRe.exec(src)) != null) {
    specs.push(m[1]);
  }
  return specs;
}

function specsContainNeedle(spec: string, needle: string): boolean {
  const normalized = spec.replace(/^@\//, "").replace(/\\/g, "/");
  return normalized.includes(needle) || spec.includes(needle);
}

function forbiddenImportHits(src: string, needles: readonly string[]): string[] {
  const specs = collectImportSpecifiers(src);
  const hits: string[] = [];
  for (const needle of needles) {
    for (const spec of specs) {
      if (specsContainNeedle(spec, needle)) {
        hits.push(`${spec} matches ${needle}`);
      }
    }
  }
  return [...new Set(hits)];
}

const TRACE = "lib/auth/oauth/auth-lifecycle-trace.ts";
const SESSION = "lib/auth/dibay-session-manager.ts";
const SESSION_POLICY = "lib/auth/dibay-session-policy.ts";
const OAUTH_LOCK = "lib/auth/oauth/native-oauth-contract.ts";
const FINISH = "lib/auth/finish-client-auth-login.client.ts";
const RUN_COMPLETION = "lib/auth/completion/run-common-auth-client-completion.client.ts";
const LOGIN_UI = "app/login/LoginPageClient.tsx";
const AUTH_MODAL = "components/auth/AuthModal.tsx";
const USE_OAUTH = "lib/auth/oauth/use-oauth-login.ts";
const TYPES = "lib/auth/completion/types.ts";

describe("Slice 8-1 Auth State Boundary Authority Contract", () => {
  it("SSOT fixes NO_MEGA_FSM + PLAN_B4 + five layers", () => {
    expect(AUTH_STATE_ARCHITECTURE).toBe("NO_MEGA_FSM");
    expect(AUTH_STATE_BOUNDARY_STRATEGY).toBe("PLAN_B4");
    expect(AUTH_TRACE_NAMING_PLAN).toBe("PLAN_T1");
    expect(Object.keys(AUTH_STATE_BOUNDARIES).sort()).toEqual(
      ["commonCompletion", "observability", "providerLocal", "sessionLifecycle", "uiPresentation"].sort(),
    );
  });

  it("1–5. Layer owners match Session / Completion / Trace / Provider Local / UI", () => {
    expect(AUTH_STATE_BOUNDARIES.sessionLifecycle.ownerModules).toContain(
      "lib/auth/dibay-session-manager.ts",
    );
    expect(AUTH_STATE_BOUNDARIES.commonCompletion.ownerModules).toContain(
      "lib/auth/finish-client-auth-login.client.ts",
    );
    expect(AUTH_STATE_BOUNDARIES.commonCompletion.ownerModules).toContain(
      "lib/auth/completion/run-common-auth-client-completion.client.ts",
    );
    expect(AUTH_STATE_BOUNDARIES.observability.ownerModules).toContain(
      "lib/auth/oauth/auth-lifecycle-trace.ts",
    );
    expect(AUTH_STATE_BOUNDARIES.providerLocal.ownerModules).toContain("tryBeginOAuthFlow");
    expect(AUTH_STATE_BOUNDARIES.uiPresentation.ownerModules).toContain(
      "app/login/LoginPageClient.tsx",
    );
    expect(existsSync(join(ROOT, TRACE))).toBe(true);
    expect(existsSync(join(ROOT, SESSION))).toBe(true);
    expect(existsSync(join(ROOT, OAUTH_LOCK))).toBe(true);
  });

  it("6. Completion success and authenticated phase are distinct authorities", () => {
    expect(AUTH_STATE_BOUNDARIES.commonCompletion.ownedResponsibilities).toContain(
      "completion_success_failure",
    );
    expect(AUTH_STATE_BOUNDARIES.sessionLifecycle.ownedResponsibilities).toContain("authenticated");
    expect(AUTH_STATE_BOUNDARIES.commonCompletion.forbiddenResponsibilities).toContain(
      "dibay_session_phase_definition",
    );
    expect(AUTH_STATE_BOUNDARIES.sessionLifecycle.forbiddenResponsibilities).toContain(
      "login_navigation",
    );
  });

  it("7. Destination and Navigation remain separate Slice 6 owners", () => {
    expect(SLICE6_PROTECTED_COMPLETION_OWNERS.destination).toBe("resolveCommonAuthDestination");
    expect(SLICE6_PROTECTED_COMPLETION_OWNERS.navigation).toBe("runCommonAuthClientCompletion");
    expect(COMMON_AUTH_COMPLETION_OWNERS.destination).toBe("resolveCommonAuthDestination");
    expect(COMMON_AUTH_COMPLETION_OWNERS.navigation).toBe("runCommonAuthClientCompletion");
    expect(SLICE6_PROTECTED_COMPLETION_OWNERS.destination).not.toBe(
      SLICE6_PROTECTED_COMPLETION_OWNERS.navigation,
    );
  });

  it("8. Cold/Resume restore is Session-owned; Completion does not call restore APIs", () => {
    const finish = readSrc(FINISH);
    const run = readSrc(RUN_COMPLETION);
    for (const api of SESSION_RESTORE_OWNER_APIS) {
      expect(finish, `finish must not call ${api}`).not.toMatch(new RegExp(`\\b${api}\\s*\\(`));
      expect(run, `runCommon must not call ${api}`).not.toMatch(new RegExp(`\\b${api}\\s*\\(`));
    }
    const session = readSrc(SESSION);
    expect(session).toMatch(/export async function ensureSessionHealthy/);
    expect(session).toMatch(/export function bindDibaySessionManagerAuthListener/);
    expect(forbiddenImportHits(session, ["finish-client-auth-login", "run-common-auth-client-completion"]))
      .toEqual([]);
  });

  it("9. Logout restore block owned by Session Lifecycle (terminal_guest)", () => {
    const policy = readSrc(SESSION_POLICY);
    expect(policy).toMatch(/terminal_guest/);
    const session = readSrc(SESSION);
    expect(session).toMatch(/markSessionTerminalGuestFromClient/);
    expect(session).toMatch(/setSessionPhase\("terminal_guest"\)/);
    expect(AUTH_STATE_BOUNDARIES.sessionLifecycle.ownedResponsibilities).toContain(
      "logout_restore_block",
    );
  });

  it("10. Trace is Observability-only — stage names are not product state authority", () => {
    const trace = readSrc(TRACE);
    expect(trace).toMatch(/instrumentation only|Does not change login control flow/i);
    expect(AUTH_STATE_BOUNDARIES.observability.forbiddenResponsibilities).toContain(
      "product_success_failure_decision",
    );
    expect(COMMON_AUTH_COMPLETION_OWNERS.authPhase).toBe("auth-lifecycle-trace");
    // Trace must not contain decision helpers that mutate session/nav/profile.
    expect(trace).not.toMatch(/setSessionPhase|router\.|ensureAuthProfile|resolveCommonAuthDestination/);
  });

  it("11. External QA classifications are not product enums", () => {
    const policy = readSrc(SESSION_POLICY);
    const trace = readSrc(TRACE);
    for (const cls of QA_EXTERNAL_CLASSIFICATIONS) {
      expect(policy, `DibaySessionPhase must not include ${cls}`).not.toContain(cls);
      expect(trace, `AuthLifecycle enums must not include ${cls}`).not.toContain(cls);
    }
  });

  it("12. Slice 6/7 protected owners unchanged", () => {
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
    expect(SLICE6_PROTECTED_COMPLETION_OWNERS.googleHardGate).toBe("ensureProfileForUserId");
  });

  it("Production guard: Trace does not import Session/Profile/Destination/Sync/Nav", () => {
    const hits = forbiddenImportHits(readSrc(TRACE), TRACE_FORBIDDEN_IMPORT_NEEDLES);
    expect(hits).toEqual([]);
    const specs = collectImportSpecifiers(readSrc(TRACE));
    expect(specs.some((s) => s.includes("oauth-native-callback-log"))).toBe(true);
  });

  it("Production guard: Session manager does not import destination/completion/profile", () => {
    const hits = forbiddenImportHits(readSrc(SESSION), SESSION_MANAGER_FORBIDDEN_IMPORT_NEEDLES);
    expect(hits).toEqual([]);
  });

  it("Production guard: Provider OAuth lock does not mutate DibaySessionPhase", () => {
    const src = readSrc(OAUTH_LOCK);
    expect(collectImportSpecifiers(src).filter((s) => s.includes("dibay-session"))).toEqual([]);
    expect(src).not.toMatch(/setSessionPhase|markSessionAuthenticated|markSessionTerminalGuest|DibaySessionPhase/);
    expect(src).toMatch(/tryBeginOAuthFlow/);
  });

  it("Production guard: Login UI / AuthModal / use-oauth-login do not own session phase", () => {
    for (const rel of [LOGIN_UI, AUTH_MODAL, USE_OAUTH]) {
      if (!existsSync(join(ROOT, rel))) continue;
      const src = readSrc(rel);
      expect(collectImportSpecifiers(src).filter((s) => s.includes("dibay-session-manager")), rel).toEqual(
        [],
      );
      expect(src, rel).not.toMatch(/setSessionPhase\s*\(/);
      expect(src, rel).not.toMatch(/markSessionAuthenticatedFromClient|markSessionTerminalGuestFromClient/);
    }
  });

  it("Production guard: Completion uses official session prime path; no direct setSessionPhase", () => {
    const finish = readSrc(FINISH);
    const run = readSrc(RUN_COMPLETION);
    expect(finish + run).toMatch(/primeClientAuthSessionFromSupabase|runCommonAuthClientCompletion/);
    expect(finish).not.toMatch(/setSessionPhase\s*\(/);
    expect(run).not.toMatch(/setSessionPhase\s*\(/);
    expect(collectImportSpecifiers(finish).filter((s) => s.includes("dibay-session-manager"))).toEqual(
      [],
    );
    expect(collectImportSpecifiers(run).filter((s) => s.includes("dibay-session-manager"))).toEqual([]);
    // Allowed side-effect path remains via auth-session-immediate
    expect(COMPLETION_ALLOWED_SESSION_APIS).toContain("primeClientAuthSessionFromSupabase");
    expect(readSrc("lib/auth/auth-session-immediate.client.ts")).toMatch(
      /markSessionAuthenticatedFromClient/,
    );
  });

  it("types.ts authPhase remains Observability pointer, not Session Lifecycle", () => {
    const types = readSrc(TYPES);
    expect(types).toMatch(/authPhase:\s*"auth-lifecycle-trace"/);
    expect(COMMON_AUTH_COMPLETION_OWNERS.authPhase).toBe("auth-lifecycle-trace");
  });
});
