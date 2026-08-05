/**
 * Slice 7-5 — Google Profile Hard Gate contract.
 * PRODUCT Runtime semantics unchanged; locks Hard Gate ownership + order + 500.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GOOGLE_LOGIN_PROFILE_HARD_GATE,
  GOOGLE_LOGIN_PROFILE_HARD_GATE_ERROR,
  GOOGLE_LOGIN_PROFILE_HARD_GATE_SEMANTICS,
} from "@/lib/auth/completion/google-profile-hard-gate-contract";
import { CANONICAL_LOGIN_PROFILE_WRITER } from "@/lib/auth/completion/identity-writer-i2-boundary";
import { establishGoogleNativeSession } from "@/lib/auth/native/google-native-session.server";

const findAuthUserByEmail = vi.fn();
const ensureAuthProfileForLogin = vi.fn();
const ensureProfileForUserId = vi.fn();
const getOnboardingStatus = vi.fn();
const syncActiveSessionForUser = vi.fn();
const reconcileMock = vi.fn();
const ensureProviderAuthIdentityRow = vi.fn();
const resolveCommonAuthDestination = vi.fn();

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

vi.mock("@/lib/auth/native/reconcile-google-native-orphan.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/native/reconcile-google-native-orphan.server")>();
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

vi.mock("@/lib/auth/completion/resolve-common-auth-destination.server", () => ({
  resolveCommonAuthDestination: (...args: unknown[]) => resolveCommonAuthDestination(...args),
}));

function readSrc(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const GOOGLE = "lib/auth/native/google-native-session.server.ts";
const HARD_GATE_IMPL = "lib/profile/ensure-profile-for-user-id.ts";
const FACADE = "lib/auth/completion/ensure-auth-profile-for-login.server.ts";
const RECOVER = "lib/auth/native/start-native-google-login.client.ts";

type TimelineStep = "reconcile" | "canonical" | "authIdentity" | "hardGate" | "destination";

type ProfileLookupRow = { id: string; status?: string; deleted_at?: string | null };
type IdentityRow = {
  id: string;
  user_id: string;
  provider: string;
  provider_user_id: string;
  email?: string | null;
  email_is_private_relay?: boolean;
};

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
            eq: () => ({
              neq: (_c: string, provider: unknown) => ({
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
            return { maybeSingle: async () => ({ data: match, error: null }) };
          },
          order: async () => ({ data: rows, error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
        };
        Object.defineProperty(chain, "then", {
          value(onFulfilled: (v: unknown) => void) {
            onFulfilled({
              data: rows.filter((row) => !(col === "user_id" && row.user_id !== val)),
              error: null,
            });
          },
        });
        return chain;
      },
      order: async () => ({ data: rows, error: null }),
    }),
    insert: () => ({
      select: () => ({
        single: async () => ({
          data: {
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

function profilesEqChain(row: ProfileLookupRow | null) {
  return {
    eq: () => ({
      maybeSingle: async () => ({ data: row, error: null }),
      limit: async () => ({ data: row ? [row] : [], error: null }),
    }),
    maybeSingle: async () => ({ data: row, error: null }),
    limit: async () => ({ data: row ? [row] : [], error: null }),
    in: async () => ({ data: row ? [row] : [], error: null }),
    or: () => ({ limit: async () => ({ data: row ? [{ id: row.id }] : [], error: null }) }),
    ilike: () => ({ limit: async () => ({ data: row ? [{ id: row.id }] : [], error: null }) }),
  };
}

function buildAdminSb() {
  const from = vi.fn((table: string) => {
    if (table === "user_auth_identities") return identityFromMock([]);
    if (table !== "profiles") return { update: () => ({ eq: async () => ({ error: null }) }) };
    return {
      select: () => ({
        eq: (col: string, val: unknown) => {
          if (col === "id") return profilesEqChain(null);
          if (col === "provider" && val === "google") return profilesEqChain(null);
          return profilesEqChain(null);
        },
        ilike: () => ({ limit: async () => ({ data: [], error: null }) }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    };
  });
  findAuthUserByEmail.mockResolvedValue(null);
  return {
    auth: {
      admin: {
        createUser: vi.fn(async () => ({ data: { user: { id: "new-user-id" } }, error: null })),
        updateUserById: vi.fn(async () => ({ error: null })),
        getUserById: vi.fn(async (id: string) => ({
          data: { user: { id, email: "google.107373086399795697553@google.native.dibay.internal" } },
          error: null,
        })),
        deleteUser: vi.fn(async () => ({ error: null })),
        listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
      },
    },
    from,
  } as unknown as SupabaseClient;
}

async function runEstablish() {
  const adminSb = buildAdminSb();
  const routeSb = {
    auth: {
      signInWithPassword: vi.fn(async () => ({
        data: {
          user: {
            id: "new-user-id",
            email: "google.107373086399795697553@google.native.dibay.internal",
          },
        },
        error: null,
      })),
    },
  } as unknown as SupabaseClient;
  return establishGoogleNativeSession(
    {
      adminSb,
      routeSb,
      request: new Request("https://samarket.vercel.app/api/auth/native/exchange") as never,
      response: {} as never,
    },
    {
      verified: {
        googleUserId: "107373086399795697553",
        audience: "229866850463-test.apps.googleusercontent.com",
        email: "bkim4pact@gmail.com",
        emailVerified: true,
      },
    },
  );
}

describe("Slice 7-5 Google Profile Hard Gate contract", () => {
  const timeline: TimelineStep[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    timeline.length = 0;
    process.env.AUTH_GOOGLE_NATIVE_EXCHANGE_ENABLED = "true";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

    ensureAuthProfileForLogin.mockImplementation(async () => {
      timeline.push("canonical");
      return {
        enriched: true,
        ensureUserProfileOutcome: { profile: { id: "new-user-id" }, linked: true, created: false },
      };
    });
    reconcileMock.mockImplementation(async () => {
      timeline.push("reconcile");
    });
    ensureProviderAuthIdentityRow.mockImplementation(async () => {
      timeline.push("authIdentity");
    });
    ensureProfileForUserId.mockImplementation(async (_sb, userId: string) => {
      timeline.push("hardGate");
      return { id: userId };
    });
    resolveCommonAuthDestination.mockImplementation(async () => {
      timeline.push("destination");
      return { destination: "/mypage" };
    });
    getOnboardingStatus.mockResolvedValue({
      signupComplete: true,
      consentComplete: true,
      dibayIdComplete: true,
      profileComplete: true,
    });
    syncActiveSessionForUser.mockResolvedValue(undefined);
  });

  it("SSOT: Hard Gate ≠ Canonical Writer", () => {
    expect(GOOGLE_LOGIN_PROFILE_HARD_GATE).toBe("ensureProfileForUserId");
    expect(CANONICAL_LOGIN_PROFILE_WRITER).toBe("ensureAuthProfileForLogin");
    expect(GOOGLE_LOGIN_PROFILE_HARD_GATE).not.toBe(CANONICAL_LOGIN_PROFILE_WRITER);
    expect(GOOGLE_LOGIN_PROFILE_HARD_GATE_ERROR).toEqual({
      errorCode: "profile_ensure_failed",
      status: 500,
    });
    expect(GOOGLE_LOGIN_PROFILE_HARD_GATE_SEMANTICS.finalNull).toBe("hard_fail_block_destination");
  });

  it("Hard Gate impl documents exists-noop + create-if-missing; Canonical does not call it", () => {
    const impl = readSrc(HARD_GATE_IMPL);
    expect(impl).toMatch(/export async function ensureProfileForUserId/);
    expect(impl).toMatch(/if \(existing\) return existing/);
    expect(impl).toMatch(/\.upsert\(/);
    expect(impl).toMatch(/Slice 7-5|profiles 가 항상 보장|최소 행을 upsert/);
    const facade = readSrc(FACADE);
    expect(facade).not.toMatch(/ensureProfileForUserId/);
  });

  it("Google source order: authIdentity → hardGate → destination; null → 500", () => {
    const src = readSrc(GOOGLE);
    const iCanonical = src.indexOf("await ensureAuthProfileForLogin(");
    const iCol = src.indexOf("await persistGoogleProfileIdentity(");
    const iRow = src.indexOf("await ensureProviderAuthIdentityRow(");
    const iHard = src.indexOf("await ensureProfileForUserId(");
    const iDest = src.indexOf("resolveCommonAuthDestination(");
    expect(iCol).toBeGreaterThan(iCanonical);
    expect(iRow).toBeGreaterThan(iCol);
    expect(iHard).toBeGreaterThan(iRow);
    expect(iDest).toBeGreaterThan(iHard);

    const hardBlock = src.slice(iHard, iDest);
    expect(hardBlock).toMatch(/!ensuredProfile\?\.id/);
    expect(hardBlock).toMatch(/profile_ensure_failed/);
    expect(hardBlock).toMatch(/status:\s*500/);
    expect(hardBlock).not.toMatch(/resolveCommonAuthDestination/);
  });

  it("success timeline: hardGate exactly once before destination", async () => {
    const result = await runEstablish();
    expect(result.ok).toBe(true);
    expect(timeline).toEqual(["reconcile", "canonical", "authIdentity", "hardGate", "destination"]);
    expect(ensureProfileForUserId).toHaveBeenCalledTimes(1);
    expect(resolveCommonAuthDestination).toHaveBeenCalledTimes(1);
  });

  it("existing profile: Hard Gate still runs once (noop-capable) then destination", async () => {
    const result = await runEstablish();
    expect(result.ok).toBe(true);
    expect(ensureProfileForUserId).toHaveBeenCalledTimes(1);
    expect(timeline.at(-2)).toBe("hardGate");
    expect(timeline.at(-1)).toBe("destination");
  });

  it("hardGate null → 500 profile_ensure_failed; destination 0", async () => {
    ensureProfileForUserId.mockImplementation(async () => {
      timeline.push("hardGate");
      return null;
    });
    const result = await runEstablish();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(GOOGLE_LOGIN_PROFILE_HARD_GATE_ERROR.errorCode);
      expect(result.status).toBe(GOOGLE_LOGIN_PROFILE_HARD_GATE_ERROR.status);
    }
    expect(timeline).toEqual(["reconcile", "canonical", "authIdentity", "hardGate"]);
    expect(resolveCommonAuthDestination).not.toHaveBeenCalled();
  });

  it("duplicateWarning 409 blocks before Hard Gate", async () => {
    ensureAuthProfileForLogin.mockImplementation(async () => {
      timeline.push("canonical");
      return {
        enriched: true,
        ensureUserProfileOutcome: {
          profile: { id: "new-user-id" },
          linked: false,
          created: false,
          duplicateWarning: true,
          duplicateCandidates: ["other"],
        },
      };
    });
    const result = await runEstablish();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(ensureProfileForUserId).not.toHaveBeenCalled();
    expect(resolveCommonAuthDestination).not.toHaveBeenCalled();
  });

  it("Recover uses same Google session Hard Gate (no fork)", () => {
    const recover = readSrc(RECOVER);
    expect(recover).toMatch(/completeNativeGoogleSession/);
    expect(recover).not.toMatch(/ensureProfileForUserId/);
    expect(readSrc(GOOGLE)).toMatch(/await ensureProfileForUserId\(/);
  });

  it("Slice 6 Completion owners untouched", () => {
    const ssot = readSrc("lib/auth/completion/google-profile-hard-gate-contract.ts");
    expect(ssot).not.toMatch(/syncCommonClientSessionAfterAuth|finishClientAuthLogin/);
    const google = readSrc(GOOGLE);
    expect(google).toMatch(/resolveCommonAuthDestination/);
    expect(google).not.toMatch(/syncCommonClientSessionAfterAuth|finishClientAuthLogin/);
  });
});
