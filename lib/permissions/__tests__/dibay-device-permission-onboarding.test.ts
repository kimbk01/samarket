import { beforeEach, describe, expect, it, vi } from "vitest";

function createSessionStorage() {
  const map = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => map.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      map.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      map.delete(key);
    }),
  };
}

describe("dibay-device-permission-onboarding", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", {
      sessionStorage: createSessionStorage(),
    });
  });

  it("markCallMediaOnboardingPendingSource is consumed by resolveCallMediaOnboardingSource", async () => {
    const {
      DIBAY_CALL_MEDIA_PENDING_SOURCE_KEY,
      markCallMediaOnboardingPendingSource,
      resolveCallMediaOnboardingSource,
    } = await import("@/lib/permissions/dibay-device-permission-onboarding");
    markCallMediaOnboardingPendingSource("signup_complete");
    expect(window.sessionStorage.getItem(DIBAY_CALL_MEDIA_PENDING_SOURCE_KEY)).toBe("signup_complete");
    expect(resolveCallMediaOnboardingSource()).toBe("signup_complete");
    expect(resolveCallMediaOnboardingSource()).toBe("app_entry");
  });
});
