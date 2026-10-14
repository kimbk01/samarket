import { describe, expect, it } from "vitest";
import {
  DEPLOY_FEATURE_TEST_CATALOG,
  buildFeatureTestRows,
} from "@/lib/admin/deploy-promotion/deploy-feature-test-catalog";
import { buildTestEnvCard } from "@/lib/admin/deploy-promotion/deploy-ops-remote";

describe("deploy feature test catalog", () => {
  it("keeps manual device rows NOT_PROVEN without evidence", () => {
    const rows = buildFeatureTestRows({
      sha: "abc123",
      evidenceByGate: new Map([
        [
          "runtime_isolation",
          {
            result: "pass",
            evidenceId: "e1",
            executedAt: "2026-10-15T00:00:00.000Z",
            detail: null,
          },
        ],
      ]),
    });
    const android = rows.find((r) => r.featureId === "android_app");
    const isolation = rows.find((r) => r.featureId === "runtime_isolation");
    expect(android?.result).toBe("not_proven");
    expect(android?.reverifyNeeded).toBe(true);
    expect(isolation?.result).toBe("pass");
    expect(DEPLOY_FEATURE_TEST_CATALOG.length).toBeGreaterThanOrEqual(10);
  });

  it("buildTestEnvCard marks non_production as testable", () => {
    const card = buildTestEnvCard({
      runtimeSha: "deadbeef",
      projectRef: "tcwnueuzuxftyomttdyu",
      databaseTarget: "non_production",
      bannerVariant: "test",
      vercelTargetEnv: "test",
      deploymentUrl: "https://example.test",
      promoteAllowed: false,
    });
    expect(card.status).toBe("ok");
    expect(card.canTest).toBe(true);
    expect(card.canPromoteToProduction).toBe(false);
  });
});
