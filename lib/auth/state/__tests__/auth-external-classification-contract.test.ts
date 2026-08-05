/**
 * Slice 8-5 — External / QA Classification Guard.
 * PRODUCT Runtime unchanged; classification separation only.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTH_STATE_ARCHITECTURE,
  AUTH_STATE_BOUNDARIES,
  SLICE6_PROTECTED_COMPLETION_OWNERS,
} from "@/lib/auth/state/auth-state-boundary-contract";
import { AUTH_TRACE_OBSERVABILITY_PLAN } from "@/lib/auth/state/auth-lifecycle-trace-observability-contract";
import { AUTH_SESSION_LIFECYCLE_OWNER_MODULE } from "@/lib/auth/state/auth-session-lifecycle-ownership-contract";
import { AUTH_THIN_HANDOFF_BUILDER } from "@/lib/auth/state/auth-completion-provider-ui-boundary-contract";
import {
  AUTH_PRODUCT_FAILURE_CODE_EXAMPLES,
  AUTH_PRODUCT_LIFECYCLE_RESULTS,
  AUTH_PRODUCT_SESSION_PHASES,
  AUTH_QA_CLASSIFICATION_FORBIDDEN_PRODUCT_MODULES,
  AUTH_QA_CLASSIFICATION_MAPPING,
  AUTH_QA_EXTERNAL_CLASSIFICATIONS,
  AUTH_QA_PROGRAM_VERDICTS,
} from "@/lib/auth/state/auth-external-classification-contract";
import { COMMON_AUTH_COMPLETION_OWNERS } from "@/lib/auth/completion/types";
import {
  CANONICAL_LOGIN_PROFILE_WRITER,
  GOOGLE_PROFILE_HARD_GATE,
} from "@/lib/auth/completion/identity-writer-i2-boundary";

const ROOT = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Slice 8-5 External Classification Contract", () => {
  it("1–2. Product lifecycle/session results are separate from QA classifications", () => {
    for (const cls of AUTH_QA_EXTERNAL_CLASSIFICATIONS) {
      expect(AUTH_PRODUCT_LIFECYCLE_RESULTS as readonly string[]).not.toContain(cls);
      expect(AUTH_PRODUCT_SESSION_PHASES as readonly string[]).not.toContain(cls);
    }
    expect(AUTH_PRODUCT_LIFECYCLE_RESULTS).toEqual(["ok", "fail", "cancel", "in_progress"]);
    expect(AUTH_PRODUCT_SESSION_PHASES).toEqual([
      "loading",
      "authenticated",
      "recovering",
      "terminal_guest",
      "corrupt",
    ]);
  });

  it("3–4. Forbidden product modules contain zero QA classification tokens", () => {
    for (const rel of AUTH_QA_CLASSIFICATION_FORBIDDEN_PRODUCT_MODULES) {
      const src = readSrc(rel);
      for (const cls of AUTH_QA_EXTERNAL_CLASSIFICATIONS) {
        expect(src, `${rel} must not contain ${cls}`).not.toContain(cls);
      }
    }
  });

  it("5. user_cancelled maps to cancel, not fail", () => {
    const oauth = readSrc("lib/auth/oauth/use-oauth-login.ts");
    expect(oauth).toMatch(/cancelAuthLifecycle\(\{\s*reason:\s*"user_cancelled"\s*\}\)/);
    // Cancel path must not call failAuthLifecycle for the same cancel branch
    const cancelBlock = oauth.slice(
      oauth.indexOf("isNativeProviderCancelError"),
      oauth.indexOf("failAuthLifecycle"),
    );
    expect(cancelBlock).toMatch(/cancelAuthLifecycle/);
    expect(cancelBlock).not.toMatch(/failAuthLifecycle/);

    const trace = readSrc("lib/auth/oauth/auth-lifecycle-trace.ts");
    expect(trace).toMatch(/AuthLifecycleResult\s*=\s*"ok"\s*\|\s*"fail"\s*\|\s*"cancel"\s*\|\s*"in_progress"/);
    expect(AUTH_QA_CLASSIFICATION_MAPPING.userCancelled.notProductFail).toBe(true);
  });

  it("6–8. External / instrumentation / NOT_OBSERVED do not auto-drive product fail/corrupt", () => {
    expect(AUTH_QA_CLASSIFICATION_MAPPING.externalAuthChallengeBlocked.notProductFail).toBe(true);
    expect(AUTH_QA_CLASSIFICATION_MAPPING.externalInstrumentationBlocked.notProductFail).toBe(true);
    expect(AUTH_QA_CLASSIFICATION_MAPPING.notObserved.notEqualFailed).toBe(true);

    const manager = readSrc("lib/auth/dibay-session-manager.ts");
    for (const cls of AUTH_QA_EXTERNAL_CLASSIFICATIONS) {
      expect(manager).not.toContain(cls);
    }
    // No mapping from QA tokens into corrupt
    expect(manager).not.toMatch(/EXTERNAL_.*corrupt|NOT_OBSERVED.*corrupt/);
  });

  it("9. PARTIAL_EXTERNAL_CLOSED is program verdict / QA class only", () => {
    expect(AUTH_QA_PROGRAM_VERDICTS).toContain("PARTIAL_EXTERNAL_CLOSED");
    expect(AUTH_QA_EXTERNAL_CLASSIFICATIONS).toContain("PARTIAL_EXTERNAL_CLOSED");
    expect(AUTH_PRODUCT_LIFECYCLE_RESULTS as readonly string[]).not.toContain(
      "PARTIAL_EXTERNAL_CLOSED",
    );
    expect(readSrc("lib/auth/completion/types.ts")).not.toContain("PARTIAL_EXTERNAL_CLOSED");
  });

  it("10. Code First Break YES requires direct Runtime proof (SSOT rules)", () => {
    expect(AUTH_QA_CLASSIFICATION_MAPPING.codeFirstBreakYes.requires).toMatch(/Direct Runtime proof/i);
    expect(AUTH_QA_CLASSIFICATION_MAPPING.codeFirstBreakYes.forbiddenSoleEvidence).toEqual(
      expect.arrayContaining([
        "missing_logs_only",
        "url_only",
        "external_ui_stuck",
        "automation_failure",
        "deploy_sha_mismatch",
      ]),
    );
  });

  it("11–12. Slice 8-1~8-4 and Slice 6/7 Authority maintained", () => {
    expect(AUTH_STATE_ARCHITECTURE).toBe("NO_MEGA_FSM");
    expect(AUTH_STATE_BOUNDARIES.observability.layer).toBe("observability");
    expect(AUTH_TRACE_OBSERVABILITY_PLAN).toBe("PLAN_T1");
    expect(AUTH_SESSION_LIFECYCLE_OWNER_MODULE).toContain("dibay-session-manager");
    expect(AUTH_THIN_HANDOFF_BUILDER).toBe("buildNativeAuthCompletionHandoff");
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
  });

  it("Product failure examples stay out of QA classification set", () => {
    for (const code of AUTH_PRODUCT_FAILURE_CODE_EXAMPLES) {
      expect(AUTH_QA_EXTERNAL_CLASSIFICATIONS as readonly string[]).not.toContain(code);
    }
  });

  it("AuthLifecycleResult / DibaySessionPhase source unions match product SSOT", () => {
    const trace = readSrc("lib/auth/oauth/auth-lifecycle-trace.ts");
    const policy = readSrc("lib/auth/dibay-session-policy.ts");
    for (const r of AUTH_PRODUCT_LIFECYCLE_RESULTS) {
      expect(trace).toContain(`"${r}"`);
    }
    for (const p of AUTH_PRODUCT_SESSION_PHASES) {
      expect(policy).toContain(`"${p}"`);
    }
  });
});
