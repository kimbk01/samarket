/**
 * B7/B8 — sending an OTP must not demote a verified member nor reserve the requested number on the
 * profile (profiles_phone_unique_idx). Profile phone / verified state change only on verify success.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/auth-phone-settings", () => ({
  loadAuthPhoneSettings: vi.fn(async () => ({
    enabled: true,
    provider: "semaphore",
    otp_ttl_seconds: 300,
    resend_cooldown_seconds: 60,
    max_attempts: 5,
  })),
}));
vi.mock("@/lib/auth/phone-otp-duplicate-check", () => ({
  findPhoneDuplicateOnOtherProfile: vi.fn(async () => null),
}));
vi.mock("@/lib/auth/semaphore-sms", () => ({
  sendSemaphoreSms: vi.fn(async () => ({ ok: true })),
}));

type Write = { table: string; op: string; values: Record<string, unknown>; filters: string[] };

function fakeSb(profileState: Record<string, unknown>, opts?: { verifyUpdateError?: { code: string; message: string } }) {
  const writes: Write[] = [];
  const builder = (table: string) => {
    let op = "select";
    let values: Record<string, unknown> = {};
    const filters: string[] = [];
    const chain: Record<string, unknown> = {};
    const finish = () => {
      if (op !== "select") writes.push({ table, op, values, filters: [...filters] });
      const isVerifyWrite = op === "update" && table === "profiles" && values.phone_verified === true;
      if (isVerifyWrite && opts?.verifyUpdateError) return { data: null, error: opts.verifyUpdateError };
      if (table === "phone_otp_challenges" && op === "select") return { data: challenge, error: null };
      if (table === "profiles" && op === "select") return { data: profileState, error: null };
      return { data: null, error: null };
    };
    Object.assign(chain, {
      select: () => chain,
      update: (v: Record<string, unknown>) => {
        op = "update";
        values = v;
        return chain;
      },
      upsert: (v: Record<string, unknown>) => {
        op = "upsert";
        values = v;
        if (table === "phone_otp_challenges") challenge = { ...v } as typeof challenge;
        return Promise.resolve(finish());
      },
      eq: (c: string, v: unknown) => {
        filters.push(`eq:${c}=${String(v)}`);
        return chain;
      },
      or: (expr: string) => {
        filters.push(`or:${expr}`);
        return chain;
      },
      maybeSingle: () => Promise.resolve(finish()),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(finish()).then(res, rej),
    });
    return chain;
  };
  let challenge: Record<string, unknown> | null = null;
  return { sb: { from: builder } as never, writes, getChallenge: () => challenge };
}

describe("B7/B8 OTP send preserves profile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("send does not clear phone_verified nor write the requested number to the profile", async () => {
    const { sendPhoneOtpForUser } = await import("@/lib/auth/phone-otp-service");
    const { sb, writes } = fakeSb({ phone_verification_requested_at: null, phone_verification_attempt_count: 0 });
    const res = await sendPhoneOtpForUser(sb, "user-1", "+639171234567");
    expect(res.ok).toBe(true);
    const profileWrites = writes.filter((w) => w.table === "profiles");
    for (const w of profileWrites) {
      expect(w.values).not.toHaveProperty("phone");
      expect(w.values).not.toHaveProperty("phone_number");
      expect(w.values).not.toHaveProperty("phone_verified");
      expect(w.values).not.toHaveProperty("phone_verified_at");
    }
    // pending status only for not-yet-verified members
    const pending = profileWrites.find((w) => w.values.phone_verification_status === "pending");
    expect(pending?.filters).toContain("or:phone_verified.is.null,phone_verified.eq.false");
    // requested number kept on the challenge only
    expect(writes.find((w) => w.table === "phone_otp_challenges")?.values.phone).toBeTruthy();
  });

  it("verify maps a unique-index race to phone_duplicate (409), not 500", async () => {
    const svc = await import("@/lib/auth/phone-otp-service");
    const { sb, getChallenge } = fakeSb(
      { phone_verification_requested_at: null, phone_verification_attempt_count: 0 },
      { verifyUpdateError: { code: "23505", message: "duplicate key value violates unique constraint" } },
    );
    await svc.sendPhoneOtpForUser(sb, "user-1", "+639171234567");
    expect(getChallenge()).not.toBeNull();
    // Unknown code → otp_invalid path; force the hash to match by reading what send stored is not
    // possible (random code) — so assert the mapping via a direct verify with a known challenge.
    const known = await import("node:crypto");
    const code = "123456";
    const secret = process.env.PHONE_OTP_HASH_SECRET?.trim() || "samarket-phone-otp-hash";
    const ch = getChallenge()!;
    ch.otp_code_hash = known.createHash("sha256").update(`${String(ch.phone)}:${code}:${secret}`).digest("hex");
    ch.attempt_count = 0;
    const res = await svc.verifyPhoneOtpForUser(sb, "user-1", "+639171234567", code);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(409);
      expect(res.code).toBe("phone_duplicate");
    }
  });
});
