import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  isEmailEligibleForPasswordMemberMatch,
  isDibayInternalOrQaAuthEmail,
  normalizeProviderEmail,
  readProviderEmailVerifiedSignal,
} from "@/lib/auth/provider-identity/email-policy";
import {
  authUserHasPasswordCredential,
  classifyPasswordMemberGate,
  findPasswordMemberCandidateByVerifiedEmail,
  PROVIDER_ACCOUNT_LINK_REQUIRED,
} from "@/lib/auth/provider-identity/password-member-lookup.server";
import {
  buildAppleProviderCandidate,
  buildGoogleProviderCandidate,
  buildKakaoProviderCandidate,
  resolveNativeProviderSessionPrelude,
} from "@/lib/auth/provider-identity/native-session-bridge.server";
import { resolveProviderLogin } from "@/lib/auth/provider-identity/resolve-provider-login.server";
import { buildOAuthUserProviderCandidate } from "@/lib/auth/provider-identity/web-oauth-policy.server";
import { mapAuthErrorMessage } from "@/lib/auth/login-error-i18n";

function passwordAuthUser(id: string, email: string): User {
  return {
    id,
    email,
    identities: [
      {
        id: `email-${id}`,
        identity_id: `email-${id}`,
        user_id: id,
        provider: "email",
        identity_data: { email },
        created_at: "",
        last_sign_in_at: "",
        updated_at: "",
      },
    ],
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    aud: "authenticated",
    created_at: "",
  } as unknown as User;
}

function socialOnlyAuthUser(id: string, email: string): User {
  return {
    id,
    email,
    identities: [
      {
        id: `g-${id}`,
        identity_id: `g-${id}`,
        user_id: id,
        provider: "google",
        identity_data: { sub: "gs", email, email_verified: true },
        created_at: "",
        last_sign_in_at: "",
        updated_at: "",
      },
    ],
    app_metadata: { provider: "google", providers: ["google"] },
    user_metadata: {},
    aud: "authenticated",
    created_at: "",
  } as unknown as User;
}

function mockSb(opts: {
  identities?: Array<Record<string, unknown>>;
  profiles?: Array<Record<string, unknown>>;
  authUsers?: User[];
}) {
  const identityRows = opts.identities ?? [];
  const profileRows = opts.profiles ?? [];
  const authUsers = opts.authUsers ?? [];

  const from = vi.fn((table: string) => {
    const state: Record<string, unknown> = {};
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((col: string, val: unknown) => {
        state[col] = val;
        return builder;
      }),
      neq: vi.fn((col: string, val: unknown) => {
        state[`neq:${col}`] = val;
        return builder;
      }),
      ilike: vi.fn((col: string, val: unknown) => {
        state[`ilike:${col}`] = val;
        return builder;
      }),
      order: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => {
        if (table === "user_auth_identities") {
          const match = identityRows.find((row) => {
            if (state.provider && row.provider !== state.provider) return false;
            if (state.provider_user_id && row.provider_user_id !== state.provider_user_id) {
              return false;
            }
            return true;
          });
          return { data: match ?? null, error: null };
        }
        if (table === "profiles") {
          if (state.id) {
            const match = profileRows.find((row) => row.id === state.id);
            return { data: match ?? null, error: null };
          }
          const match = profileRows.find((row) => {
            if (state.provider && row.provider !== state.provider) return false;
            if (state.provider_user_id && row.provider_user_id !== state.provider_user_id) {
              return false;
            }
            if (state.auth_provider && row.auth_provider !== state.auth_provider) return false;
            return true;
          });
          return { data: match ?? null, error: null };
        }
        return { data: null, error: null };
      }),
    };
    Object.defineProperty(builder, "then", {
      get() {
        return (resolve: (v: unknown) => void) => {
          if (table === "user_auth_identities" && !state.provider_user_id) {
            const filtered = identityRows.filter((row) => {
              if (state[`neq:provider`] && row.provider === state[`neq:provider`]) return false;
              if (state.email) {
                const email = String(row.email ?? "").toLowerCase();
                if (email !== String(state.email).toLowerCase()) return false;
              }
              if (state.email_is_private_relay === false && row.email_is_private_relay === true) {
                return false;
              }
              return true;
            });
            resolve({ data: filtered, error: null });
            return;
          }
          resolve({ data: [], error: null });
        };
      },
    });
    return builder;
  });

  return {
    from,
    auth: {
      admin: {
        listUsers: vi.fn(async () => ({
          data: { users: authUsers },
          error: null,
        })),
      },
    },
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

describe("Package D email eligibility", () => {
  it("D11/D12/D20 excludes relay and synthetic/internal", () => {
    expect(isEmailEligibleForPasswordMemberMatch("a@privaterelay.appleid.com")).toBe(false);
    expect(isEmailEligibleForPasswordMemberMatch("x@oauth-landing.dibay.internal")).toBe(false);
    expect(isEmailEligibleForPasswordMemberMatch("g@google.native.dibay.internal")).toBe(false);
    expect(isEmailEligibleForPasswordMemberMatch("ops@manual.local")).toBe(false);
    expect(isEmailEligibleForPasswordMemberMatch("u@qa.dibay.invalid")).toBe(false);
    expect(isDibayInternalOrQaAuthEmail("pad@oauth-landing.dibay.internal")).toBe(true);
    expect(isEmailEligibleForPasswordMemberMatch("user@gmail.com")).toBe(true);
    expect(normalizeProviderEmail("  A@Gmail.COM ")).toBe("a@gmail.com");
  });

  it("D16–D19 verified signal helpers", () => {
    expect(readProviderEmailVerifiedSignal(true)).toBe(true);
    expect(readProviderEmailVerifiedSignal("true")).toBe(true);
    expect(readProviderEmailVerifiedSignal(false)).toBe(false);
    expect(readProviderEmailVerifiedSignal(undefined)).toBe(false);
    expect(readProviderEmailVerifiedSignal("yes")).toBe(false);
  });
});

describe("password member lookup authority", () => {
  it("requires password credential + profile; ignores social-only Auth email", async () => {
    expect(authUserHasPasswordCredential(passwordAuthUser("p1", "a@gmail.com"))).toBe(true);
    expect(authUserHasPasswordCredential(socialOnlyAuthUser("s1", "a@gmail.com"))).toBe(false);

    const none = await findPasswordMemberCandidateByVerifiedEmail(
      mockSb({
        authUsers: [socialOnlyAuthUser("s1", "a@gmail.com")],
        profiles: [{ id: "s1", status: "verified_user" }],
      }),
      "a@gmail.com",
    );
    expect(none.status).toBe("none");

    const hit = await findPasswordMemberCandidateByVerifiedEmail(
      mockSb({
        authUsers: [passwordAuthUser("p1", "a@gmail.com")],
        profiles: [{ id: "p1", status: "verified_user", deleted_at: null }],
      }),
      "a@gmail.com",
    );
    expect(hit.status).toBe("one");
    if (hit.status === "one") expect(hit.candidate.userId).toBe("p1");
  });

  it("D10 fail-closed on unexpected >1 Auth email matches", async () => {
    const result = await findPasswordMemberCandidateByVerifiedEmail(
      mockSb({
        authUsers: [
          passwordAuthUser("p1", "dup@gmail.com"),
          passwordAuthUser("p2", "dup@gmail.com"),
        ],
        profiles: [
          { id: "p1", status: "verified_user" },
          { id: "p2", status: "verified_user" },
        ],
      }),
      "dup@gmail.com",
    );
    expect(result.status).toBe("ambiguous");
  });

  it("lifecycle classification matrix", () => {
    expect(classifyPasswordMemberGate({
      userId: "u",
      profileStatus: "verified_user",
      deletedAt: null,
    }).kind).toBe("account_link_required");
    expect(classifyPasswordMemberGate({
      userId: "u",
      profileStatus: "sns_pending",
      deletedAt: null,
    }).kind).toBe("account_link_required");
    expect(classifyPasswordMemberGate({
      userId: "u",
      profileStatus: "suspended",
      deletedAt: null,
    })).toMatchObject({ kind: "lifecycle_deny", errorCode: "account_suspended" });
    expect(classifyPasswordMemberGate({
      userId: "u",
      profileStatus: "blocked",
      deletedAt: null,
    })).toMatchObject({ kind: "lifecycle_deny", errorCode: "account_blocked" });
    expect(classifyPasswordMemberGate({
      userId: "u",
      profileStatus: "deleted",
      deletedAt: null,
    })).toMatchObject({ kind: "lifecycle_deny", errorCode: "account_withdrawn" });
  });
});

describe("resolveProviderLogin Package D", () => {
  beforeEach(() => vi.clearAllMocks());

  it("D01/D14 subject wins over conflicting email", async () => {
    const sb = mockSb({
      identities: [
        {
          id: "id-1",
          user_id: "owner-u",
          provider: "google",
          provider_user_id: "gid-1",
          email: "other@gmail.com",
        },
      ],
      authUsers: [passwordAuthUser("pwd", "other@gmail.com")],
      profiles: [{ id: "pwd", status: "verified_user" }],
    });
    const result = await resolveProviderLogin(sb, {
      provider: "google",
      providerUserId: "gid-1",
      email: "other@gmail.com",
      emailVerified: true,
    });
    expect(result.status).toBe("existing");
    if (result.status === "existing") {
      expect(result.userId).toBe("owner-u");
      expect(result.via).toBe("user_auth_identities");
    }
  });

  it("D15 profiles_fallback unchanged", async () => {
    const sb = mockSb({
      profiles: [{ id: "fb-1", provider: "google", provider_user_id: "gid-fb" }],
    });
    const result = await resolveProviderLogin(sb, {
      provider: "google",
      providerUserId: "gid-fb",
      email: "x@gmail.com",
      emailVerified: true,
    });
    expect(result.status).toBe("existing");
    if (result.status === "existing") expect(result.via).toBe("profiles_fallback");
  });

  it("D02/D03 unverified or missing email → new", async () => {
    const sb = mockSb({
      authUsers: [passwordAuthUser("p1", "a@gmail.com")],
      profiles: [{ id: "p1", status: "verified_user" }],
    });
    const unverified = await resolveProviderLogin(sb, {
      provider: "google",
      providerUserId: "g-new",
      email: "a@gmail.com",
      emailVerified: false,
    });
    expect(unverified.status).toBe("new");

    const noEmail = await resolveProviderLogin(sb, {
      provider: "google",
      providerUserId: "g-new-2",
      email: null,
      emailVerified: true,
    });
    expect(noEmail.status).toBe("new");
  });

  it("D04 verified email + no password member → new", async () => {
    const sb = mockSb({ authUsers: [], profiles: [] });
    const result = await resolveProviderLogin(sb, {
      provider: "google",
      providerUserId: "g-new",
      email: "fresh@gmail.com",
      emailVerified: true,
    });
    expect(result.status).toBe("new");
  });

  it("D05 active password member → account_link_required", async () => {
    const sb = mockSb({
      authUsers: [passwordAuthUser("p1", "a@gmail.com")],
      profiles: [{ id: "p1", status: "verified_user" }],
    });
    const result = await resolveProviderLogin(sb, {
      provider: "google",
      providerUserId: "g-new",
      email: "a@gmail.com",
      emailVerified: true,
    });
    expect(result).toMatchObject({
      status: "account_link_required",
      reason: "verified_social_email_matches_password_member",
      provider: "google",
      candidateUserId: "p1",
    });
  });

  it("D06 sns_pending → account_link_required", async () => {
    const sb = mockSb({
      authUsers: [passwordAuthUser("p1", "a@gmail.com")],
      profiles: [{ id: "p1", status: "sns_pending" }],
    });
    const result = await resolveProviderLogin(sb, {
      provider: "google",
      providerUserId: "g-new",
      email: "a@gmail.com",
      emailVerified: true,
    });
    expect(result.status).toBe("account_link_required");
  });

  it("D07–D09 lifecycle deny is terminal (no new)", async () => {
    for (const [status, code] of [
      ["suspended", "account_suspended"],
      ["blocked", "account_blocked"],
      ["deleted", "account_withdrawn"],
    ] as const) {
      const sb = mockSb({
        authUsers: [passwordAuthUser("p1", "a@gmail.com")],
        profiles: [{ id: "p1", status }],
      });
      const result = await resolveProviderLogin(sb, {
        provider: "google",
        providerUserId: `g-${status}`,
        email: "a@gmail.com",
        emailVerified: true,
      });
      expect(result).toMatchObject({ status: "lifecycle_denied", errorCode: code });
      expect(result.status).not.toBe("new");
    }
  });

  it("D10 ambiguous Auth email → fail closed", async () => {
    const sb = mockSb({
      authUsers: [
        passwordAuthUser("p1", "dup@gmail.com"),
        passwordAuthUser("p2", "dup@gmail.com"),
      ],
      profiles: [
        { id: "p1", status: "verified_user" },
        { id: "p2", status: "verified_user" },
      ],
    });
    const result = await resolveProviderLogin(sb, {
      provider: "google",
      providerUserId: "g-new",
      email: "dup@gmail.com",
      emailVerified: true,
    });
    expect(result).toMatchObject({
      status: "provider_user_id_conflict",
      conflictReason: "AMBIGUOUS_ACCOUNT_CONFLICT",
    });
  });

  it("D11/D12 relay and synthetic excluded → new", async () => {
    const sb = mockSb({
      authUsers: [passwordAuthUser("p1", "relay@privaterelay.appleid.com")],
      profiles: [{ id: "p1", status: "verified_user" }],
    });
    const relay = await resolveProviderLogin(sb, {
      provider: "apple",
      providerUserId: "asub",
      email: "relay@privaterelay.appleid.com",
      emailVerified: true,
      emailIsPrivateRelay: true,
    });
    expect(relay.status).toBe("new");

    const synth = await resolveProviderLogin(sb, {
      provider: "google",
      providerUserId: "g-syn",
      email: "x@google.native.dibay.internal",
      emailVerified: true,
    });
    expect(synth.status).toBe("new");
  });

  it("D13 Kakao no-email unchanged → new", async () => {
    const sb = mockSb({
      authUsers: [passwordAuthUser("p1", "a@gmail.com")],
      profiles: [{ id: "p1", status: "verified_user" }],
    });
    const result = await resolveProviderLogin(sb, {
      provider: "kakao",
      providerUserId: "k-new",
      email: null,
    });
    expect(result.status).toBe("new");
  });
});

describe("verified email candidate builders", () => {
  it("D16/D17 Google Native respects emailVerified", () => {
    const ok = buildGoogleProviderCandidate({
      googleUserId: "g1",
      audience: "aud",
      email: "a@gmail.com",
      emailVerified: true,
      name: null,
      picture: null,
    });
    expect(ok.emailVerified).toBe(true);
    expect(ok.email).toBe("a@gmail.com");

    const skip = buildGoogleProviderCandidate({
      googleUserId: "g1",
      audience: "aud",
      email: "a@gmail.com",
      emailVerified: false,
      name: null,
      picture: null,
    });
    expect(skip.email).toBeNull();
    expect(skip.emailVerified).toBe(false);
  });

  it("D18/D19 Google Web uses identity_data.email_verified only", () => {
    const verified = buildOAuthUserProviderCandidate({
      id: "sess",
      email: "a@gmail.com",
      identities: [
        {
          id: "i1",
          identity_id: "i1",
          user_id: "sess",
          provider: "google",
          identity_data: { sub: "gs1", email: "a@gmail.com", email_verified: true },
          created_at: "",
          last_sign_in_at: "",
          updated_at: "",
        },
      ],
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "",
    } as unknown as User);
    expect(verified?.emailVerified).toBe(true);

    const presentOnly = buildOAuthUserProviderCandidate({
      id: "sess",
      email: "a@gmail.com",
      identities: [
        {
          id: "i1",
          identity_id: "i1",
          user_id: "sess",
          provider: "google",
          identity_data: { sub: "gs1", email: "a@gmail.com" },
          created_at: "",
          last_sign_in_at: "",
          updated_at: "",
        },
      ],
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "",
    } as unknown as User);
    expect(presentOnly?.email).toBe("a@gmail.com");
    expect(presentOnly?.emailVerified).toBe(false);
  });

  it("D20–D23 Apple relay / unverified + Kakao skip Package D", () => {
    const relay = buildAppleProviderCandidate({
      sub: "a1",
      email: "r@privaterelay.appleid.com",
      emailVerified: true,
      isPrivateRelayEmail: true,
      aud: "com.dibay",
    });
    expect(relay.email).toBeNull();
    expect(relay.emailIsPrivateRelay).toBe(true);

    const unverifiedApple = buildAppleProviderCandidate({
      sub: "a2",
      email: "real@icloud.com",
      emailVerified: false,
      isPrivateRelayEmail: false,
      aud: "com.dibay",
    });
    expect(unverifiedApple.email).toBe("real@icloud.com");
    expect(unverifiedApple.emailVerified).toBe(false);

    const kakao = buildKakaoProviderCandidate({
      kakaoUserId: "k1",
      email: "k@kakao.com",
      hasEmailFromProfile: true,
      nickname: null,
      profileImageUrl: null,
    });
    expect(kakao.email).toBe("k@kakao.com");
    expect(kakao.emailVerified).toBe(false);

    const kakaoNoEmail = buildKakaoProviderCandidate({
      kakaoUserId: "k2",
      email: null,
      hasEmailFromProfile: false,
      nickname: null,
      profileImageUrl: null,
    });
    expect(kakaoNoEmail.email).toBeNull();
  });
});

describe("Package D no-write prelude", () => {
  it("D24–D31 account_link_required stops before writes and maps generic error", async () => {
    const sb = mockSb({
      authUsers: [passwordAuthUser("p1", "a@gmail.com")],
      profiles: [{ id: "p1", status: "verified_user" }],
    });

    const prelude = await resolveNativeProviderSessionPrelude(sb, {
      provider: "google",
      providerUserId: "g-new",
      email: "a@gmail.com",
      emailVerified: true,
    });
    expect(prelude.ok).toBe(false);
    if (prelude.ok) return;
    expect(prelude.errorCode).toBe(PROVIDER_ACCOUNT_LINK_REQUIRED);
    expect(prelude.conflict).toBeUndefined();
    // Prelude fails before existingUserId / identity write path — no Product session.
    expect("existingUserId" in prelude).toBe(false);

    const msg = mapAuthErrorMessage(
      PROVIDER_ACCOUNT_LINK_REQUIRED,
      undefined,
      (key: string) => {
        if (key === "auth_err_provider_account_link_required") {
          return "이 로그인 방법은 기존 계정 연결 확인이 필요합니다. 다른 로그인 방법을 사용하거나 고객지원에 문의해 주세요.";
        }
        return key;
      },
    );
    expect(msg).toContain("기존 계정 연결 확인");
    expect(msg).not.toContain("a@gmail.com");
    expect(msg).not.toContain("p1");
  });
});
