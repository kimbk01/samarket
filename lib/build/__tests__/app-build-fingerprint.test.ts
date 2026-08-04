import { describe, expect, it } from "vitest";
import { getStaticAppBuildFingerprint } from "@/lib/build/app-build-fingerprint";

describe("app-build-fingerprint", () => {
  it("exposes gitSha without secrets", () => {
    const fp = getStaticAppBuildFingerprint();
    expect(fp.gitSha.length).toBeGreaterThanOrEqual(7);
    expect(fp.bundleId).toBe("com.dibay.app");
    expect(JSON.stringify(fp)).not.toMatch(/service.?role|private.?key|eyJ/i);
  });
});
