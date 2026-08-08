import { describe, expect, it } from "vitest";
import { applyTrustScoreDelta, applyTrustScoreDeltaToMany } from "@/lib/trust/trust-score-apply";

describe("legacy applyTrustScoreDelta removed (Manner Battery SSOT)", () => {
  it("applyTrustScoreDelta throws and directs to recordTrustEvent", async () => {
    await expect(
      applyTrustScoreDelta({} as never, {
        userId: "user-a",
        sourceType: "admin_adjust",
        baseDelta: 5,
        skipDailyCap: true,
        reason: "slice1_test",
      })
    ).rejects.toThrow(/recordTrustEvent/);
  });

  it("applyTrustScoreDeltaToMany throws", async () => {
    await expect(
      applyTrustScoreDeltaToMany({} as never, ["user-a"], {
        sourceType: "admin_adjust",
        baseDelta: 1,
      })
    ).rejects.toThrow(/recordTrustEvent/);
  });
});
