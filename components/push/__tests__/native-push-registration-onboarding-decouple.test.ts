import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("NativePushRegistration onboarding decouple", () => {
  it("does not await notification onboarding settle before alert APNs register", () => {
    const src = read("components/push/NativePushRegistration.tsx");
    expect(src).not.toContain("waitForNotificationOnboardingSettled");
    expect(src).toContain("independent of UI onboarding");
  });

  it("marks onboarding settled on post-login gate early skips", () => {
    const src = read("components/permissions/DiBaYDevicePermissionOnboardingGate.tsx");
    expect(src).toContain("markNotificationOnboardingSettled()");
    expect(src).toMatch(
      /isPostLoginOnboardingPathEligible[\s\S]*markNotificationOnboardingSettled/,
    );
    expect(src).toMatch(
      /canAttemptPostLoginOnboardingGate[\s\S]*markNotificationOnboardingSettled/,
    );
  });
});
