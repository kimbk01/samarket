import { describe, expect, it } from "vitest";
import {
  evaluateProductionPromoteExecution,
  evaluateProductionRollbackExecution,
} from "@/lib/admin/deploy-promotion/deploy-execution-guard";

describe("deploy-execution-guard", () => {
  it("blocks when promote not enabled", () => {
    const r = evaluateProductionPromoteExecution({});
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("promote_not_enabled");
  });

  it("blocks when enabled but not unlocked", () => {
    const r = evaluateProductionPromoteExecution({
      DIBAY_PROMOTE_ENABLED: "1",
    } as NodeJS.ProcessEnv);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("production_execution_blocked");
  });

  it("allows only with dual unlock", () => {
    const r = evaluateProductionPromoteExecution({
      DIBAY_PROMOTE_ENABLED: "1",
      DIBAY_PROMOTE_EXECUTION_UNLOCKED: "1",
    } as NodeJS.ProcessEnv);
    expect(r.allowed).toBe(true);
  });

  it("rollback shares unlock gate", () => {
    const r = evaluateProductionRollbackExecution({
      DIBAY_PROMOTE_ENABLED: "1",
    } as NodeJS.ProcessEnv);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("rollback_execution_blocked");
  });
});
