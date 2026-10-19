import { afterEach, describe, expect, it, vi } from "vitest";
import {
  derivePhoneOtpOpsHealth,
  evaluatePhoneOtpSecurityGate,
} from "@/lib/auth/phone-otp-ops";
import { clearSemaphoreAccountProbeCacheForTests } from "@/lib/auth/semaphore-account";
import { isPhoneOtpEnvEnableConflictPresent } from "@/lib/auth/auth-phone-settings";
import { resolvePhoneOtpHashSecret } from "@/lib/auth/phone-otp-hash-secret";

describe("phone-otp-ops contract", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearSemaphoreAccountProbeCacheForTests();
  });

  it("requires hash secret and rejects default fallback string", () => {
    vi.stubEnv("PHONE_OTP_HASH_SECRET", "");
    expect(resolvePhoneOtpHashSecret().ok).toBe(false);
    vi.stubEnv("PHONE_OTP_HASH_SECRET", "samarket-phone-otp-hash");
    expect(resolvePhoneOtpHashSecret().ok).toBe(false);
    vi.stubEnv("PHONE_OTP_HASH_SECRET", "unit-test-secret-value");
    expect(resolvePhoneOtpHashSecret()).toEqual({ ok: true, secret: "unit-test-secret-value" });
  });

  it("treats PHONE_OTP_ENABLED as conflict signal (no silent override)", () => {
    vi.stubEnv("PHONE_OTP_ENABLED", undefined as unknown as string);
    delete process.env.PHONE_OTP_ENABLED;
    expect(isPhoneOtpEnvEnableConflictPresent()).toBe(false);
    vi.stubEnv("PHONE_OTP_ENABLED", "1");
    expect(isPhoneOtpEnvEnableConflictPresent()).toBe(true);
  });

  it("separates admin_stopped from provider_down when enabled is off", () => {
    const security = {
      ok: true,
      missing: [] as string[],
      envEnableConflict: false,
      hashSecretConfigured: true,
      semaphoreKeyConfigured: true,
    };
    const stopped = derivePhoneOtpOpsHealth({
      enabled: false,
      security,
      provider: {
        ok: false,
        checkedAt: new Date().toISOString(),
        kind: "provider_error",
        httpStatus: 500,
        detail: "down",
      },
      creditLowThreshold: 0,
    });
    expect(stopped.health).toBe("admin_stopped");

    const down = derivePhoneOtpOpsHealth({
      enabled: true,
      security,
      provider: {
        ok: false,
        checkedAt: new Date().toISOString(),
        kind: "provider_error",
        httpStatus: 500,
        detail: "down",
      },
      creditLowThreshold: 0,
    });
    expect(down.health).toBe("provider_down");
  });

  it("marks low_balance only from measured credit", () => {
    const security = evaluatePhoneOtpSecurityGate();
    // Force security ok for health derive by constructing gate
    const gate = {
      ok: true,
      missing: [] as string[],
      envEnableConflict: false,
      hashSecretConfigured: true,
      semaphoreKeyConfigured: true,
    };
    const low = derivePhoneOtpOpsHealth({
      enabled: true,
      security: gate,
      provider: {
        ok: true,
        checkedAt: new Date().toISOString(),
        accountId: 1,
        accountName: "t",
        status: "Active",
        creditBalance: 0,
        rateLimitRemaining: 0,
      },
      creditLowThreshold: 0,
    });
    expect(low.health).toBe("low_balance");
    void security;
  });
});
