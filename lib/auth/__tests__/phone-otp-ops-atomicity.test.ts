import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/auth-phone-settings", () => ({
  loadAuthPhoneSettings: vi.fn(async () => ({
    id: "settings-1",
    enabled: false,
    country_code: "PH",
    provider: "semaphore",
    sms_from_name: null,
    otp_ttl_seconds: 300,
    resend_cooldown_seconds: 60,
    max_attempts: 5,
    guide_text: "guide",
    row_version: 3,
  })),
  isPhoneOtpEnvEnableConflictPresent: () => false,
}));

vi.mock("@/lib/auth/phone-otp-hash-secret", () => ({
  isPhoneOtpHashSecretConfigured: () => true,
}));

vi.mock("@/lib/env/semaphore-sms", () => ({
  requireSemaphoreSmsEnv: () => ({
    ok: true,
    apiKey: "k",
    senderName: "DIBAY",
    apiBaseUrl: "https://api.semaphore.co/api/v4",
  }),
}));

vi.mock("@/lib/audit/append-audit-log", () => ({
  appendAuditLog: vi.fn(async () => undefined),
}));

describe("setAuthPhoneOtpEnabled atomicity (RPC-only)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("RPC failure does not update settings or invalidate challenges", async () => {
    const from = vi.fn(() => {
      throw new Error("from() must not be called on RPC failure");
    });
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "function admin_set_auth_phone_otp_enabled(boolean, text, uuid, integer) does not exist" },
    }));
    const sb = { rpc, from } as never;

    const { setAuthPhoneOtpEnabled } = await import("@/lib/auth/phone-otp-ops");
    const res = await setAuthPhoneOtpEnabled({
      sb,
      actorId: "admin-1",
      enabled: true,
      reason: "테스트 활성화",
      expectedVersion: 3,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("rpc_unavailable");
      expect(res.status).toBe(503);
    }
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it("RPC success path does not use separate settings/challenge writers", async () => {
    const from = vi.fn(() => {
      throw new Error("from() must not be used for enable — RPC owns the transaction");
    });
    const rpc = vi.fn(async () => ({
      data: {
        ok: true,
        enabled: false,
        row_version: 4,
        invalidated_challenges: 2,
      },
      error: null,
    }));
    const sb = { rpc, from } as never;

    const { setAuthPhoneOtpEnabled } = await import("@/lib/auth/phone-otp-ops");
    const res = await setAuthPhoneOtpEnabled({
      sb,
      actorId: "admin-1",
      enabled: false,
      reason: "점검 OFF",
      expectedVersion: 3,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.invalidatedChallenges).toBe(2);
      expect(res.rowVersion).toBe(4);
    }
    expect(rpc).toHaveBeenCalledWith("admin_set_auth_phone_otp_enabled", {
      p_enabled: false,
      p_reason: "점검 OFF",
      p_actor_id: "admin-1",
      p_expected_version: 3,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("migration SQL defines single-transaction OFF invalidate", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261019123000_phone_otp_ops_admin.sql"),
      "utf8",
    );
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_set_auth_phone_otp_enabled");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("UPDATE public.auth_phone_settings");
    expect(sql).toContain("UPDATE public.phone_otp_challenges");
    expect(sql).toContain("WHERE verified_at IS NULL");
    // No separate commit between settings and challenges inside the function body.
    expect(sql).not.toMatch(/COMMIT/i);
  });
});
