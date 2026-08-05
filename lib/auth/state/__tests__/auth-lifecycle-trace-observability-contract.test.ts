/**
 * Slice 8-2 — Trace Observability-Only Guard contract tests.
 * PLAN_T1: stage/result names unchanged; Trace must not drive product Auth.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_STATE_ARCHITECTURE,
  AUTH_STATE_BOUNDARIES,
  AUTH_TRACE_NAMING_PLAN,
} from "@/lib/auth/state/auth-state-boundary-contract";
import {
  AUTH_TRACE_API,
  AUTH_TRACE_FORBIDDEN_IMPORT_NEEDLES,
  AUTH_TRACE_MODULE,
  AUTH_TRACE_OBSERVABILITY_PLAN,
  AUTH_TRACE_OBSERVATIONAL_STAGES,
  AUTH_TRACE_PRODUCTION_CALLERS,
  AUTH_TRACE_PRODUCT_RESULTS,
  AUTH_TRACE_QA_EXTERNAL_CLASSIFICATIONS,
  AUTH_TRACE_SENSITIVE_DETAIL_KEYS,
} from "@/lib/auth/state/auth-lifecycle-trace-observability-contract";
import { COMMON_AUTH_COMPLETION_OWNERS } from "@/lib/auth/completion/types";
import {
  CANONICAL_LOGIN_PROFILE_WRITER,
  GOOGLE_PROFILE_HARD_GATE,
} from "@/lib/auth/completion/identity-writer-i2-boundary";

vi.mock("@/lib/auth/oauth/oauth-native-callback-log", () => ({
  logOAuthNativeEvent: vi.fn(),
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  resolveOAuthRoutingShellPlatform: () => "android",
}));

import { logOAuthNativeEvent } from "@/lib/auth/oauth/oauth-native-callback-log";
import {
  beginAuthLifecycleFlow,
  bumpAuthLifecycleCounter,
  cancelAuthLifecycle,
  completeAuthLifecycle,
  failAuthLifecycle,
  getActiveAuthFlowId,
  markAuthLifecycleStage,
  redactAuthLifecycleDetail,
  resetAuthLifecycleForTests,
} from "@/lib/auth/oauth/auth-lifecycle-trace";

const ROOT = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function collectImportSpecifiers(src: string): string[] {
  const specs: string[] = [];
  const importRe =
    /(?:import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?|export\s+(?:type\s+)?[\s\S]*?\s+from\s+|import\s*\(\s*)["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(src)) != null) specs.push(m[1]);
  return specs;
}

function specsHit(spec: string, needle: string): boolean {
  return spec.replace(/^@\//, "").includes(needle) || spec.includes(needle);
}

/** Product branch on Trace return / stage / result — banned patterns. */
function findTraceDrivenBranches(src: string): string[] {
  const hits: string[] = [];
  const patterns: Array<[string, RegExp]> = [
    ["if(getActiveAuthFlowId)", /\bif\s*\([^)]*getActiveAuthFlowId\s*\(/],
    ["if(beginAuthLifecycleFlow)", /\bif\s*\([^)]*beginAuthLifecycleFlow\s*\(/],
    ["switch(AuthLifecycleStage)", /switch\s*\([^)]*AuthLifecycleStage/],
    ["switch(stage/result lifecycle)", /switch\s*\([^)]*(lastStage|AuthLifecycleResult|lifecycleResult)/],
    ["await markAuthLifecycleStage", /await\s+markAuthLifecycleStage\s*\(/],
    ["await completeAuthLifecycle", /await\s+completeAuthLifecycle\s*\(/],
    ["return markAuthLifecycleStage", /return\s+markAuthLifecycleStage\s*\(/],
    ["return completeAuthLifecycle", /return\s+completeAuthLifecycle\s*\(/],
    ["return failAuthLifecycle", /return\s+failAuthLifecycle\s*\(/],
    ["navigation from getActiveAuthFlowId", /getActiveAuthFlowId\s*\([^)]*\)[\s\S]{0,80}(router\.(push|replace)|location\.(assign|href))/],
  ];
  for (const [label, re] of patterns) {
    if (re.test(src)) hits.push(label);
  }
  return hits;
}

describe("Slice 8-2 Trace Observability-Only Guard", () => {
  beforeEach(() => {
    resetAuthLifecycleForTests();
    vi.mocked(logOAuthNativeEvent).mockReset();
    vi.mocked(logOAuthNativeEvent).mockImplementation(() => undefined);
  });

  it("1. Trace is Observability-only (PLAN_T1 + Slice 8-1 layer)", () => {
    expect(AUTH_TRACE_OBSERVABILITY_PLAN).toBe("PLAN_T1");
    expect(AUTH_TRACE_NAMING_PLAN).toBe("PLAN_T1");
    expect(AUTH_STATE_BOUNDARIES.observability.ownerModules).toContain(AUTH_TRACE_MODULE);
    expect(AUTH_STATE_BOUNDARIES.observability.forbiddenResponsibilities).toEqual(
      expect.arrayContaining([
        "session_phase_transition",
        "profile_write",
        "destination_resolve",
        "navigation",
        "product_success_failure_decision",
      ]),
    );
    const trace = readSrc(AUTH_TRACE_MODULE);
    expect(trace).toMatch(/Observability-only|instrumentation only/i);
    expect(trace).toMatch(/must not drive session, completion, profile, destination, or navigation/i);
  });

  it("2. Trace module Authority import count = 0", () => {
    const specs = collectImportSpecifiers(readSrc(AUTH_TRACE_MODULE));
    const hits: string[] = [];
    for (const needle of AUTH_TRACE_FORBIDDEN_IMPORT_NEEDLES) {
      for (const spec of specs) {
        if (specsHit(spec, needle)) hits.push(`${spec}~${needle}`);
      }
    }
    expect(hits).toEqual([]);
    expect(specs.every((s) => s.includes("oauth-native-callback-log") || s.includes("capacitor-native"))).toBe(
      true,
    );
  });

  it("3–5. Production callers do not branch on Trace returns / stages for session or nav", () => {
    const allHits: string[] = [];
    for (const rel of AUTH_TRACE_PRODUCTION_CALLERS) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(true);
      const hits = findTraceDrivenBranches(readSrc(rel));
      for (const h of hits) allHits.push(`${rel}: ${h}`);
    }
    expect(allHits).toEqual([]);

    // beginAuthLifecycleFlow return discarded in production oauth entry
    const oauth = readSrc("lib/auth/oauth/use-oauth-login.ts");
    expect(oauth).toMatch(/beginAuthLifecycleFlow\(\{\s*provider/);
    expect(oauth).not.toMatch(/const\s+\w+\s*=\s*beginAuthLifecycleFlow\(/);
    expect(oauth).not.toMatch(/if\s*\(\s*beginAuthLifecycleFlow/);
  });

  it("6. Trace sink failure does not throw / abort Auth flow", () => {
    vi.mocked(logOAuthNativeEvent).mockImplementation(() => {
      throw new Error("sink unavailable");
    });
    expect(() => beginAuthLifecycleFlow({ provider: "google" })).not.toThrow();
    expect(() => markAuthLifecycleStage("login_button_tapped")).not.toThrow();
    expect(() => bumpAuthLifecycleCounter("navigation")).not.toThrow();
    expect(() => completeAuthLifecycle("ok")).not.toThrow();
    expect(() => failAuthLifecycle("test")).not.toThrow();
    expect(() => {
      beginAuthLifecycleFlow({ provider: "kakao" });
      cancelAuthLifecycle({ reason: "user_cancelled" });
    }).not.toThrow();
  });

  it("7. Trace duplicate counters do not invoke Completion/navigation APIs", () => {
    const trace = readSrc(AUTH_TRACE_MODULE);
    expect(trace).not.toMatch(/finishClientAuthLogin\s*\(|runCommonAuthClientCompletion\s*\(|router\.(push|replace)|location\.assign/);
    beginAuthLifecycleFlow({ provider: "google" });
    bumpAuthLifecycleCounter("navigation");
    bumpAuthLifecycleCounter("navigation");
    bumpAuthLifecycleCounter("finishClientAuthLogin");
    // Counters only — no second navigation side effect from Trace module
    expect(trace).toMatch(/activeFlow\.counters\[key\]\s*\+=\s*1/);
    const run = readSrc("lib/auth/completion/run-common-auth-client-completion.client.ts");
    const navBump = (run.match(/bumpAuthLifecycleCounter\("navigation"\)/g) ?? []).length;
    expect(navBump).toBe(1);
  });

  it("8. Trace missing (no active flow) does not mutate session / still no-ops safely", () => {
    resetAuthLifecycleForTests();
    expect(getActiveAuthFlowId()).toBeNull();
    expect(() => markAuthLifecycleStage("profile_resolved")).not.toThrow();
    expect(() => completeAuthLifecycle("ok")).not.toThrow();
    expect(() => bumpAuthLifecycleCounter("navigation")).not.toThrow();
    expect(vi.mocked(logOAuthNativeEvent)).not.toHaveBeenCalled();
    const trace = readSrc(AUTH_TRACE_MODULE);
    expect(trace).not.toMatch(/setSessionPhase|markSessionAuthenticated|ensureSessionHealthy/);
  });

  it("9. Sensitive credential / token logging paths are redacted", () => {
    const out = redactAuthLifecycleDetail(
      Object.fromEntries(AUTH_TRACE_SENSITIVE_DETAIL_KEYS.map((k) => [k, "secret-value-xyz"])),
    );
    for (const key of AUTH_TRACE_SENSITIVE_DETAIL_KEYS) {
      expect(String(out[key]), key).toMatch(/redacted/i);
    }
    const trace = readSrc(AUTH_TRACE_MODULE);
    expect(trace).toMatch(/SENSITIVE_KEY/);
    expect(trace).toMatch(/redactAuthLifecycleDetail/);
  });

  it("10. External QA classifications are not product lifecycle enum values", () => {
    for (const cls of AUTH_TRACE_QA_EXTERNAL_CLASSIFICATIONS) {
      expect(AUTH_TRACE_PRODUCT_RESULTS).not.toContain(cls as never);
    }
    const trace = readSrc(AUTH_TRACE_MODULE);
    for (const cls of AUTH_TRACE_QA_EXTERNAL_CLASSIFICATIONS) {
      expect(trace).not.toContain(cls);
    }
    expect(AUTH_TRACE_PRODUCT_RESULTS).toEqual(
      expect.arrayContaining(["ok", "fail", "cancel", "in_progress"]),
    );
  });

  it("11. Slice 8-1 Boundary SSOT maintained", () => {
    expect(AUTH_STATE_ARCHITECTURE).toBe("NO_MEGA_FSM");
    expect(Object.keys(AUTH_STATE_BOUNDARIES)).toHaveLength(5);
    expect(AUTH_STATE_BOUNDARIES.observability.layer).toBe("observability");
  });

  it("12. Slice 6/7 Authority maintained", () => {
    expect(COMMON_AUTH_COMPLETION_OWNERS.profile).toBe("ensureAuthProfileForLogin");
    expect(COMMON_AUTH_COMPLETION_OWNERS.destination).toBe("resolveCommonAuthDestination");
    expect(COMMON_AUTH_COMPLETION_OWNERS.clientSync).toBe("syncCommonClientSessionAfterAuth");
    expect(COMMON_AUTH_COMPLETION_OWNERS.navigation).toBe("runCommonAuthClientCompletion");
    expect(COMMON_AUTH_COMPLETION_OWNERS.authPhase).toBe("auth-lifecycle-trace");
    expect(CANONICAL_LOGIN_PROFILE_WRITER).toBe("ensureAuthProfileForLogin");
    expect(GOOGLE_PROFILE_HARD_GATE).toBe("ensureProfileForUserId");
  });

  it("PLAN_T1: observational stage names unchanged; API surface intact", () => {
    const trace = readSrc(AUTH_TRACE_MODULE);
    for (const stage of AUTH_TRACE_OBSERVATIONAL_STAGES) {
      expect(trace).toContain(`"${stage}"`);
    }
    for (const api of AUTH_TRACE_API) {
      expect(trace).toContain(api);
    }
  });

  it("Correlation header is optional observability only (empty when no flow)", async () => {
    const { authLifecycleExchangeHeaders } = await import("@/lib/auth/oauth/auth-lifecycle-trace");
    resetAuthLifecycleForTests();
    expect(authLifecycleExchangeHeaders()).toEqual({});
    beginAuthLifecycleFlow({ provider: "apple" });
    expect(authLifecycleExchangeHeaders()["x-dibay-auth-flow-id"]).toMatch(/^af_/);
  });
});
