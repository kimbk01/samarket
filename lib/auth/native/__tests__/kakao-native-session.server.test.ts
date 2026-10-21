import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { establishKakaoNativeSession } from "@/lib/auth/native/kakao-native-session.server";

const prelude = vi.fn();
const resolveMemberWithdrawalGuard = vi.fn();
const revokeSessionForWithdrawnMember = vi.fn();
const findAuthUserByEmail = vi.fn();

vi.mock("@/lib/auth/provider-identity/native-session-bridge.server", () => ({
  buildKakaoProviderCandidate: (v: { kakaoUserId: string }) => ({ provider: "kakao", providerUserId: v.kakaoUserId }),
  resolveNativeProviderSessionPrelude: (...args: unknown[]) => prelude(...args),
  ensureProviderAuthIdentityRow: vi.fn(async () => undefined),
}));
vi.mock("@/lib/auth/withdrawn-account-guard", () => ({
  resolveMemberWithdrawalGuard: (...args: unknown[]) => resolveMemberWithdrawalGuard(...args),
  revokeSessionForWithdrawnMember: (...args: unknown[]) => revokeSessionForWithdrawnMember(...args),
}));
vi.mock("@/lib/auth/naver-oauth", () => ({
  findAuthUserByEmail: (...args: unknown[]) => findAuthUserByEmail(...args),
}));
vi.mock("@/lib/auth/manual-member-login-credential", () => ({
  shouldPreserveAdminManagedPassword: vi.fn(async () => false),
}));
vi.mock("@/lib/auth/completion/ensure-auth-profile-for-login.server", () => ({
  ensureAuthProfileForLogin: vi.fn(async () => ({ ensureUserProfileOutcome: null })),
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
vi.mock("@/lib/auth/server-guards", () => ({
  syncActiveSessionForUser: vi.fn(async () => undefined),
}));

const OWNER_ID = "owner-1";
const KAKAO_ID = "555";
const SYNTHETIC = `kakao.${KAKAO_ID}@kakao.native.dibay.internal`;

function buildAdminSb(opts: { ownerEmail: string; profileProviderUserId?: string | null }) {
  const updateUserById = vi.fn(async () => ({ error: null }));
  const profileUpdateEq = vi.fn(async () => ({ error: null }));
  const generateLink = vi.fn(async () => ({
    data: { properties: { hashed_token: "th" }, user: { id: OWNER_ID } },
    error: null,
  }));
  const adminSb = {
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({ data: { user: { id: OWNER_ID, email: opts.ownerEmail } }, error: null })),
        updateUserById,
        createUser: vi.fn(),
        generateLink,
      },
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { provider_user_id: opts.profileProviderUserId ?? null },
            error: null,
          }),
        }),
      }),
      update: () => ({ eq: profileUpdateEq }),
    })),
  } as unknown as SupabaseClient;
  return { adminSb, updateUserById, profileUpdateEq, generateLink };
}

function ctx(adminSb: SupabaseClient, routeSb: SupabaseClient) {
  return {
    adminSb,
    routeSb,
    request: new Request("https://samarket.vercel.app/api/auth/native/exchange") as never,
    response: {} as never,
  };
}

const verified = { kakaoUserId: KAKAO_ID, hasEmailFromProfile: true, email: "k@kakao.com" };

describe("kakao-native-session.server (P1-7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    prelude.mockResolvedValue({ ok: true, existingUserId: OWNER_ID, identityId: "idn" });
    resolveMemberWithdrawalGuard.mockResolvedValue("active");
    revokeSessionForWithdrawnMember.mockResolvedValue("active");
  });

  it("withdrawn owner: 403 before any auth/profile mutation", async () => {
    resolveMemberWithdrawalGuard.mockResolvedValue("withdrawn");
    const { adminSb, updateUserById, profileUpdateEq } = buildAdminSb({ ownerEmail: SYNTHETIC });
    const signInWithPassword = vi.fn();

    const result = await establishKakaoNativeSession(
      ctx(adminSb, { auth: { signInWithPassword } } as unknown as SupabaseClient),
      { verified },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("account_withdrawn");
    expect(updateUserById).not.toHaveBeenCalled();
    expect(profileUpdateEq).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("linked non-synthetic owner: magiclink session, email/password/profile identity untouched", async () => {
    const { adminSb, updateUserById, profileUpdateEq, generateLink } = buildAdminSb({
      ownerEmail: "owner@gmail.com",
      profileProviderUserId: "google-sub-1",
    });
    const signInWithPassword = vi.fn();
    const verifyOtp = vi.fn(async () => ({
      data: { user: { id: OWNER_ID }, session: { access_token: "a" } },
      error: null,
    }));

    const result = await establishKakaoNativeSession(
      ctx(adminSb, { auth: { signInWithPassword, verifyOtp, signOut: vi.fn() } } as unknown as SupabaseClient),
      { verified },
    );

    expect(result.ok).toBe(true);
    expect(updateUserById).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "owner@gmail.com" });
    // provider_user_id 가 이미 있으면(google) Kakao 로 뒤집지 않는다.
    expect(profileUpdateEq).not.toHaveBeenCalled();
  });

  it("Kakao synthetic owner keeps the password session path", async () => {
    const { adminSb, updateUserById, profileUpdateEq } = buildAdminSb({ ownerEmail: SYNTHETIC });
    const signInWithPassword = vi.fn(async () => ({ data: { user: { id: OWNER_ID } }, error: null }));

    const result = await establishKakaoNativeSession(
      ctx(adminSb, { auth: { signInWithPassword } } as unknown as SupabaseClient),
      { verified },
    );

    expect(result.ok).toBe(true);
    expect(updateUserById).toHaveBeenCalledWith(
      OWNER_ID,
      expect.objectContaining({ email: SYNTHETIC, password: expect.any(String) }),
    );
    expect(signInWithPassword).toHaveBeenCalledWith({ email: SYNTHETIC, password: expect.any(String) });
    // 최초 기록 (provider_user_id 비어 있음) 은 허용.
    expect(profileUpdateEq).toHaveBeenCalledWith("id", OWNER_ID);
  });
});
