import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.PHONE_OTP_HASH_SECRET = "unit-test-phone-otp-hash-secret";

const loadAuthPhoneSettings = vi.fn();
vi.mock("@/lib/auth/auth-phone-settings", () => ({
  loadAuthPhoneSettings: (...args: unknown[]) => loadAuthPhoneSettings(...args),
}));
vi.mock("@/lib/auth/phone-otp-duplicate-check", () => ({
  findPhoneDuplicateOnOtherProfile: vi.fn(async () => null),
}));
vi.mock("@/lib/auth/semaphore-sms", () => ({
  sendSemaphoreSms: vi.fn(async () => ({ ok: true, providerMessageId: "x" })),
}));
vi.mock("@/lib/auth/phone-otp-ops", () => ({
  recordPhoneOtpDeliveryEvent: vi.fn(async () => undefined),
}));

describe("phone otp runtime enable gate", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.PHONE_OTP_HASH_SECRET = "unit-test-phone-otp-hash-secret";
    loadAuthPhoneSettings.mockResolvedValue({
      enabled: false,
      provider: "semaphore",
      otp_ttl_seconds: 300,
      resend_cooldown_seconds: 60,
      max_attempts: 5,
    });
  });

  it("send and verify both refuse when disabled", async () => {
    const { sendPhoneOtpForUser, verifyPhoneOtpForUser } = await import("@/lib/auth/phone-otp-service");
    const sb = {} as never;
    const send = await sendPhoneOtpForUser(sb, "u1", "+639171234567");
    const verify = await verifyPhoneOtpForUser(sb, "u1", "+639171234567", "123456");
    expect(send.ok).toBe(false);
    expect(verify.ok).toBe(false);
    if (!send.ok && !verify.ok) {
      expect(send.code).toBe("phone_verify_disabled");
      expect(verify.code).toBe("phone_verify_disabled");
    }
  });

  it("send refuses when hash secret missing even if enabled", async () => {
    delete process.env.PHONE_OTP_HASH_SECRET;
    loadAuthPhoneSettings.mockResolvedValue({
      enabled: true,
      provider: "semaphore",
      otp_ttl_seconds: 300,
      resend_cooldown_seconds: 60,
      max_attempts: 5,
    });
    const { sendPhoneOtpForUser } = await import("@/lib/auth/phone-otp-service");
    const send = await sendPhoneOtpForUser({} as never, "u1", "+639171234567");
    expect(send.ok).toBe(false);
    if (!send.ok) expect(send.code).toBe("phone_otp_hash_secret_missing");
  });
});
