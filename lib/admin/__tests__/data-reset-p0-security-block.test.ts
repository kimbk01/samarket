/**
 * DIBAY Data Reset — P0 security block contracts.
 *
 * 1. Database-target guard: Production / unknown Supabase project ⇒ no destructive execute,
 *    regardless of deploy tier or reset env flags (closes Preview→Production DB path).
 * 2. Legacy /api/admin/prelaunch-reset/* routes answer 410 before auth/body/DB.
 * 3. Client-supplied plan createdAt in the future is rejected (TTL cannot be extended).
 * 4. Execute API never echoes planHash / typedConfirmationPhrase / planId.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DIBAY_PRODUCTION_SUPABASE_PROJECT_REFS,
  isDataResetDestructiveTargetAllowed,
  resolveDataResetDatabaseTarget,
} from "@/lib/admin/data-reset/database-target-guard";
import { resolveDataResetEnvGate } from "@/lib/admin/data-reset/environment";
import { resolvePrelaunchResetEnvGate } from "@/lib/admin/prelaunch-reset/environment";
import { toDataResetExecutePublicResponse } from "@/lib/admin/data-reset/execute-response";
import {
  PRELAUNCH_RESET_LEGACY_API_GONE_BODY,
  PRELAUNCH_RESET_LEGACY_API_GONE_STATUS,
} from "@/lib/admin/prelaunch-reset/legacy-api-retired";
import {
  DATA_RESET_PLAN_CREATED_AT_MAX_SKEW_MS,
  type DataResetExecuteResult,
  type DataResetPlan,
} from "@/lib/admin/data-reset/types";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const PROD_URL = "https://ckdosyydvgzqwpbwuhon.supabase.co";
const OTHER_REF_URL = "https://abcdefghijklmnopqrst.supabase.co";
const LOCAL_URL = "http://127.0.0.1:54321";

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

describe("P0 database-target guard", () => {
  it("hard-codes the Production project ref", () => {
    expect(DIBAY_PRODUCTION_SUPABASE_PROJECT_REFS).toContain("ckdosyydvgzqwpbwuhon");
  });

  it("classifies Production / non-production / unknown targets", () => {
    expect(resolveDataResetDatabaseTarget(env({ NEXT_PUBLIC_SUPABASE_URL: PROD_URL })).target).toBe(
      "production"
    );
    expect(
      resolveDataResetDatabaseTarget(env({ NEXT_PUBLIC_SUPABASE_URL: `${PROD_URL}/` })).target
    ).toBe("production");
    expect(resolveDataResetDatabaseTarget(env({ NEXT_PUBLIC_SUPABASE_URL: OTHER_REF_URL })).target).toBe(
      "non_production"
    );
    expect(resolveDataResetDatabaseTarget(env({ NEXT_PUBLIC_SUPABASE_URL: LOCAL_URL })).target).toBe(
      "non_production"
    );
    expect(resolveDataResetDatabaseTarget(env({})).target).toBe("unknown");
    expect(resolveDataResetDatabaseTarget(env({ NEXT_PUBLIC_SUPABASE_URL: "not a url" })).target).toBe(
      "unknown"
    );
    expect(
      resolveDataResetDatabaseTarget(env({ NEXT_PUBLIC_SUPABASE_URL: "https://db.dibay.app" })).target
    ).toBe("unknown");
  });

  it("env can add Production refs but never remove the hard-coded one", () => {
    expect(
      resolveDataResetDatabaseTarget(
        env({
          NEXT_PUBLIC_SUPABASE_URL: OTHER_REF_URL,
          DATA_RESET_PRODUCTION_SUPABASE_REFS: "abcdefghijklmnopqrst",
        })
      ).target
    ).toBe("production");
    expect(
      resolveDataResetDatabaseTarget(
        env({ NEXT_PUBLIC_SUPABASE_URL: PROD_URL, DATA_RESET_PRODUCTION_SUPABASE_REFS: "" })
      ).target
    ).toBe("production");
  });

  it("only a positively non-production target allows destructive execute", () => {
    expect(isDataResetDestructiveTargetAllowed(env({ NEXT_PUBLIC_SUPABASE_URL: PROD_URL }))).toBe(false);
    expect(isDataResetDestructiveTargetAllowed(env({}))).toBe(false);
    // Non-production alone is no longer enough: the target must also be on the QA allowlist.
    expect(isDataResetDestructiveTargetAllowed(env({ NEXT_PUBLIC_SUPABASE_URL: LOCAL_URL }))).toBe(false);
    expect(
      isDataResetDestructiveTargetAllowed(env({ NEXT_PUBLIC_SUPABASE_URL: LOCAL_URL, DATA_RESET_QA_SUPABASE_REFS: "loopback" }))
    ).toBe(true);
  });
});

describe("P0 env gates — Production database is never executable", () => {
  const allFlags = {
    PRELAUNCH_RESET_ENABLED: "1",
    DATA_RESET_ENABLED: "1",
    DATA_RESET_PRODUCTION_EXECUTE: "1",
    DATA_RESET_PRODUCTION_PREVIEW: "1",
    PRELAUNCH_RESET_PRODUCTION_DRY_RUN: "1",
  };

  const tiers: Array<Record<string, string>> = [
    { NEXT_PUBLIC_APP_DEPLOY_TIER: "production" },
    { NEXT_PUBLIC_APP_DEPLOY_TIER: "staging" },
    { NEXT_PUBLIC_APP_DEPLOY_TIER: "local" },
    { VERCEL_ENV: "preview" },
    { NEXT_PUBLIC_VERCEL_ENV: "preview" },
    { VERCEL_ENV: "development" },
    { NODE_ENV: "development" },
    {},
  ];

  for (const tierEnv of tiers) {
    const label = JSON.stringify(tierEnv);
    it(`Production DB + every reset flag + ${label} ⇒ execute blocked (both engines)`, () => {
      const e = env({ ...tierEnv, ...allFlags, NEXT_PUBLIC_SUPABASE_URL: PROD_URL });
      const live = resolveDataResetEnvGate(e);
      const legacy = resolvePrelaunchResetEnvGate(e);
      expect(live.executeAllowed).toBe(false);
      expect(legacy.executeAllowed).toBe(false);
      expect(live.tier).toBe("production");
      expect(legacy.tier).toBe("production");
      expect(live.reasons).toContain("database_target_production");
    });

    it(`Unknown DB + every reset flag + ${label} ⇒ execute blocked (fail-closed)`, () => {
      const e = env({ ...tierEnv, ...allFlags });
      expect(resolveDataResetEnvGate(e).executeAllowed).toBe(false);
      expect(resolvePrelaunchResetEnvGate(e).executeAllowed).toBe(false);
    });
  }

  it("Vercel Preview wired to the Production DB is treated as Production (the reported bypass)", () => {
    const e = env({ VERCEL_ENV: "preview", DATA_RESET_ENABLED: "1", NEXT_PUBLIC_SUPABASE_URL: PROD_URL });
    const live = resolveDataResetEnvGate(e);
    expect(live.tier).toBe("production");
    expect(live.executeAllowed).toBe(false);
    // Preview on the Production DB also loses the non-prod preview default.
    expect(live.previewAllowed).toBe(false);
  });

  it("local stack keeps the existing non-production behaviour (no regression for dev/CI)", () => {
    const off = resolveDataResetEnvGate(
      env({ NEXT_PUBLIC_APP_DEPLOY_TIER: "local", NEXT_PUBLIC_SUPABASE_URL: LOCAL_URL })
    );
    expect(off.executeAllowed).toBe(false);
    const on = resolveDataResetEnvGate(
      env({
        NEXT_PUBLIC_APP_DEPLOY_TIER: "local",
        NEXT_PUBLIC_SUPABASE_URL: LOCAL_URL,
        DATA_RESET_ENABLED: "1",
      })
    );
    expect(on.executeAllowed).toBe(true);
    expect(on.tier).toBe("local");
  });

  it("guard reads the same env var the admin service client uses", () => {
    const runtime = read("lib/env/runtime.ts");
    expect(runtime).toContain('readEnv("NEXT_PUBLIC_SUPABASE_URL")');
    const guard = read("lib/admin/data-reset/database-target-guard.ts");
    expect(guard).toContain("env.NEXT_PUBLIC_SUPABASE_URL");
  });

  it("executeDomainReset checks the env gate before any planning or mutation", () => {
    const exec = read("lib/admin/data-reset/execute.ts");
    const gateIdx = exec.indexOf("const env = resolveDataResetEnvGate();");
    const firstMutation = exec.indexOf("runDbActions(input.sb");
    expect(gateIdx).toBeGreaterThan(0);
    expect(firstMutation).toBeGreaterThan(gateIdx);
    expect(exec).toContain("if (!env.executeAllowed)");
  });
});

describe("P0 executeDomainReset end-to-end against the Production database", () => {
  /** Chainable Supabase double that records any mutation attempt. Reads return empty/zero. */
  function recordingSb() {
    const mutations: string[] = [];
    const result = { data: [], error: null, count: 0 };
    const chain = (table: string): unknown =>
      new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === "then") {
              return (resolve: (v: unknown) => unknown) => resolve(result);
            }
            if (["delete", "update", "insert", "upsert"].includes(prop)) {
              return () => {
                mutations.push(`${prop}:${table}`);
                return chain(table);
              };
            }
            return () => chain(table);
          },
        }
      );
    const sb = {
      from: (table: string) => chain(table),
      rpc: (fn: string) => {
        mutations.push(`rpc:${fn}`);
        return chain(`rpc:${fn}`);
      },
      storage: {
        from: (bucket: string) => ({
          remove: async () => {
            mutations.push(`storage.remove:${bucket}`);
            return { data: [], error: null };
          },
          list: async () => ({ data: [], error: null }),
        }),
      },
      auth: {
        admin: {
          deleteUser: async () => {
            mutations.push("auth.deleteUser");
            return { data: null, error: null };
          },
        },
      },
    };
    return { sb, mutations };
  }

  const allFlagsProd = {
    NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
    PRELAUNCH_RESET_ENABLED: "1",
    DATA_RESET_ENABLED: "1",
    DATA_RESET_PRODUCTION_EXECUTE: "1",
    DATA_RESET_PRODUCTION_PREVIEW: "1",
  };

  for (const tierEnv of [{ NEXT_PUBLIC_APP_DEPLOY_TIER: "production" }, { VERCEL_ENV: "preview" }]) {
    it(`BLOCKED with zero mutations — ${JSON.stringify(tierEnv)} + all flags + full/operational`, async () => {
      const keys = [...Object.keys(allFlagsProd), "NEXT_PUBLIC_APP_DEPLOY_TIER", "VERCEL_ENV"];
      const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
      for (const k of keys) delete process.env[k];
      Object.assign(process.env, allFlagsProd, tierEnv);
      try {
        const { executeDomainReset } = await import("@/lib/admin/data-reset/execute");
        const { sb, mutations } = recordingSb();
        const result = await executeDomainReset({
          sb: sb as never,
          actorUserId: "00000000-0000-4000-8000-000000000001",
          request: { domain: "full", scope: "operational" } as never,
          planId: "22222222-2222-4222-8222-222222222222",
          expectedHash: "x",
          createdAt: new Date().toISOString(),
          typedConfirmation: "x",
          oneTimeToken: "x",
        } as never);
        expect(result.overall).toBe("BLOCKED");
        expect(result.ok).toBe(false);
        expect(mutations).toEqual([]);
        expect(result.phases[0]?.detail ?? "").toContain("database_target_production");
      } finally {
        for (const k of keys) {
          if (saved[k] === undefined) delete process.env[k];
          else process.env[k] = saved[k];
        }
      }
    });
  }
});

describe("P0 legacy prelaunch-reset API retired", () => {
  it("both routes return 410 without auth, body parsing or DB access", () => {
    expect(PRELAUNCH_RESET_LEGACY_API_GONE_STATUS).toBe(410);
    expect(PRELAUNCH_RESET_LEGACY_API_GONE_BODY.ok).toBe(false);
    for (const rel of [
      "app/api/admin/prelaunch-reset/dry-run/route.ts",
      "app/api/admin/prelaunch-reset/execute/route.ts",
    ]) {
      const src = read(rel);
      expect(src).toContain("PRELAUNCH_RESET_LEGACY_API_GONE_STATUS");
      expect(src).not.toMatch(/requireSuperAdmin|executePrelaunchReset|buildPrelaunchResetPlan/);
      expect(src).not.toMatch(/req\.json|appendAuditLog|from\("/);
      expect(src).toMatch(/export async function POST\(\)/);
    }
  });

  it("no app/component code path calls executePrelaunchReset any more", () => {
    // The executor library stays (tests + future reference) but is unreachable over HTTP.
    const exec = read("app/api/admin/prelaunch-reset/execute/route.ts");
    expect(exec).not.toContain("executePrelaunchReset");
  });
});

describe("P0 client-supplied createdAt cannot extend the plan TTL", () => {
  it("revalidate rejects a future createdAt before hash comparison", () => {
    const planner = read("lib/admin/data-reset/planner.ts");
    const futureIdx = planner.indexOf("plan_created_at_in_future");
    const hashIdx = planner.indexOf("plan_hash_mismatch_preview_required_again");
    expect(futureIdx).toBeGreaterThan(0);
    expect(hashIdx).toBeGreaterThan(futureIdx);
    expect(DATA_RESET_PLAN_CREATED_AT_MAX_SKEW_MS).toBeLessThanOrEqual(5 * 60 * 1000);
  });
});

describe("P0 execute response never echoes the plan", () => {
  const plan = {
    planId: "11111111-1111-4111-8111-111111111111",
    planHash: "deadbeefdeadbeefdeadbeef",
    typedConfirmationPhrase: "COMMUNITY RESET deadbeef",
    clientInvalidation: ["ns-a"],
  } as unknown as DataResetPlan;

  it("BLOCKED returns only the reason code", () => {
    const result: DataResetExecuteResult = {
      ok: false,
      overall: "BLOCKED",
      plan,
      phases: [{ phase: "VERIFY", status: "BLOCKED", detail: "plan_hash_mismatch_preview_required_again" }],
      executedCounts: {},
      clientSessionInvalidationRequired: false,
    };
    const body = toDataResetExecutePublicResponse(result);
    const json = JSON.stringify(body);
    expect(body.error).toBe("plan_hash_mismatch_preview_required_again");
    expect(json).not.toContain(plan.planHash);
    expect(json).not.toContain(plan.typedConfirmationPhrase);
    expect(json).not.toContain(plan.planId);
    expect(body).not.toHaveProperty("plan");
  });

  it("SUCCESS keeps the fields the admin UI reads, still without the plan", () => {
    const result: DataResetExecuteResult = {
      ok: true,
      overall: "SUCCESS",
      plan,
      phases: [{ phase: "VERIFY", status: "PASS", detail: "hash_confirm_ok" }],
      executedCounts: { community_posts: 3 },
      clientSessionInvalidationRequired: true,
    };
    const body = toDataResetExecutePublicResponse(result);
    expect(body.overall).toBe("SUCCESS");
    expect(body.executedCounts).toEqual({ community_posts: 3 });
    expect(body.clientInvalidation).toEqual(["ns-a"]);
    expect(body.clientSessionInvalidationRequired).toBe(true);
    expect(JSON.stringify(body)).not.toContain(plan.planHash);
  });

  it("execute route uses the public response mapper", () => {
    const route = read("app/api/admin/system/data-reset/execute/route.ts");
    expect(route).toContain("toDataResetExecutePublicResponse(result)");
    expect(route).not.toMatch(/plan:\s*result\.plan/);
  });
});
