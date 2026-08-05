/**
 * Slice 7-1 — Google Profile Writer Call Graph Contract.
 * PRODUCT CODE CHANGE = 0. Locks current writer order + PLAN_G2 preconditions.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { establishGoogleNativeSession } from "@/lib/auth/native/google-native-session.server";

const findAuthUserByEmail = vi.fn();
const ensureAuthProfileForLoginMock = vi.fn();
const ensureProfileForUserId = vi.fn();
const getOnboardingStatus = vi.fn();
const syncActiveSessionForUser = vi.fn();
const reconcileMock = vi.fn();
const ensureProviderAuthIdentityRow = vi.fn();
const ensurePendingAuthProfileRow = vi.fn();
const ensureUserProfile = vi.fn();

const reconcileActual = vi.hoisted(() => ({
  fn: null as null | ((...args: unknown[]) => Promise<void>),
}));

vi.mock("@/lib/auth/naver-oauth", () => ({
  findAuthUserByEmail: (...args: unknown[]) => findAuthUserByEmail(...args),
}));

vi.mock("@/lib/auth/completion/ensure-auth-profile-for-login.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/completion/ensure-auth-profile-for-login.server")>();
  return {
    ...actual,
    ensureAuthProfileForLogin: (...args: unknown[]) => ensureAuthProfileForLoginMock(...args),
  };
});

vi.mock("@/lib/auth/get-onboarding-status", () => ({
  getOnboardingStatus: (...args: unknown[]) => getOnboardingStatus(...args),
}));

vi.mock("@/lib/auth/server-guards", () => ({
  syncActiveSessionForUser: (...args: unknown[]) => syncActiveSessionForUser(...args),
}));

vi.mock("@/lib/profile/ensure-profile-for-user-id", () => ({
  ensureProfileForUserId: (...args: unknown[]) => ensureProfileForUserId(...args),
}));

vi.mock("@/lib/auth/native/reconcile-google-native-orphan.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/native/reconcile-google-native-orphan.server")>();
  reconcileActual.fn = actual.reconcileGoogleNativeProviderProfileConflict as typeof reconcileActual.fn;
  return {
    ...actual,
    reconcileGoogleNativeProviderProfileConflict: (...args: unknown[]) => reconcileMock(...args),
  };
});

vi.mock("@/lib/auth/provider-identity/native-session-bridge.server", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/auth/provider-identity/native-session-bridge.server")
  >();
  return {
    ...actual,
    ensureProviderAuthIdentityRow: (...args: unknown[]) => ensureProviderAuthIdentityRow(...args),
  };
});

vi.mock("@/lib/auth/member-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/member-access")>();
  return {
    ...actual,
    ensurePendingAuthProfileRow: (...args: unknown[]) => ensurePendingAuthProfileRow(...args),
  };
});

vi.mock("@/lib/auth/ensure-user-profile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/ensure-user-profile")>();
  return {
    ...actual,
    ensureUserProfile: (...args: unknown[]) => ensureUserProfile(...args),
  };
});

type TimelineStep =
  | "reconcileGoogleNativeProviderProfileConflict"
  | "ensureAuthProfileForLogin:true"
  | "ensureProviderAuthIdentityRow"
  | "ensureProfileForUserId";

const GOOGLE_SESSION_SRC = "lib/auth/native/google-native-session.server.ts";
const RECONCILE_SRC = "lib/auth/native/reconcile-google-native-orphan.server.ts";
const FACADE_SRC = "lib/auth/completion/ensure-auth-profile-for-login.server.ts";
const RECOVER_CLIENT_SRC = "lib/auth/native/start-native-google-login.client.ts";

function readSrc(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function indexOfRequired(src: string, needle: string, label: string): number {
  const idx = src.indexOf(needle);
  expect(idx, `${label} missing: ${needle}`).toBeGreaterThanOrEqual(0);
  return idx;
}

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
  return { maybeSingle: async () => ({ data: row, error: null }) };
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
  trackProfileUpdates?: Array<Record<string, unknown>>;
}) {
  const updateUserById = vi.fn(async () => ({ error: null }));
  const getUserById = vi.fn(async (id: string) => ({
    data: { user: { id, email: "google.107373086399795697553@google.native.dibay.internal" } },
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
      return { update: () => ({ eq: async () => ({ error: null }) }) };
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
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          options.trackProfileUpdates?.push(patch);
          return { error: null };
        },
      }),
    };
  });

  findAuthUserByEmail.mockImplementation(async () =>
    options.recoveredAuthUserId
      ? {
          id: options.recoveredAuthUserId,
          email: "google.107373086399795697553@google.native.dibay.internal",
        }
      : null,
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
  } as unknown as SupabaseClient;
}

function verifiedIdentity() {
  return {
    googleUserId: "107373086399795697553",
    audience: "229866850463-test.apps.googleusercontent.com",
    email: "bkim4pact@gmail.com",
    emailVerified: true,
  };
}

async function runEstablish(options: {
  userId?: string;
  profileId?: string | null;
  identities?: IdentityRow[];
  trackProfileUpdates?: Array<Record<string, unknown>>;
}) {
  const userId = options.userId ?? "new-user-id";
  const adminSb = buildAdminSb({
    profileId: options.profileId ?? null,
    identities: options.identities,
    trackProfileUpdates: options.trackProfileUpdates,
  });
  const signInWithPassword = vi.fn(async () => ({
    data: {
      user: {
        id: userId,
        email: "google.107373086399795697553@google.native.dibay.internal",
      },
    },
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
    { verified: verifiedIdentity() },
  );
  return { result, userId };
}

describe("Slice 7-1 Google Profile Writer Call Graph Contract", () => {
  const timeline: TimelineStep[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    timeline.length = 0;
    process.env.AUTH_GOOGLE_NATIVE_EXCHANGE_ENABLED = "true";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

    ensureAuthProfileForLoginMock.mockImplementation(async (_sb, _user, opts?: { enrichMemberProfile?: boolean }) => {
      expect(opts?.enrichMemberProfile).toBe(true);
      timeline.push("ensureAuthProfileForLogin:true");
      return {
        enriched: true,
        ensureUserProfileOutcome: {
          profile: { id: "new-user-id" },
          linked: true,
          created: false,
        },
      };
    });

    reconcileMock.mockImplementation(async () => {
      timeline.push("reconcileGoogleNativeProviderProfileConflict");
    });

    ensureProviderAuthIdentityRow.mockImplementation(async () => {
      timeline.push("ensureProviderAuthIdentityRow");
    });

    ensureProfileForUserId.mockImplementation(async (_sb, userId: string) => {
      timeline.push("ensureProfileForUserId");
      return { id: userId };
    });

    getOnboardingStatus.mockResolvedValue({
      signupComplete: true,
      consentComplete: true,
      dibayIdComplete: true,
      profileComplete: true,
    });
    syncActiveSessionForUser.mockResolvedValue(undefined);
    ensurePendingAuthProfileRow.mockResolvedValue(undefined);
    ensureUserProfile.mockResolvedValue({
      profile: { id: "u1" },
      linked: true,
      created: false,
    });
  });

  describe("static source order (Slice 7-2 PLAN_G2)", () => {
    it("locks reconcile → enrich(true)×1 → identity → hard gate (no enrich=false)", () => {
      const src = readSrc(GOOGLE_SESSION_SRC);
      expect(src).not.toMatch(/enrichMemberProfile:\s*false/);
      const ensureCalls = src.match(/await ensureAuthProfileForLogin\(/g) ?? [];
      expect(ensureCalls.length).toBe(1);

      const iReconcile = indexOfRequired(
        src,
        "await reconcileGoogleNativeProviderProfileConflict(",
        "reconcile",
      );
      const iTrue = indexOfRequired(
        src,
        "ensureAuthProfileForLogin(ctx.adminSb, syntheticUser, {\n      enrichMemberProfile: true",
        "facade true",
      );
      const iPersist = indexOfRequired(src, "await persistGoogleProfileIdentity(", "persist identity");
      const iIdentityRow = indexOfRequired(src, "await ensureProviderAuthIdentityRow(", "identity row");
      const iHard = indexOfRequired(src, "await ensureProfileForUserId(", "hard gate");

      expect(iReconcile).toBeLessThan(iTrue);
      expect(iTrue).toBeLessThan(iPersist);
      expect(iPersist).toBeLessThan(iIdentityRow);
      expect(iIdentityRow).toBeLessThan(iHard);
    });

    it("duplicateWarning 409 returns before identity/hard gate", () => {
      const src = readSrc(GOOGLE_SESSION_SRC);
      const iDup = indexOfRequired(src, "profileOutcome?.duplicateWarning", "duplicateWarning");
      const i409 = src.indexOf('errorCode: "provider_account_conflict"', iDup);
      const iPersist = src.indexOf("await persistGoogleProfileIdentity(", iDup);
      const iHard = src.indexOf("await ensureProfileForUserId(", iDup);
      expect(i409).toBeGreaterThan(iDup);
      expect(i409).toBeLessThan(iPersist);
      expect(iPersist).toBeLessThan(iHard);
    });

    it("Hard Gate null → profile_ensure_failed 500 before destination", () => {
      const src = readSrc(GOOGLE_SESSION_SRC);
      const iHard = indexOfRequired(src, "await ensureProfileForUserId(", "hard gate");
      const iFail = src.indexOf('errorCode: "profile_ensure_failed"', iHard);
      const iDest = src.indexOf("resolveCommonAuthDestination(", iHard);
      expect(iFail).toBeGreaterThan(iHard);
      expect(iFail).toBeLessThan(iDest);
      expect(src.slice(iHard, iFail + 200)).toMatch(/status:\s*500/);
    });

    it("Recover client uses same exchange → establishGoogleNativeSession path", () => {
      const recover = readSrc(RECOVER_CLIENT_SRC);
      expect(recover).toMatch(/completeNativeGoogleSession/);
      expect(recover).toMatch(/recovered:\s*true/);
      expect(recover).toMatch(/postNativeProviderExchange/);
      const adapter = readSrc("lib/auth/native/native-provider-adapter.server.ts");
      expect(adapter).toMatch(/establishGoogleNativeSession/);
      expect(recover).not.toMatch(/ensureAuthProfileForLogin/);
      expect(recover).not.toMatch(/ensureProfileForUserId/);
    });

    it("Slice 6 Completion owners untouched in Google session", () => {
      const src = readSrc(GOOGLE_SESSION_SRC);
      expect(src).not.toMatch(/syncCommonClientSessionAfterAuth/);
      expect(src).not.toMatch(/finishClientAuthLogin/);
      expect(src).not.toMatch(/runCommonAuthClientCompletion/);
      expect(src).toMatch(/resolveCommonAuthDestination/);
    });
  });

  describe("runtime call timeline (mocked writers)", () => {
    it("success: reconcile → true×1 → identity row → hard gate (+ persist identity update)", async () => {
      const updates: Array<Record<string, unknown>> = [];
      const { result, userId } = await runEstablish({ trackProfileUpdates: updates });
      expect(result.ok).toBe(true);
      expect(timeline).toEqual([
        "reconcileGoogleNativeProviderProfileConflict",
        "ensureAuthProfileForLogin:true",
        "ensureProviderAuthIdentityRow",
        "ensureProfileForUserId",
      ]);
      expect(ensureAuthProfileForLoginMock).toHaveBeenCalledTimes(1);
      expect(ensureAuthProfileForLoginMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ enrichMemberProfile: true }),
      );
      expect(reconcileMock).toHaveBeenCalledTimes(1);
      expect(ensureProviderAuthIdentityRow).toHaveBeenCalledTimes(1);
      expect(ensureProfileForUserId).toHaveBeenCalledTimes(1);
      expect(ensureProfileForUserId).toHaveBeenCalledWith(expect.anything(), userId);
      expect(updates.some((u) => u.provider_user_id === "107373086399795697553")).toBe(true);
    });

    it("existing account: same writer order; hard gate called once (noop-capable)", async () => {
      const existingId = "new-user-id";
      ensureAuthProfileForLoginMock.mockImplementation(async (_sb, _user, opts?: { enrichMemberProfile?: boolean }) => {
        expect(opts?.enrichMemberProfile).toBe(true);
        timeline.push("ensureAuthProfileForLogin:true");
        return {
          enriched: true,
          ensureUserProfileOutcome: { profile: { id: existingId }, linked: true, created: false },
        };
      });
      ensureProfileForUserId.mockImplementation(async () => {
        timeline.push("ensureProfileForUserId");
        return { id: existingId };
      });

      const { result } = await runEstablish({ userId: existingId });
      expect(result.ok).toBe(true);
      expect(timeline[0]).toBe("reconcileGoogleNativeProviderProfileConflict");
      expect(timeline[1]).toBe("ensureAuthProfileForLogin:true");
      expect(timeline.at(-1)).toBe("ensureProfileForUserId");
      expect(ensureAuthProfileForLoginMock).toHaveBeenCalledTimes(1);
      expect(ensureProfileForUserId).toHaveBeenCalledTimes(1);
    });

    it("new account: create path single facade then hard gate existence", async () => {
      const { result } = await runEstablish({ profileId: null });
      expect(result.ok).toBe(true);
      expect(ensureAuthProfileForLoginMock).toHaveBeenCalledTimes(1);
      expect(ensureProfileForUserId).toHaveBeenCalledTimes(1);
    });

    it("orphan reclaim: reconcile runs before enrich=true (no false-409 order)", async () => {
      const { result } = await runEstablish({ profileId: null });
      expect(result.ok).toBe(true);
      const iReconcile = timeline.indexOf("reconcileGoogleNativeProviderProfileConflict");
      const iTrue = timeline.indexOf("ensureAuthProfileForLogin:true");
      expect(iReconcile).toBeGreaterThanOrEqual(0);
      expect(iTrue).toBeGreaterThan(iReconcile);
    });

    it("duplicateWarning → 409; identity/hard gate/navigation skipped", async () => {
      ensureAuthProfileForLoginMock.mockImplementation(async (_sb, _user, opts?: { enrichMemberProfile?: boolean }) => {
        expect(opts?.enrichMemberProfile).toBe(true);
        timeline.push("ensureAuthProfileForLogin:true");
        return {
          enriched: true,
          ensureUserProfileOutcome: {
            profile: { id: "new-user-id" },
            linked: false,
            created: false,
            duplicateWarning: true,
            duplicateCandidates: ["other-profile-id"],
          },
        };
      });

      const { result } = await runEstablish({});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe("provider_account_conflict");
        expect(result.status).toBe(409);
      }
      expect(timeline).toEqual([
        "reconcileGoogleNativeProviderProfileConflict",
        "ensureAuthProfileForLogin:true",
      ]);
      expect(ensureProviderAuthIdentityRow).not.toHaveBeenCalled();
      expect(ensureProfileForUserId).not.toHaveBeenCalled();
    });

    it("Hard Gate null → 500 profile_ensure_failed after soft writers", async () => {
      ensureProfileForUserId.mockImplementation(async () => {
        timeline.push("ensureProfileForUserId");
        return null;
      });
      const { result } = await runEstablish({});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe("profile_ensure_failed");
        expect(result.status).toBe(500);
      }
      expect(timeline).toEqual([
        "reconcileGoogleNativeProviderProfileConflict",
        "ensureAuthProfileForLogin:true",
        "ensureProviderAuthIdentityRow",
        "ensureProfileForUserId",
      ]);
    });
  });

  describe("PLAN_G2 preconditions", () => {
    it("P1–P4: reconcile does not require local pending profile / first false facade", async () => {
      const reconcileSrc = readSrc(RECONCILE_SRC);
      expect(reconcileSrc).toMatch(/export async function reconcileGoogleNativeProviderProfileConflict\(/);
      expect(reconcileSrc).not.toMatch(/ensureAuthProfileForLogin/);
      expect(reconcileSrc).not.toMatch(/ensurePendingAuthProfileRow/);
      expect(reconcileSrc).not.toMatch(/enrichMemberProfile/);

      const orphanProfileId = "08224de9-953e-4219-8ead-f30d7201dafb";
      const canonicalUserId = "1a3179f4-9e9b-4b11-98b2-e124932c58bd";
      const googleUserId = "107373086399795697553";
      const updateEq = vi.fn(async () => ({ error: null }));
      const deleteUser = vi.fn(async () => ({ error: null }));
      const from = vi.fn((table: string) => {
        if (table !== "profiles") return {};
        return {
          select: () => ({
            eq: (col: string, val: unknown) => {
              if (col === "provider" && val === "google") {
                return {
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: { id: orphanProfileId, status: "sns_pending", deleted_at: null },
                      error: null,
                    }),
                  }),
                };
              }
              if (col === "id" && val === orphanProfileId) {
                return {
                  maybeSingle: async () => ({
                    data: {
                      id: orphanProfileId,
                      status: "sns_pending",
                      email: "im2pact@gmail.com",
                      auth_login_email: "im2pact@gmail.com",
                      provider: "google",
                      auth_provider: "google",
                      provider_user_id: googleUserId,
                    },
                    error: null,
                  }),
                };
              }
              return { maybeSingle: async () => ({ data: null, error: null }) };
            },
          }),
          update: () => ({ eq: updateEq }),
        };
      });
      const adminSb = {
        auth: { admin: { deleteUser } },
        from,
      } as unknown as SupabaseClient;

      expect(reconcileActual.fn).toBeTypeOf("function");
      await reconcileActual.fn!(adminSb, canonicalUserId, googleUserId, "im2pact@gmail.com");
      expect(updateEq).toHaveBeenCalledWith("id", orphanProfileId);
      expect(deleteUser).toHaveBeenCalledWith(orphanProfileId);
    });

    it("P5: enrich=true facade runs pending then ensureUserProfile (single call absorbs false+true local work)", async () => {
      const facadeSrc = readSrc(FACADE_SRC);
      expect(facadeSrc).toMatch(/await ensurePendingAuthProfileRow/);
      expect(facadeSrc).toMatch(/if \(!opts\?\.enrichMemberProfile\)/);
      expect(facadeSrc).toMatch(/await ensureUserProfile/);

      ensureAuthProfileForLoginMock.mockImplementation(async (...args: unknown[]) => {
        const [, user, opts] = args as [
          SupabaseClient,
          { id: string },
          { enrichMemberProfile?: boolean } | undefined,
        ];
        await ensurePendingAuthProfileRow({} as never, user as never, {} as never);
        if (!opts?.enrichMemberProfile) {
          return { enriched: false, ensureUserProfileOutcome: null };
        }
        const ensureUserProfileOutcome = await ensureUserProfile({} as never, user as never);
        return { enriched: true, ensureUserProfileOutcome };
      });

      ensurePendingAuthProfileRow.mockClear();
      ensureUserProfile.mockClear();
      await ensureAuthProfileForLoginMock({} as SupabaseClient, { id: "u1" }, { enrichMemberProfile: true });
      expect(ensurePendingAuthProfileRow).toHaveBeenCalledTimes(1);
      expect(ensureUserProfile).toHaveBeenCalledTimes(1);

      ensurePendingAuthProfileRow.mockClear();
      ensureUserProfile.mockClear();
      await ensureAuthProfileForLoginMock({} as SupabaseClient, { id: "u1" }, { enrichMemberProfile: false });
      expect(ensurePendingAuthProfileRow).toHaveBeenCalledTimes(1);
      expect(ensureUserProfile).not.toHaveBeenCalled();
    });

    it("P5 source: enrich must follow reconcile (false-409 if reversed)", () => {
      const src = readSrc(GOOGLE_SESSION_SRC);
      expect(src).toMatch(/Slice 7-2 PLAN_G2/);
      expect(src.indexOf("await reconcileGoogleNativeProviderProfileConflict(")).toBeLessThan(
        src.indexOf("enrichMemberProfile: true"),
      );
    });

    it("P6–P7: 409/500 failure meanings remain hard-coded after enrich", () => {
      const src = readSrc(GOOGLE_SESSION_SRC);
      expect(src).toMatch(/duplicateWarning[\s\S]*provider_account_conflict[\s\S]*status:\s*409/);
      expect(src).toMatch(/profile_ensure_failed[\s\S]*status:\s*500/);
      expect(src).toMatch(/!ensuredProfile\?\.id/);
    });
  });

  describe("PLAN_G2 cutover summary", () => {
    it("Google session has exactly one enrich=true facade and zero enrich=false", () => {
      const src = readSrc(GOOGLE_SESSION_SRC);
      expect(src).not.toMatch(/enrichMemberProfile:\s*false/);
      expect(src.match(/enrichMemberProfile:\s*true/g)?.length).toBe(1);
      expect(src.match(/await ensureAuthProfileForLogin\(/g)?.length).toBe(1);
    });
  });
});
