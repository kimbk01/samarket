import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildGoogleSupabasePassword,
  establishGoogleNativeSession,
} from "@/lib/auth/native/google-native-session.server";

const findAuthUserByEmail = vi.fn();
const ensureUserProfile = vi.fn();
const ensurePendingAuthProfileRow = vi.fn();
const ensureProfileForUserId = vi.fn();
const getOnboardingStatus = vi.fn();
const syncActiveSessionForUser = vi.fn();

vi.mock("@/lib/auth/naver-oauth", () => ({
  findAuthUserByEmail: (...args: unknown[]) => findAuthUserByEmail(...args),
}));

vi.mock("@/lib/auth/ensure-user-profile", () => ({
  ensureUserProfile: (...args: unknown[]) => ensureUserProfile(...args),
}));

vi.mock("@/lib/auth/member-access", () => ({
  ensurePendingAuthProfileRow: (...args: unknown[]) => ensurePendingAuthProfileRow(...args),
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
    ensurePendingAuthProfileRow.mockResolvedValue(undefined);
    ensureUserProfile.mockResolvedValue({ profile: { id: "08224de9-953e-4219-8ead-f30d7201dafb" }, linked: true });
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
    expect(adminSb.__mocks.createUser).not.toHaveBeenCalled();
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

  it("prefers existing web Google profile by verified email over synthetic orphan auth user", async () => {
    const googleUserId = "107373086399795697553";
    const webProfileId = "1a3179f4-9e9b-4b11-98b2-e124932c58bd";
    const orphanId = "08224de9-953e-4219-8ead-f30d7201dafb";
    const verifiedEmail = "bkim4pact@gmail.com";

    const from = vi.fn((table: string) => {
      if (table !== "profiles") {
        return { update: () => ({ eq: async () => ({ error: null }) }) };
      }
      return {
        select: () => ({
          eq: (col: string, val: unknown) => {
            if (col === "id") {
              return {
                maybeSingle: async () => ({
                  data: val === webProfileId
                    ? {
                        id: webProfileId,
                        status: "sns_pending",
                        email: verifiedEmail,
                        auth_login_email: verifiedEmail,
                        provider: "email",
                        auth_provider: "email",
                      }
                    : null,
                  error: null,
                }),
                in: async () => ({
                  data: [{ id: webProfileId, provider: "email", auth_provider: "email" }],
                  error: null,
                }),
              };
            }
            if (col === "provider" && val === "google") {
              return {
                ...profilesEqChain(null),
                or: () => ({
                  limit: async () => ({ data: [{ id: webProfileId }], error: null }),
                }),
              };
            }
            return profilesEqChain(null);
          },
          ilike: () => ({
            limit: async () => ({
              data: [{ id: webProfileId, status: "sns_pending", deleted_at: null }],
              error: null,
            }),
          }),
          in: (col: string, ids: string[]) => ({
            limit: async () => ({
              data: ids.map((id) => ({
                id,
                provider: id === webProfileId ? "email" : "google",
                auth_provider: id === webProfileId ? "email" : "google",
              })),
              error: null,
            }),
          }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    });

    findAuthUserByEmail.mockResolvedValue({ id: orphanId, email: `google.${googleUserId}@google.native.dibay.internal` });

    const adminSb = {
      auth: {
        admin: {
          createUser: vi.fn(),
          updateUserById: vi.fn(async () => ({ error: null })),
          getUserById: vi.fn(async (id: string) => ({
            data: { user: { id, email: verifiedEmail } },
            error: null,
          })),
          listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
          deleteUser: vi.fn(async () => ({ error: null })),
        },
      },
      from,
    } as unknown as SupabaseClient;

    const signInWithPassword = vi.fn(async () => ({
      data: { user: { id: webProfileId, email: verifiedEmail } },
      error: null,
    }));
    const routeSb = { auth: { signInWithPassword } } as unknown as SupabaseClient;

    ensureProfileForUserId.mockResolvedValue({ id: webProfileId });

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
          email: verifiedEmail,
          emailVerified: true,
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(ensureProfileForUserId).toHaveBeenCalledWith(adminSb, webProfileId);
    expect(adminSb.auth.admin.updateUserById).toHaveBeenCalledWith(
      webProfileId,
      expect.objectContaining({
        password: buildGoogleSupabasePassword(googleUserId),
      }),
    );
    expect(adminSb.auth.admin.updateUserById).toHaveBeenCalledWith(
      webProfileId,
      expect.not.objectContaining({
        email: `google.${googleUserId}@google.native.dibay.internal`,
      }),
    );
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: verifiedEmail,
      password: buildGoogleSupabasePassword(googleUserId),
    });
  });

  it("fails exchange when the same Gmail maps to ambiguous profiles", async () => {
    const googleUserId = "107373086399795697553";
    const from = vi.fn((table: string) => {
      if (table !== "profiles") {
        return { update: () => ({ eq: async () => ({ error: null }) }) };
      }
      return {
        select: () => ({
          eq: (col: string, val: unknown) => {
            if (col === "provider" && val === "google") {
              return {
                eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
                or: () => ({ limit: async () => ({ data: [], error: null }) }),
              };
            }
            return {
              maybeSingle: async () => ({ data: null, error: null }),
              limit: async () => ({ data: [], error: null }),
              in: async (_c: string, ids: string[]) => ({
                data: ids.map((id) => ({
                  id,
                  provider: id === "dup-a" ? "email" : "naver",
                  auth_provider: id === "dup-a" ? "email" : "naver",
                })),
                error: null,
              }),
            };
          },
          ilike: () => ({
            limit: async () => ({
              data: [
                { id: "dup-a", status: "sns_pending", deleted_at: null },
                { id: "dup-b", status: "sns_pending", deleted_at: null },
              ],
              error: null,
            }),
          }),
          in: (col: string, ids: string[]) => ({
            limit: async () => ({
              data: ids.map((id) => ({
                id,
                provider: id === "dup-a" ? "email" : "naver",
                auth_provider: id === "dup-a" ? "email" : "naver",
              })),
              error: null,
            }),
          }),
        }),
      };
    });

    const adminSb = {
      auth: {
        admin: {
          createUser: vi.fn(),
          updateUserById: vi.fn(),
          getUserById: vi.fn(),
          listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
        },
      },
      from,
    } as unknown as SupabaseClient;

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
