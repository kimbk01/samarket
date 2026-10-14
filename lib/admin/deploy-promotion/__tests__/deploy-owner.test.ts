import { describe, expect, it } from "vitest";
import { isDeployOwnerUserId } from "@/lib/admin/deploy-promotion/deploy-owner";

describe("deploy-owner", () => {
  it("denies when owner ids empty", () => {
    expect(isDeployOwnerUserId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", {})).toBe(false);
  });

  it("matches configured owner id case-insensitively", () => {
    const env = {
      DIBAY_DEPLOY_OWNER_IDS: "AAAAAAAA-bbbb-cccc-dddd-eeeeeeeeeeee",
    } as NodeJS.ProcessEnv;
    expect(
      isDeployOwnerUserId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", env)
    ).toBe(true);
    expect(
      isDeployOwnerUserId("11111111-2222-3333-4444-555555555555", env)
    ).toBe(false);
  });
});
