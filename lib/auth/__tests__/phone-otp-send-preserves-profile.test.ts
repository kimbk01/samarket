/**
 * B7/B8 — sending an OTP must not demote a verified member nor reserve the requested number on the
 * profile (profiles_phone_unique_idx). Profile phone / verified state change only on verify success.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.PHONE_OTP_HASH_SECRET = "unit-test-phone-otp-hash-secret";

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
  sendSemaphoreSms: vi.fn(async () => ({ ok: true, providerMessageId: "msg-1" })),
}));
vi.mock("@/lib/auth/phone-otp-ops", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/phone-otp-ops")>(
    "@/lib/auth/phone-otp-ops",
  );
  return {
    ...actual,
    recordPhoneOtpDeliveryEvent: vi.fn(async () => undefined),
  };
});

type Write = { table: string; op: string; values: Record<string, unknown>; filters: string[] };

function fakeSb(
  profileState: Record<string, unknown>,
  opts?: { verifyUpdateError?: { code: string; message: string }; promoteMatchesNoRow?: boolean },
) {
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
      if (isVerifyWrite && values.status === "verified_user") {
        return { data: opts?.promoteMatchesNoRow ? [] : [{ id: "user-1" }], error: null };
      }
      if (table === "phone_otp_challenges" && op === "select") return { data: challenge, error: null };
      if (table === "profiles" && op === "select") return { data: profileState, error: null };
      return { data: null, error: null };
    };
    Object.assign(chain, {
      select: () => chain,
      is: (c: string, v: unknown) => {
        filters.push(`is:${c}=${String(v)}`);
        return chain;
      },
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
    const secret = process.env.PHONE_OTP_HASH_SECRET!.trim();
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

  async function verifyWithKnownCode(
    profileState: Record<string, unknown>,
    opts?: { promoteMatchesNoRow?: boolean },
  ) {
    const svc = await import("@/lib/auth/phone-otp-service");
    const { sb, writes, getChallenge } = fakeSb(profileState, opts);
    await svc.sendPhoneOtpForUser(sb, "user-1", "+639171234567");
    const known = await import("node:crypto");
    const code = "123456";
    const secret = process.env.PHONE_OTP_HASH_SECRET!.trim();
    const ch = getChallenge()!;
    ch.otp_code_hash = known.createHash("sha256").update(`${String(ch.phone)}:${code}:${secret}`).digest("hex");
    ch.attempt_count = 0;
    writes.length = 0;
    const res = await svc.verifyPhoneOtpForUser(sb, "user-1", "+639171234567", code);
    const verifyWrites = writes.filter((w) => w.table === "profiles" && w.values.phone_verified === true);
    return { res, verifyWrites };
  }

  it("P1-1: verify on a suspended member writes phone fields only — status unchanged", async () => {
    for (const status of ["suspended", "blocked", "withdrawn", "deleted"]) {
      const { res, verifyWrites } = await verifyWithKnownCode({
        phone_verification_requested_at: null,
        phone_verification_attempt_count: 0,
        status,
        member_status: "active",
      });
      expect(res.ok).toBe(true);
      expect(verifyWrites).toHaveLength(1);
      expect(verifyWrites[0].values.phone).toBeTruthy();
      expect(verifyWrites[0].values).not.toHaveProperty("status");
      expect(verifyWrites[0].values).not.toHaveProperty("member_status");
      expect(verifyWrites[0].values).not.toHaveProperty("verified_member_at");
    }
  });

  it("P1-1: verify on a withdrawn row (deleted_at) keeps status", async () => {
    const { res, verifyWrites } = await verifyWithKnownCode({
      phone_verification_attempt_count: 0,
      status: "active",
      deleted_at: "2026-10-01T00:00:00Z",
    });
    expect(res.ok).toBe(true);
    expect(verifyWrites).toHaveLength(1);
    expect(verifyWrites[0].values).not.toHaveProperty("status");
  });

  it("P1-1: verify on a normal pending member promotes as before (guarded update)", async () => {
    const { res, verifyWrites } = await verifyWithKnownCode({
      phone_verification_attempt_count: 0,
      status: "pending",
      member_status: "pending",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.member_status).toBe("active");
    expect(verifyWrites).toHaveLength(1);
    expect(verifyWrites[0].values).toMatchObject({ status: "verified_user", member_status: "active" });
    expect(verifyWrites[0].filters).toContain("is:deleted_at=null");
    expect(verifyWrites[0].filters.some((f) => f.includes("status.not.in.(suspended,blocked"))).toBe(true);
  });

  it("P1-1: suspended between read and write (guard matched no row) → phone-only fallback", async () => {
    const { res, verifyWrites } = await verifyWithKnownCode(
      { phone_verification_attempt_count: 0, status: null, member_status: "pending" },
      { promoteMatchesNoRow: true },
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.member_status).toBe("pending");
    expect(verifyWrites).toHaveLength(2);
    expect(verifyWrites[1].values).not.toHaveProperty("status");
  });
});
