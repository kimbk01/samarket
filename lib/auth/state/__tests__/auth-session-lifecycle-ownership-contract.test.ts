/**
 * Slice 8-3 — Session Lifecycle Ownership Guard.
 * PRODUCT Runtime unchanged; ownership + import/call-graph only.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTH_STATE_ARCHITECTURE,
  AUTH_STATE_BOUNDARIES,
} from "@/lib/auth/state/auth-state-boundary-contract";
import { AUTH_TRACE_OBSERVABILITY_PLAN } from "@/lib/auth/state/auth-lifecycle-trace-observability-contract";
import {
  AUTH_SESSION_ACCOUNT_SWITCH_WIPE_REASON,
  AUTH_SESSION_COLD_RESUME_FORBIDDEN_CALLS,
  AUTH_SESSION_COLD_RESUME_SURFACES,
  AUTH_SESSION_COMPLETION_ALLOWED_SIDE_EFFECTS,
  AUTH_SESSION_LIFECYCLE_OWNER_MODULE,
  AUTH_SESSION_LOGOUT_RESTORE_BLOCK,
  AUTH_SESSION_MANAGER_FORBIDDEN_IMPORT_NEEDLES,
  AUTH_SESSION_OFFICIAL_APIS,
  AUTH_SESSION_OFFICIAL_MARK_CALLERS,
  AUTH_SESSION_PHASE_POLICY_MODULE,
  AUTH_SESSION_PHASE_WRITE_FORBIDDEN_MODULES,
  AUTH_SESSION_PRIVATE_PHASE_SETTER,
  AUTH_SESSION_PRODUCT_PHASES,
  AUTH_SESSION_QA_EXTERNAL_NOT_PHASES,
} from "@/lib/auth/state/auth-session-lifecycle-ownership-contract";
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

describe("Slice 8-3 Session Lifecycle Ownership Guard", () => {
  it("1. DibaySessionPhase official Owner is dibay-session-manager", () => {
    expect(AUTH_STATE_BOUNDARIES.sessionLifecycle.ownerModules).toContain(
      AUTH_SESSION_LIFECYCLE_OWNER_MODULE,
    );
    const manager = readSrc(AUTH_SESSION_LIFECYCLE_OWNER_MODULE);
    expect(manager).toMatch(/function setSessionPhase\(/);
    expect(manager).toMatch(/let sessionPhase: DibaySessionPhase/);
    for (const api of AUTH_SESSION_OFFICIAL_APIS) {
      expect(manager).toContain(`export `);
      expect(manager.includes(api)).toBe(true);
    }
    const policy = readSrc(AUTH_SESSION_PHASE_POLICY_MODULE);
    for (const phase of AUTH_SESSION_PRODUCT_PHASES) {
      expect(policy).toContain(`"${phase}"`);
    }
  });

  it("2–3. Cold/Resume surfaces do not call Common Completion or login navigation", () => {
    for (const rel of AUTH_SESSION_COLD_RESUME_SURFACES) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(true);
      const src = readSrc(rel);
      for (const fn of AUTH_SESSION_COLD_RESUME_FORBIDDEN_CALLS) {
        expect(src, `${rel} must not call ${fn}`).not.toMatch(new RegExp(`\\b${fn}\\s*\\(`));
      }
      expect(src, rel).not.toMatch(/\brouter\.(push|replace)\s*\(/);
    }
  });

  it("4–5. Logout establishes terminal_guest + guest gate (restore block not wipe-skip alone)", () => {
    const logout = readSrc(AUTH_SESSION_LOGOUT_RESTORE_BLOCK.flow);
    expect(logout).toMatch(/markExplicitLogoutWipeDone/);
    expect(logout).toMatch(/wipeClientSessionState\("user_logout"\)/);
    expect(logout).toMatch(/establishGuestAuthState\(/);
    expect(logout).toMatch(/markSessionTerminalGuestFromClient\(/);

    const manager = readSrc(AUTH_SESSION_LIFECYCLE_OWNER_MODULE);
    expect(manager).toMatch(/shouldSkipEnsureHealthyForTerminalGuestGate/);
    expect(manager).toMatch(/isGuestAuthEstablished\(\) && !isRecoverableGuestAuthEstablished\(\)/);

    const guest = readSrc("lib/auth/guest-auth-state.ts");
    // Terminal guest cannot be downgraded to recoverable
    expect(guest).toMatch(
      /export function establishRecoverableGuestAuthState[\s\S]*?if \(authMissing && !guestRecoverable\) return;/,
    );

    const wipe = readSrc(AUTH_SESSION_LOGOUT_RESTORE_BLOCK.wipe);
    expect(wipe).toContain("POST_LOGOUT_BFCACHE_GUARD_KEY");
    // Wipe-skip timeout is duplicate-wipe guard only — not sole restore block
    expect(wipe).toMatch(/EXPLICIT_LOGOUT_WIPE_SKIP_MS/);
    expect(AUTH_SESSION_LOGOUT_RESTORE_BLOCK.wipeSkipIsNotRestoreBlock).toBe(
      "shouldSkipSignedOutEventWipe",
    );
  });

  it("6. Common Completion uses official session side-effect only (no setSessionPhase)", () => {
    const finish = readSrc("lib/auth/finish-client-auth-login.client.ts");
    const run = readSrc("lib/auth/completion/run-common-auth-client-completion.client.ts");
    expect(finish).not.toMatch(/setSessionPhase\s*\(/);
    expect(run).not.toMatch(/setSessionPhase\s*\(/);
    expect(collectImportSpecifiers(finish).filter((s) => s.includes("dibay-session-manager"))).toEqual(
      [],
    );
    expect(collectImportSpecifiers(run).filter((s) => s.includes("dibay-session-manager"))).toEqual([]);
    expect(run + finish).toMatch(/primeClientAuthSessionFromSupabase/);
    expect(AUTH_SESSION_COMPLETION_ALLOWED_SIDE_EFFECTS).toContain("primeClientAuthSessionFromSupabase");
    expect(readSrc("lib/auth/auth-session-immediate.client.ts")).toMatch(
      /markSessionAuthenticatedFromClient/,
    );
  });

  it("7–8. Login UI / Provider lock / Trace do not write session phase", () => {
    for (const rel of AUTH_SESSION_PHASE_WRITE_FORBIDDEN_MODULES) {
      if (!existsSync(join(ROOT, rel))) continue;
      const src = readSrc(rel);
      expect(src, rel).not.toMatch(/setSessionPhase\s*\(/);
      expect(collectImportSpecifiers(src).filter((s) => s.includes("dibay-session-manager")), rel).toEqual(
        [],
      );
    }
  });

  it("9–10. Session manager does not resolve destination or run login navigation", () => {
    const manager = readSrc(AUTH_SESSION_LIFECYCLE_OWNER_MODULE);
    const specs = collectImportSpecifiers(manager);
    const hits: string[] = [];
    for (const needle of AUTH_SESSION_MANAGER_FORBIDDEN_IMPORT_NEEDLES) {
      for (const spec of specs) {
        if (specsHit(spec, needle)) hits.push(`${spec}~${needle}`);
      }
    }
    expect(hits).toEqual([]);
    expect(manager).not.toMatch(/\brouter\.(push|replace)\s*\(/);
    expect(manager).not.toMatch(/location\.(assign|href)\s*=/);
    expect(manager).not.toMatch(/finishClientAuthLogin\s*\(|runCommonAuthClientCompletion\s*\(/);
  });

  it("11. Account A→B wipe reason clears prior user scope", () => {
    const wipe = readSrc(AUTH_SESSION_LOGOUT_RESTORE_BLOCK.wipe);
    expect(wipe).toContain(`"${AUTH_SESSION_ACCOUNT_SWITCH_WIPE_REASON}"`);
    expect(wipe).toMatch(/clearEphemeralLocalStorage/);
    expect(wipe).toMatch(/clearBoundAuthUserId/);
    expect(wipe).toMatch(/resetAuthClientCaches/);
    expect(readSrc("lib/auth/completion/run-common-auth-client-completion.client.ts")).toMatch(
      /invalidateGuestCachesForFreshLogin/,
    );
  });

  it("12. External QA classifications are not DibaySessionPhase values", () => {
    const policy = readSrc(AUTH_SESSION_PHASE_POLICY_MODULE);
    for (const cls of AUTH_SESSION_QA_EXTERNAL_NOT_PHASES) {
      expect(policy).not.toContain(cls);
      expect(AUTH_SESSION_PRODUCT_PHASES as readonly string[]).not.toContain(cls);
    }
  });

  it("13. Slice 8-1 / 8-2 boundary contracts remain", () => {
    expect(AUTH_STATE_ARCHITECTURE).toBe("NO_MEGA_FSM");
    expect(AUTH_STATE_BOUNDARIES.sessionLifecycle.ownedResponsibilities).toContain(
      "logout_restore_block",
    );
    expect(AUTH_TRACE_OBSERVABILITY_PLAN).toBe("PLAN_T1");
  });

  it("14. Slice 6/7 Authority remains", () => {
    expect(COMMON_AUTH_COMPLETION_OWNERS.profile).toBe("ensureAuthProfileForLogin");
    expect(COMMON_AUTH_COMPLETION_OWNERS.destination).toBe("resolveCommonAuthDestination");
    expect(COMMON_AUTH_COMPLETION_OWNERS.clientSync).toBe("syncCommonClientSessionAfterAuth");
    expect(COMMON_AUTH_COMPLETION_OWNERS.navigation).toBe("runCommonAuthClientCompletion");
    expect(CANONICAL_LOGIN_PROFILE_WRITER).toBe("ensureAuthProfileForLogin");
    expect(GOOGLE_PROFILE_HARD_GATE).toBe("ensureProfileForUserId");
  });

  it("Phase writer inventory: setSessionPhase only inside session-manager", () => {
    const manager = readSrc(AUTH_SESSION_LIFECYCLE_OWNER_MODULE);
    expect(manager).toMatch(new RegExp(`function ${AUTH_SESSION_PRIVATE_PHASE_SETTER}\\s*\\(`));

    // Official mark callers exist; none redefine setSessionPhase
    for (const rel of AUTH_SESSION_OFFICIAL_MARK_CALLERS) {
      if (rel === AUTH_SESSION_LIFECYCLE_OWNER_MODULE) continue;
      expect(existsSync(join(ROOT, rel)), rel).toBe(true);
      const src = readSrc(rel);
      expect(src, rel).not.toMatch(/function setSessionPhase\s*\(/);
      expect(src, rel).not.toMatch(/sessionPhase\s*=\s*["']/);
    }
  });
});
