import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildGoogleSupabasePassword,
  establishGoogleNativeSession,
} from "@/lib/auth/native/google-native-session.server";

const findAuthUserByEmail = vi.fn();
const ensureAuthProfileForLogin = vi.fn();
const ensureProfileForUserId = vi.fn();
const getOnboardingStatus = vi.fn();
const syncActiveSessionForUser = vi.fn();

vi.mock("@/lib/auth/naver-oauth", () => ({
  findAuthUserByEmail: (...args: unknown[]) => findAuthUserByEmail(...args),
}));

vi.mock("@/lib/auth/completion/ensure-auth-profile-for-login.server", () => ({
  ensureAuthProfileForLogin: (...args: unknown[]) => ensureAuthProfileForLogin(...args),
}));

vi.mock("@/lib/auth/get-onboarding-status", () => ({
  getOnboardingStatus: (...args: unknown[]) => getOnboardingStatus(...args),
}));

vi.mock("@/lib/auth/server-guards", () => ({
  syncActiveSessionForUser: (...args: unknown[]) => syncActiveSessionForUser(...args),
}));

vi.mock("@/lib/profile/ensure-profile-for-user-id", () => ({
  ensureProfileForUserId: (...args: unknown[]) => ensureProfileForUserId(...args),
}));

type ProfileLookupRow = { id: string; status?: string; deleted_at?: string | null };

type IdentityRow = {
  id: string;
  user_id: string;
  provider: string;
  provider_user_id: string;
  email?: string | null;
  email_is_private_relay?: boolean;
};

function identityMaybeSingleChain(row: IdentityRow | null) {
  return {
    maybeSingle: async () => ({ data: row, error: null }),
  };
}

function identityFromMock(rows: IdentityRow[] = []) {
  function filterByEmail(email: unknown, excludeProvider?: unknown) {
    return rows.filter((row) => {
      if (String(row.email ?? "").toLowerCase() !== String(email).toLowerCase()) return false;
      if (row.email_is_private_relay === true) return false;
      if (excludeProvider && row.provider === excludeProvider) return false;
      return true;
    });
  }

  return {
    select: () => ({
      eq: (col: string, val: unknown) => {
        if (col === "email") {
          const filtered = filterByEmail(val);
          const result = { data: filtered, error: null };
          return {
            eq: (_col2: string, _val2: unknown) => ({
              neq: (_col3: string, provider: unknown) => ({
                then(onFulfilled: (v: typeof result) => void) {
                  onFulfilled({ data: filterByEmail(val, provider), error: null });
                },
              }),
              then(onFulfilled: (v: typeof result) => void) {
                onFulfilled(result);
              },
            }),
          };
        }

        const chain = {
          eq: (col2: string, val2: unknown) => {
            const match =
              rows.find(
                (row) =>
                  (col !== "provider" || row.provider === val)
                  && (col2 !== "provider_user_id" || row.provider_user_id === val2)
                  && (col !== "user_id" || row.user_id === val)
                  && (col2 !== "provider" || row.provider === val2),
              ) ?? null;
            return identityMaybeSingleChain(match);
          },
          order: async () => ({ data: rows, error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
        };
        Object.defineProperty(chain, "then", {
          value(onFulfilled: (v: unknown) => void) {
            const filtered = rows.filter((row) => {
              if (col === "user_id" && row.user_id !== val) return false;
              return true;
            });
            onFulfilled({ data: filtered, error: null });
          },
        });
        return chain;
      },
      order: async () => ({ data: rows, error: null }),
    }),
    insert: () => ({
      select: () => ({
        single: async () => ({
          data: rows[0] ?? {
            id: "identity-new",
            user_id: "new-user-id",
            provider: "google",
            provider_user_id: "gid",
          },
          error: null,
        }),
      }),
    }),
    delete: () => ({
      eq: () => ({
        eq: async () => ({ error: null, count: 1 }),
      }),
    }),
  };
}

function profileMaybeSingleChain(row: ProfileLookupRow | null) {
  return {
    maybeSingle: async () => ({ data: row, error: null }),
    limit: async () => ({ data: row ? [row] : [], error: null }),
  };
}

function profilesEqChain(row: ProfileLookupRow | null) {
  return {
    eq: () => profileMaybeSingleChain(row),
    maybeSingle: async () => ({ data: row, error: null }),
    limit: async () => ({ data: row ? [row] : [], error: null }),
    in: async () => ({ data: row ? [row] : [], error: null }),
    or: () => ({
      limit: async () => ({ data: row ? [{ id: row.id }] : [], error: null }),
    }),
    ilike: () => ({
      limit: async () => ({ data: row ? [{ id: row.id }] : [], error: null }),
    }),
  };
}

function buildAdminSb(options: {
  profileId?: string | null;
  createUserError?: string | null;
  recoveredAuthUserId?: string | null;
  identities?: IdentityRow[];
}) {
  const updateUserById = vi.fn(async () => ({ error: null }));
  const getUserById = vi.fn(async (id: string) => ({
    data: { user: { id, email: `google.107373086399795697553@google.native.dibay.internal` } },
    error: null,
  }));
  const createUser = vi.fn(async () => ({
    data: options.createUserError ? null : { user: { id: "new-user-id" } },
    error: options.createUserError ? { message: options.createUserError } : null,
  }));
  const from = vi.fn((table: string) => {
    if (table === "user_auth_identities") {
      return identityFromMock(options.identities ?? []);
    }
    if (table !== "profiles") {
      return {
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    }
    return {
      select: () => ({
        eq: (col: string, val: unknown) => {
          if (col === "id") {
            return profilesEqChain(null);
          }
          if (col === "provider" && val === "google") {
            const row = options.profileId
              ? { id: options.profileId, status: "sns_pending", deleted_at: null }
              : null;
            return profilesEqChain(row);
          }
          return profilesEqChain(null);
        },
        ilike: () => ({
          limit: async () => ({ data: [], error: null }),
        }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    };
  });

  findAuthUserByEmail.mockImplementation(async () =>
    options.recoveredAuthUserId ? { id: options.recoveredAuthUserId, email: "google.107373086399795697553@google.native.dibay.internal" } : null,
  );

  return {
    auth: {
      admin: {
        createUser,
        updateUserById,
        getUserById,
        deleteUser: vi.fn(async () => ({ error: null })),
        listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
      },
    },
    from,
    __mocks: { createUser, updateUserById, getUserById },
  } as unknown as SupabaseClient & {
    __mocks: {
      createUser: ReturnType<typeof vi.fn>;
      updateUserById: ReturnType<typeof vi.fn>;
      getUserById: ReturnType<typeof vi.fn>;
    };
  };
}

describe("google-native-session.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_GOOGLE_NATIVE_EXCHANGE_ENABLED = "true";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    ensureAuthProfileForLogin.mockResolvedValue({
      enriched: true,
      ensureUserProfileOutcome: {
        profile: { id: "08224de9-953e-4219-8ead-f30d7201dafb" },
        linked: true,
        created: false,
      },
    });
    ensureProfileForUserId.mockResolvedValue({ id: "08224de9-953e-4219-8ead-f30d7201dafb" });
    getOnboardingStatus.mockResolvedValue({
      signupComplete: false,
      consentComplete: false,
      dibayIdComplete: false,
      profileComplete: false,
    });
    syncActiveSessionForUser.mockResolvedValue(undefined);
  });

  it("reuses orphan synthetic auth user when createUser reports duplicate email", async () => {
    const googleUserId = "107373086399795697553";
    const orphanId = "08224de9-953e-4219-8ead-f30d7201dafb";
    const adminSb = buildAdminSb({
      profileId: null,
      createUserError: "A user with this email address has already been registered",
      recoveredAuthUserId: orphanId,
    });
    const signInWithPassword = vi.fn(async () => ({
      data: { user: { id: orphanId, email: `google.${googleUserId}@google.native.dibay.internal` } },
      error: null,
    }));
    const routeSb = { auth: { signInWithPassword } } as unknown as SupabaseClient;

    const result = await establishGoogleNativeSession(
      {
        adminSb,
        routeSb,
        request: new Request("https://samarket.vercel.app/api/auth/native/exchange") as never,
        response: {} as never,
      },
      {
        verified: {
          googleUserId,
          audience: "229866850463-test.apps.googleusercontent.com",
          email: "bkim4pact@gmail.com",
          emailVerified: true,
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(adminSb.__mocks.createUser).toHaveBeenCalledTimes(1);
    expect(adminSb.__mocks.updateUserById).toHaveBeenCalledWith(
      orphanId,
      expect.objectContaining({
        email: `google.${googleUserId}@google.native.dibay.internal`,
        password: buildGoogleSupabasePassword(googleUserId),
      }),
    );
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
    expect(ensureProfileForUserId).toHaveBeenCalledWith(adminSb, orphanId);
  });

  it("returns email_conflict when verified Gmail matches another provider identity", async () => {
    const googleUserId = "107373086399795697553";
    const webProfileId = "1a3179f4-9e9b-4b11-98b2-e124932c58bd";
    const verifiedEmail = "bkim4pact@gmail.com";
    const adminSb = buildAdminSb({
      profileId: null,
      identities: [
        {
          id: "id-email",
          user_id: webProfileId,
          provider: "kakao",
          provider_user_id: "kakao-existing",
          email: verifiedEmail,
          email_is_private_relay: false,
        },
      ],
    });

    const result = await establishGoogleNativeSession(
      {
        adminSb,
        routeSb: { auth: { signInWithPassword: vi.fn() } } as unknown as SupabaseClient,
        request: new Request("https://samarket.vercel.app/api/auth/native/exchange") as never,
        response: {} as never,
      },
      {
        verified: {
          googleUserId,
          audience: "229866850463-test.apps.googleusercontent.com",
          email: verifiedEmail,
          emailVerified: true,
        },
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("provider_email_conflict");
      expect(result.conflict?.existingUserId).toBe(webProfileId);
    }
  });

  it("fails exchange when the same Gmail maps to multiple linked identities", async () => {
    const googleUserId = "107373086399795697553";
    const adminSb = buildAdminSb({
      profileId: null,
      identities: [
        {
          id: "id-a",
          user_id: "dup-a",
          provider: "kakao",
          provider_user_id: "kakao-1",
          email: "imobong88@gmail.com",
          email_is_private_relay: false,
        },
        {
          id: "id-b",
          user_id: "dup-b",
          provider: "naver",
          provider_user_id: "naver-1",
          email: "imobong88@gmail.com",
          email_is_private_relay: false,
        },
      ],
    });

    findAuthUserByEmail.mockResolvedValue(null);

    const result = await establishGoogleNativeSession(
      {
        adminSb,
        routeSb: { auth: { signInWithPassword: vi.fn() } } as unknown as SupabaseClient,
        request: new Request("https://samarket.vercel.app/api/auth/native/exchange") as never,
        response: {} as never,
      },
      {
        verified: {
          googleUserId,
          audience: "229866850463-test.apps.googleusercontent.com",
          email: "imobong88@gmail.com",
          emailVerified: true,
        },
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("provider_account_conflict");
    }
  });

  it("fails exchange when profiles row cannot be ensured", async () => {
    const googleUserId = "107373086399795697553";
    const adminSb = buildAdminSb({ profileId: null });
    const signInWithPassword = vi.fn(async () => ({
      data: { user: { id: "new-user-id", email: `google.${googleUserId}@google.native.dibay.internal` } },
      error: null,
    }));
    const routeSb = { auth: { signInWithPassword } } as unknown as SupabaseClient;
    ensureProfileForUserId.mockResolvedValue(null);

    const result = await establishGoogleNativeSession(
      {
        adminSb,
        routeSb,
        request: new Request("https://samarket.vercel.app/api/auth/native/exchange") as never,
        response: {} as never,
      },
      {
        verified: {
          googleUserId,
          audience: "229866850463-test.apps.googleusercontent.com",
          email: null,
          emailVerified: false,
        },
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("profile_ensure_failed");
    }
  });
});
