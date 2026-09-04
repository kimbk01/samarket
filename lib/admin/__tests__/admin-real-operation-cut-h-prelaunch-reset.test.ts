import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_REAL_OPERATION_CUT_H_LOCKED,
  CUT_H_PRODUCTION_CARRY,
  PRELAUNCH_RESET_HARD_LOCK,
  assertAdminRealOperationCutHPrelaunchResetHardLock,
} from "@/lib/admin/admin-real-operation-cut-h-prelaunch-reset-hard-lock";
import { PRELAUNCH_RESET_FORBIDDEN_OPS } from "@/lib/admin/prelaunch-reset/domain-inventory";
import { resolvePrelaunchResetEnvGate } from "@/lib/admin/prelaunch-reset/environment";
import { PRELAUNCH_RESET_PRESETS } from "@/lib/admin/prelaunch-reset/presets";
import {
  emptyCounts,
  hashPlanPayload,
  normalizeSelector,
  typedConfirmationForPlan,
  type PrelaunchResetPlan,
} from "@/lib/admin/prelaunch-reset/types";
import { confirmationMatches } from "@/lib/admin/prelaunch-reset/planner";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("CUT H Pre-launch Reset", () => {
  it("locks anchors + carry", () => {
    expect(ADMIN_REAL_OPERATION_CUT_H_LOCKED).toBe(true);
    expect(assertAdminRealOperationCutHPrelaunchResetHardLock()).toBe(true);
    expect(PRELAUNCH_RESET_HARD_LOCK.productionExecuteForbidden).toBe(true);
    expect(PRELAUNCH_RESET_HARD_LOCK.sharedPlannerRequired).toBe(true);
    expect(CUT_H_PRODUCTION_CARRY.placementActiveEligibility).toBe("DEFERRED_TO_CUT_I");
    expect(PRELAUNCH_RESET_FORBIDDEN_OPS.truncateCascadePublic).toContain("wipe-all-app-data");
  });

  it("H3 — Production execute fail-closed; dry-run opt-in only", () => {
    const gate = resolvePrelaunchResetEnvGate({
      NEXT_PUBLIC_APP_DEPLOY_TIER: "production",
      PRELAUNCH_RESET_ENABLED: "1",
    } as NodeJS.ProcessEnv);
    expect(gate.executeAllowed).toBe(false);
    expect(gate.dryRunAllowed).toBe(false);
    expect(gate.reasons.join(" ")).toMatch(/production_execute_forbidden/);
    expect(gate.reasons.join(" ")).toMatch(/production_dry_run_requires_explicit_opt_in/);

    const optIn = resolvePrelaunchResetEnvGate({
      NEXT_PUBLIC_APP_DEPLOY_TIER: "production",
      PRELAUNCH_RESET_PRODUCTION_DRY_RUN: "1",
    } as NodeJS.ProcessEnv);
    expect(optIn.executeAllowed).toBe(false);
    expect(optIn.dryRunAllowed).toBe(true);
  });

  it("H3b — execute requires PRELAUNCH_RESET_ENABLED on local", () => {
    const gate = resolvePrelaunchResetEnvGate({
      NEXT_PUBLIC_APP_DEPLOY_TIER: "local",
      NODE_ENV: "development",
      PRELAUNCH_RESET_ENABLED: "",
    } as NodeJS.ProcessEnv);
    expect(gate.executeAllowed).toBe(false);
  });

  it("H16 — typed confirmation is plan-bound", () => {
    const counts = emptyCounts();
    counts.content = 42;
    const hash = hashPlanPayload({ x: 1 });
    const phrase = typedConfirmationForPlan(counts, hash);
    expect(phrase).toContain("RESET TEST DATA 42");
    expect(phrase).toContain(hash.slice(0, 8));
    const plan = {
      typedConfirmationPhrase: phrase,
    } as PrelaunchResetPlan;
    expect(confirmationMatches(plan, phrase)).toBe(true);
    expect(confirmationMatches(plan, "DELETE")).toBe(false);
    expect(confirmationMatches(plan, "RESET TEST DATA 41 " + hash.slice(0, 8))).toBe(false);
  });

  it("H4/H5 — presets require explicit selectors where needed", () => {
    expect(PRELAUNCH_RESET_PRESETS.TEST_MEMBER_DATA.requiresExplicitMember).toBe(true);
    expect(PRELAUNCH_RESET_PRESETS.TEST_STORE_DATA.requiresExplicitStore).toBe(true);
    expect(PRELAUNCH_RESET_PRESETS.TEST_CONTENT_ONLY.executeAuthPhase).toBe("FORBIDDEN");
  });

  it("selector normalization drops empties", () => {
    expect(
      normalizeSelector({ memberIds: [" a ", "", "a"], storeIds: undefined as unknown as string[] })
        .memberIds
    ).toEqual(["a"]);
  });

  it("H1/H2/H18 — API routes use shared planner + super admin", () => {
    const dry = read("app/api/admin/prelaunch-reset/dry-run/route.ts");
    const exec = read("app/api/admin/prelaunch-reset/execute/route.ts");
    expect(dry).toContain("buildPrelaunchResetPlan");
    expect(dry).toContain("requireSuperAdmin");
    expect(exec).toContain("executePrelaunchReset");
    expect(exec).toContain("requireSuperAdmin");
    expect(exec).toContain("execute_forbidden");
    const execLib = read("lib/admin/prelaunch-reset/execute.ts");
    expect(execLib).toContain("revalidatePrelaunchResetPlan");
    expect(execLib).toContain("confirmationMatches");
    expect(execLib).toContain("appendAuditLog");
    expect(execLib).toContain("auth_user_delete_not_in_cut_h");
  });

  it("UI danger + no wipe-all wiring", () => {
    const ui = read("components/admin/prelaunch-reset/AdminPrelaunchResetPage.tsx");
    expect(ui).toContain("data-admin-prelaunch-reset");
    expect(ui).not.toContain("wipe-all-app-data");
    expect(ui).toContain("typedConfirmation");
    expect(read("components/admin/admin-menu.ts")).toContain("/admin/prelaunch-reset");
  });
});
