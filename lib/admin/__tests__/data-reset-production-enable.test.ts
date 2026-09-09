/**
 * DIBAY Data Reset — Production enable decision contracts (no destructive runtime).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveDataResetEnvGate } from "@/lib/admin/data-reset/environment";
import {
  DATA_RESET_PRODUCTION_ENABLE_MATRIX,
  assertDataResetFailClosedDomain,
  inspectFullResetSafety,
  isDataResetProductionScopeEnabled,
  resolveDataResetProductionScopeKey,
} from "@/lib/admin/data-reset/production-enable-policy";
import { PRELAUNCH_RESET_HARD_LOCK } from "@/lib/admin/admin-real-operation-cut-h-prelaunch-reset-hard-lock";
import { resolvePrelaunchResetEnvGate } from "@/lib/admin/prelaunch-reset/environment";
import {
  buildDomainResetPlan,
  revalidateDomainResetPlan,
} from "@/lib/admin/data-reset/planner";
import { DATA_RESET_FORBIDDEN_OPS } from "@/lib/admin/data-reset/types";
import type { DataResetPlan } from "@/lib/admin/data-reset/types";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function mockSb(counts: Record<string, number> = {}) {
  return {
    from(table: string) {
      const state: {
        filters: Array<{ type: string; col?: string; val?: unknown }>;
      } = { filters: [] };
      const api: Record<string, unknown> = {
        select(_cols?: string, opts?: { count?: string; head?: boolean }) {
          void _cols;
          if (opts?.head && opts.count === "exact") {
            return Promise.resolve({
              count: counts[table] ?? 0,
              error: null,
              data: null,
            });
          }
          return {
            eq() {
              return api;
            },
            in() {
              return api;
            },
            is() {
              return api;
            },
            or() {
              return api;
            },
            limit() {
              return Promise.resolve({ data: [], error: null });
            },
            maybeSingle() {
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
        eq(col: string, val: unknown) {
          state.filters.push({ type: "eq", col, val });
          return api;
        },
        in() {
          return api;
        },
        is() {
          return api;
        },
        or() {
          return api;
        },
        limit() {
          return Promise.resolve({ data: [], error: null });
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        },
        delete() {
          return {
            eq() {
              return Promise.resolve({ count: 0, error: null });
            },
            in() {
              return Promise.resolve({ count: 0, error: null });
            },
            or() {
              return Promise.resolve({ count: 0, error: null });
            },
          };
        },
        update() {
          return {
            eq() {
              return {
                is() {
                  return Promise.resolve({ count: 0, error: null });
                },
              };
            },
            in() {
              return {
                is() {
                  return Promise.resolve({ count: 0, error: null });
                },
              };
            },
          };
        },
      };
      // chain after select().eq for head count
      const selectFn = api.select as (
        cols?: string,
        opts?: { count?: string; head?: boolean }
      ) => unknown;
      api.select = (cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head && opts.count === "exact") {
          const chain: Record<string, unknown> = {
            eq() {
              return chain;
            },
            in() {
              return chain;
            },
            is() {
              return chain;
            },
            or() {
              return Promise.resolve({ count: counts[table] ?? 0, error: null, data: null });
            },
            then(resolve: (v: unknown) => unknown) {
              return Promise.resolve({
                count: counts[table] ?? 0,
                error: null,
                data: null,
              }).then(resolve);
            },
          };
          // make awaitable
          return Object.assign(
            Promise.resolve({ count: counts[table] ?? 0, error: null, data: null }),
            chain
          );
        }
        return selectFn(cols, opts);
      };
      return api;
    },
  };
}

describe("PRODUCTION FIRST BLOCK remains Prelaunch-level for Prelaunch Reset", () => {
  it("CUT H prelaunch production execute still forbidden", () => {
    expect(PRELAUNCH_RESET_HARD_LOCK.productionExecuteForbidden).toBe(true);
    const gate = resolvePrelaunchResetEnvGate({
      NEXT_PUBLIC_APP_DEPLOY_TIER: "production",
      PRELAUNCH_RESET_ENABLED: "1",
      PRELAUNCH_RESET_PRODUCTION_DRY_RUN: "1",
    } as NodeJS.ProcessEnv);
    expect(gate.executeAllowed).toBe(false);
  });
});

describe("Data Reset Production env gate", () => {
  it("default production execute forbidden without DATA_RESET_PRODUCTION_EXECUTE", () => {
    const gate = resolveDataResetEnvGate({
      NEXT_PUBLIC_APP_DEPLOY_TIER: "production",
      PRELAUNCH_RESET_ENABLED: "1",
      DATA_RESET_ENABLED: "1",
      PRELAUNCH_RESET_PRODUCTION_DRY_RUN: "1",
    } as NodeJS.ProcessEnv);
    expect(gate.executeAllowed).toBe(false);
    expect(gate.reasons).toContain("production_execute_forbidden");
    expect(DATA_RESET_FORBIDDEN_OPS.productionExecuteDefaultForbidden).toBe(true);
  });

  it("opt-in opens env executeAllowed; scope allowlist still required", () => {
    const gate = resolveDataResetEnvGate({
      NEXT_PUBLIC_APP_DEPLOY_TIER: "production",
      DATA_RESET_PRODUCTION_EXECUTE: "1",
      DATA_RESET_PRODUCTION_PREVIEW: "1",
    } as NodeJS.ProcessEnv);
    expect(gate.executeAllowed).toBe(true);
    expect(gate.previewAllowed).toBe(true);
    expect(gate.reasons).toContain("production_execute_opt_in_scope_allowlist");
  });
});

describe("Production scope allowlist", () => {
  it("allows community/market/delivery/chat/friend/member app_data/full", () => {
    expect(
      isDataResetProductionScopeEnabled({ domain: "community", scope: "single" })
    ).toBe(true);
    expect(isDataResetProductionScopeEnabled({ domain: "community", scope: "all" })).toBe(true);
    expect(isDataResetProductionScopeEnabled({ domain: "market", scope: "single" })).toBe(true);
    expect(isDataResetProductionScopeEnabled({ domain: "market", scope: "all" })).toBe(true);
    expect(
      isDataResetProductionScopeEnabled({
        domain: "delivery",
        scope: "single",
        subtype: "product",
      })
    ).toBe(true);
    expect(
      isDataResetProductionScopeEnabled({
        domain: "delivery",
        scope: "single",
        subtype: "store",
      })
    ).toBe(true);
    expect(
      isDataResetProductionScopeEnabled({
        domain: "delivery",
        scope: "all",
        subtype: "operating",
      })
    ).toBe(true);
    expect(isDataResetProductionScopeEnabled({ domain: "chat", scope: "single" })).toBe(true);
    expect(isDataResetProductionScopeEnabled({ domain: "chat", scope: "type" })).toBe(false);
    expect(isDataResetProductionScopeEnabled({ domain: "chat", scope: "all" })).toBe(true);
    expect(isDataResetProductionScopeEnabled({ domain: "friend", scope: "user" })).toBe(false);
    expect(isDataResetProductionScopeEnabled({ domain: "friend", scope: "all" })).toBe(true);
    expect(
      isDataResetProductionScopeEnabled({
        domain: "member",
        scope: "user",
        subtype: "app_data",
      })
    ).toBe(true);
    expect(isDataResetProductionScopeEnabled({ domain: "full", scope: "all" })).toBe(true);
  });

  it("blocks finance / auth purge / hard chat delete key absent", () => {
    expect(isDataResetProductionScopeEnabled({ domain: "finance", scope: "all" })).toBe(false);
    expect(
      isDataResetProductionScopeEnabled({
        domain: "member",
        scope: "user",
        subtype: "auth_delete",
      })
    ).toBe(false);
    expect(resolveDataResetProductionScopeKey({ domain: "finance", scope: "all" })).toBe(
      "finance:all"
    );
    const financeRow = DATA_RESET_PRODUCTION_ENABLE_MATRIX.find((r) => r.key === "finance:all");
    expect(financeRow?.productionEnable).toBe("BLOCKED");
    const authRow = DATA_RESET_PRODUCTION_ENABLE_MATRIX.find((r) => r.key === "auth_purge");
    expect(authRow?.productionEnable).toBe("EXCLUDED");
    const trunc = DATA_RESET_PRODUCTION_ENABLE_MATRIX.find((r) => r.key === "truncate");
    expect(trunc?.productionEnable).toBe("EXCLUDED");
  });
});

describe("Fail-closed finance/auth", () => {
  it("assertDataResetFailClosedDomain blocks finance and auth_delete", () => {
    expect(assertDataResetFailClosedDomain({ domain: "finance" }).ok).toBe(false);
    expect(
      assertDataResetFailClosedDomain({ domain: "member", subtype: "auth_delete" }).ok
    ).toBe(false);
    expect(
      assertDataResetFailClosedDomain({ domain: "community", subtype: null }).ok
    ).toBe(true);
  });
});

describe("Full excludes finance/auth/audit/root-admin", () => {
  it("inspectFullResetSafety PASS on operational full composition", async () => {
    const prev = process.env.DATA_RESET_ENABLED;
    process.env.DATA_RESET_ENABLED = "1";
    process.env.PRELAUNCH_RESET_ENABLED = "1";
    delete process.env.NEXT_PUBLIC_APP_DEPLOY_TIER;
    try {
      const full = await buildDomainResetPlan({
        sb: mockSb({
          community_posts: 1,
          posts: 1,
          store_products: 1,
          community_messenger_rooms: 2,
          user_social_relations: 1,
        }) as never,
        actorUserId: "admin",
        request: { domain: "full", scope: "all", mode: "preview" },
      });
      expect(full.blocked).toEqual(
        expect.arrayContaining(["finance_hard_reset", "auth_users_wipe", "wipe_all_app_data_sql"])
      );
      const safety = inspectFullResetSafety(full);
      expect(safety.ok).toBe(true);
      expect(safety.containsFinanceDelete).toBe(false);
      expect(safety.containsAuthDelete).toBe(false);
      expect(safety.containsAuditDelete).toBe(false);
      expect(safety.containsRootAdminDelete).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.DATA_RESET_ENABLED;
      else process.env.DATA_RESET_ENABLED = prev;
    }
  });

  it("flags finance delete if injected", () => {
    const plan = {
      domain: "full",
      delete: [
        {
          table: "point_ledger",
          action: "DELETE",
          filterDescription: "all",
          estimatedRows: 1,
          phase: "DB",
        },
      ],
      softDelete: [],
      detach: [],
      resetState: [],
      blocked: ["finance_hard_reset", "auth_users_wipe", "wipe_all_app_data_sql"],
      preserve: [],
    } as unknown as DataResetPlan;
    const safety = inspectFullResetSafety(plan);
    expect(safety.ok).toBe(false);
    expect(safety.containsFinanceDelete).toBe(true);
  });
});

describe("plan hash / expiry / confirmation contracts", () => {
  it("hash mismatch blocked; createdAt required for revalidate", async () => {
    process.env.DATA_RESET_ENABLED = "1";
    process.env.PRELAUNCH_RESET_ENABLED = "1";
    delete process.env.NEXT_PUBLIC_APP_DEPLOY_TIER;
    const sb = mockSb({ community_posts: 2 }) as never;
    const plan = await buildDomainResetPlan({
      sb,
      actorUserId: "admin",
      request: { domain: "community", scope: "all", mode: "preview" },
    });
    const bad = await revalidateDomainResetPlan({
      sb,
      actorUserId: "admin",
      request: { domain: "community", scope: "all" },
      planId: plan.planId,
      expectedHash: "deadbeef",
      createdAt: plan.createdAt,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe("plan_hash_mismatch_preview_required_again");

    const missing = await revalidateDomainResetPlan({
      sb,
      actorUserId: "admin",
      request: { domain: "community", scope: "all" },
      planId: plan.planId,
      expectedHash: plan.planHash,
      createdAt: "",
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe("plan_created_at_required");

    const ok = await revalidateDomainResetPlan({
      sb,
      actorUserId: "admin",
      request: { domain: "community", scope: "all" },
      planId: plan.planId,
      expectedHash: plan.planHash,
      createdAt: plan.createdAt,
    });
    expect(ok.ok).toBe(true);
  });

  it("expired preview blocked when createdAt older than TTL", async () => {
    process.env.DATA_RESET_ENABLED = "1";
    process.env.PRELAUNCH_RESET_ENABLED = "1";
    delete process.env.NEXT_PUBLIC_APP_DEPLOY_TIER;
    const sb = mockSb({ community_posts: 2 }) as never;
    const oldCreated = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const plan = await buildDomainResetPlan({
      sb,
      actorUserId: "admin",
      request: { domain: "community", scope: "all", mode: "preview" },
      createdAt: oldCreated,
    });
    const expired = await revalidateDomainResetPlan({
      sb,
      actorUserId: "admin",
      request: { domain: "community", scope: "all" },
      planId: plan.planId,
      expectedHash: plan.planHash,
      createdAt: oldCreated,
    });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.reason).toBe("plan_expired_preview_required_again");
  });

  it("L3 one-time token enforced in execute source; typed confirmation always", () => {
    const execute = read("lib/admin/data-reset/execute.ts");
    expect(execute).toContain("confirmationMatchesPlan");
    expect(execute).toContain("confirmationLevel >= 3");
    expect(execute).toContain("one_time_token_invalid");
    expect(execute).toContain("assertDataResetFailClosedDomain");
    expect(execute).toContain("PRODUCTION_SCOPE_BLOCKED");
  });

  it("audit preserved — not in delete tables for community/full", async () => {
    process.env.DATA_RESET_ENABLED = "1";
    process.env.PRELAUNCH_RESET_ENABLED = "1";
    const community = await buildDomainResetPlan({
      sb: mockSb({ community_posts: 1 }) as never,
      actorUserId: "admin",
      request: { domain: "community", scope: "all", mode: "preview" },
    });
    expect(community.delete.every((d) => d.table !== "audit_logs")).toBe(true);
    expect(community.preserve).toEqual(expect.arrayContaining(["finance ledgers"]));
  });
});

describe("chat hard delete not enabled", () => {
  it("chat plans never hard-delete community_messenger_rooms", async () => {
    process.env.DATA_RESET_ENABLED = "1";
    process.env.PRELAUNCH_RESET_ENABLED = "1";
    const chat = await buildDomainResetPlan({
      sb: mockSb({ community_messenger_rooms: 3 }) as never,
      actorUserId: "admin",
      request: { domain: "chat", scope: "all", mode: "preview" },
    });
    expect(chat.delete.every((d) => d.table !== "community_messenger_rooms")).toBe(true);
    expect(chat.softDelete.length + chat.detach.length).toBeGreaterThan(0);
  });
});

describe("first block documentation", () => {
  it("Data Reset production first block was env gate; allowlist owner is production-enable-policy", () => {
    const envSrc = read("lib/admin/data-reset/environment.ts");
    expect(envSrc).toContain("DATA_RESET_PRODUCTION_EXECUTE");
    expect(read("lib/admin/data-reset/production-enable-policy.ts")).toContain(
      "DATA_RESET_PRODUCTION_ENABLE_MATRIX"
    );
    // Prelaunch path still hard-blocks production execute independently.
    expect(read("lib/admin/prelaunch-reset/environment.ts")).toContain(
      "production_execute_forbidden"
    );
  });
});
