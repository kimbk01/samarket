import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ── 세션 만들기: 차단·탈퇴 거부, 기존 경로 재사용 ──
const mint = vi.fn();
const syncActive = vi.fn();
const revoke = vi.fn();
vi.mock("@/lib/auth/native/native-owner-session.server", () => ({
  mintNativeOwnerSessionViaMagicLink: (...a: unknown[]) => mint(...a),
}));
vi.mock("@/lib/auth/server-guards", () => ({
  syncActiveSessionForUser: (...a: unknown[]) => syncActive(...a),
  validateActiveSession: vi.fn(),
}));
vi.mock("@/lib/auth/withdrawn-account-guard", () => ({
  revokeSessionForWithdrawnMember: (...a: unknown[]) => revoke(...a),
}));
vi.mock("@/lib/auth/get-onboarding-status", () => ({
  getOnboardingStatus: vi.fn(async () => ({
    signupComplete: true,
    consentComplete: true,
    dibayIdComplete: true,
    profileComplete: true,
  })),
}));
vi.mock("@/lib/auth/completion/resolve-common-auth-destination.server", () => ({
  resolveCommonAuthDestination: vi.fn(async () => ({ destination: "/home" })),
}));

function adminWithProfile(profile: { status: string | null; deleted_at: string | null } | null, email = "a@b.c") {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }),
    }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email } }, error: null }) } },
  } as never;
}

describe("PC QR login — establish session", () => {
  beforeEach(() => {
    mint.mockReset().mockResolvedValue({ id: "user-1" });
    syncActive.mockReset().mockResolvedValue({ sessionId: "s" });
    revoke.mockReset().mockResolvedValue("active");
  });

  async function run(profile: { status: string | null; deleted_at: string | null } | null) {
    const { establishPcQrLoginSession } = await import("@/lib/auth/pc-qr-login/pc-qr-login-session.server");
    return establishPcQrLoginSession({
      adminSb: adminWithProfile(profile),
      routeSb: {} as never,
      userId: "user-1",
      request: new NextRequest("https://samarket.vercel.app/api/auth/qr-login/status"),
      cookieCarrier: NextResponse.json({}),
      next: null,
    });
  }

  it("blocked / withdrawn members are refused before any session is minted", async () => {
    expect(await run({ status: "blocked", deleted_at: null })).toEqual({ ok: false, errorCode: "account_blocked" });
    expect(await run({ status: "active", deleted_at: "2026-01-01" })).toEqual({ ok: false, errorCode: "account_withdrawn" });
    expect(await run(null)).toEqual({ ok: false, errorCode: "account_state_unavailable" });
    expect(mint).not.toHaveBeenCalled();
  });

  it("active (and suspended) members get the existing mint → destination → active-session path", async () => {
    const r = await run({ status: "active", deleted_at: null });
    expect(r).toMatchObject({ ok: true, redirectTo: "/home", needsTermsAgreement: false });
    expect(mint).toHaveBeenCalledWith(expect.anything(), expect.anything(), "user-1", "a@b.c");
    expect(syncActive).toHaveBeenCalledTimes(1);
    expect(await run({ status: "suspended", deleted_at: null })).toMatchObject({ ok: true });
  });

  it("mint failure → session_failed (no silent success)", async () => {
    mint.mockRejectedValueOnce(new Error("x"));
    expect(await run({ status: "active", deleted_at: null })).toEqual({ ok: false, errorCode: "pc_qr_login_session_failed" });
  });
});

