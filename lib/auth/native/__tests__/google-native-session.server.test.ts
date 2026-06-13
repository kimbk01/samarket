import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildGoogleSupabasePassword,
  establishGoogleNativeSession,
} from "@/lib/auth/native/google-native-session.server";

const findAuthUserByEmail = vi.fn();
const ensureUserProfile = vi.fn();
const ensurePendingAuthProfileRow = vi.fn();
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
        eq: () => ({
          eq: () => ({
            limit: async () => ({
              data: options.profileId ? [{ id: options.profileId }] : [],
              error: null,
            }),
          }),
          or: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
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
            if (col === "provider" && val === "google") {
              return {
                eq: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
                or: () => ({
                  limit: async () => ({ data: [{ id: webProfileId }], error: null }),
                }),
              };
            }
            return {
              eq: () => ({ limit: async () => ({ data: [], error: null }) }),
              or: async () => ({ data: [], error: null }),
            };
          },
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
        },
      },
      from,
    } as unknown as SupabaseClient;

    const signInWithPassword = vi.fn(async () => ({
      data: { user: { id: webProfileId, email: verifiedEmail } },
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
          email: verifiedEmail,
          emailVerified: true,
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(adminSb.auth.admin.updateUserById).toHaveBeenCalledWith(
      webProfileId,
      expect.objectContaining({
        password: buildGoogleSupabasePassword(googleUserId),
      }),
    );
    expect(adminSb.auth.admin.updateUserById).not.toHaveBeenCalledWith(
      orphanId,
      expect.anything(),
    );
  });
});
