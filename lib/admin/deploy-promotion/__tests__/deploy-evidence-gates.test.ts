import { describe, expect, it } from "vitest";
import {
  evaluateRequiredGates,
  type DeployEvidenceRecord,
} from "@/lib/admin/deploy-promotion/deploy-evidence-gates";

function ev(
  gateId: string,
  result: DeployEvidenceRecord["result"]
): DeployEvidenceRecord {
  return {
    gateId,
    sha: "abc1234",
    testEnvId: "test",
    result,
    evidenceId: `e-${gateId}`,
    executedAt: "2026-10-15T00:00:00.000Z",
  };
}

describe("evaluateRequiredGates", () => {
  it("blocks when required gates missing", () => {
    const r = evaluateRequiredGates({
      sha: "abc1234",
      impact: "web_admin_deploy",
      evidence: [],
    });
    expect(r.ok).toBe(false);
    expect(r.blocking.some((b) => b.gateId === "runtime_isolation")).toBe(true);
  });

  it("passes only when all required are pass", () => {
    const r = evaluateRequiredGates({
      sha: "abc1234",
      impact: "web_admin_deploy",
      evidence: [
        ev("runtime_isolation", "pass"),
        ev("auth_login_profile", "pass"),
        ev("test_allowlist_enforced", "pass"),
      ],
    });
    expect(r.ok).toBe(true);
  });

  it("does not accept not_proven as pass", () => {
    const r = evaluateRequiredGates({
      sha: "abc1234",
      impact: "web_admin_deploy",
      evidence: [
        ev("runtime_isolation", "pass"),
        ev("auth_login_profile", "not_proven"),
        ev("test_allowlist_enforced", "pass"),
      ],
    });
    expect(r.ok).toBe(false);
  });
});
