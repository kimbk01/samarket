import { describe, expect, it, vi, beforeEach } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  hashPrefixForAuthDiag,
  WEB_OAUTH_CONFLICT_REASONS,
} from "@/lib/auth/provider-identity/web-oauth-policy-diagnostics.server";
import {
  buildOAuthUserProviderCandidate,
  enforceWebOAuthProviderPolicy,
} from "@/lib/auth/provider-identity/web-oauth-policy.server";

function mockSb(rows: {
  identities?: Array<Record<string, unknown>>;
  profiles?: Array<Record<string, unknown>>;
}) {
  const identityRows = rows.identities ?? [];
  const profileRows = rows.profiles ?? [];

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
            if (state.user_id && row.user_id !== state.user_id) return false;
            if (state[`neq:provider`] && row.provider === state[`neq:provider`]) return false;
            if (state.email) {
              const email = String(row.email ?? "").toLowerCase();
              if (email !== String(state.email).toLowerCase()) return false;
            }
            if (state[`ilike:email`]) {
              const email = String(row.email ?? "").toLowerCase();
              if (email !== String(state[`ilike:email`]).toLowerCase()) return false;
            }
            if (state.email_is_private_relay === false && row.email_is_private_relay === true) {
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
      then: undefined,
    };
    Object.defineProperty(builder, "then", {
      get() {
        return (resolve: (v: unknown) => void) => {
          if (table === "user_auth_identities" && !state.provider_user_id) {
            const filtered = identityRows.filter((row) => {
              if (state.user_id && row.user_id !== state.user_id) return false;
              if (state[`neq:provider`] && row.provider === state[`neq:provider`]) return false;
              if (state.email) {
                const email = String(row.email ?? "").toLowerCase();
                if (email !== String(state.email).toLowerCase()) return false;
              }
              if (state[`ilike:email`]) {
                const email = String(row.email ?? "").toLowerCase();
                if (email !== String(state[`ilike:email`]).toLowerCase()) return false;
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

  return { from } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

function googleOAuthUser(overrides?: Partial<User> & { sub?: string; sessionUserId?: string }): User {
  const sub = overrides?.sub ?? "google-sub-1";
  const id = overrides?.sessionUserId ?? overrides?.id ?? "session-user-new";
  return {
    id,
    email: overrides?.email ?? "same@gmail.com",
    identities: [
      {
        id: "auth-identity-1",
        user_id: id,
        identity_data: { sub, email: overrides?.email ?? "same@gmail.com" },
        provider: "google",
        created_at: "",
        last_sign_in_at: "",
        updated_at: "",
      },
    ],
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "",
    ...overrides,
  } as User;
}

describe("web-oauth-policy-diagnostics", () => {
  it("hashes subjects without exposing raw values", () => {
    const prefix = hashPrefixForAuthDiag("google-sub-secret");
    expect(prefix).toMatch(/^[a-f0-9]{8}$/);
    expect(prefix).not.toContain("google");
    expect(WEB_OAUTH_CONFLICT_REASONS).toContain("SAME_EMAIL_DIFFERENT_PROVIDER");
  });
});

describe("buildOAuthUserProviderCandidate", () => {
  it("reads google sub from auth.identities", () => {
    const candidate = buildOAuthUserProviderCandidate(googleOAuthUser({ sub: "gid-abc" }));
    expect(candidate?.provider).toBe("google");
    expect(candidate?.providerUserId).toBe("gid-abc");
    expect(candidate?.email).toBe("same@gmail.com");
  });
});

describe("enforceWebOAuthProviderPolicy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  it("rejects SAME_EMAIL_DIFFERENT_PROVIDER without auto-link", async () => {
    const sb = mockSb({
      identities: [
        {
          id: "id-1",
          user_id: "user-kakao",
          provider: "kakao",
          provider_user_id: "kakao-1",
          email: "same@gmail.com",
          email_is_private_relay: false,
        },
      ],
      profiles: [{ id: "user-kakao" }, { id: "session-user-new" }],
    });
    const result = await enforceWebOAuthProviderPolicy(sb, googleOAuthUser(), {
      callbackAttemptId: "woc-test-email",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("provider_email_conflict");
    expect(result.diag.conflictReason).toBe("SAME_EMAIL_DIFFERENT_PROVIDER");
    expect(result.diag.autoLinkAllowed).toBe(false);
    expect(result.diag.sameNormalizedEmailMatch).toBe(true);
    expect(result.diag.conflictingProviderTypes).toEqual(["kakao"]);
    expect(result.diag.callbackAttemptId).toBe("woc-test-email");
  });

  it("rejects SAME_PROVIDER_SUBJECT_DIFFERENT_USER when identity owner ≠ session", async () => {
    const sb = mockSb({
      identities: [
        {
          id: "id-1",
          user_id: "user-existing",
          provider: "google",
          provider_user_id: "google-sub-1",
          email: "same@gmail.com",
          email_is_private_relay: false,
        },
      ],
      profiles: [{ id: "user-existing" }, { id: "session-user-new" }],
    });
    const result = await enforceWebOAuthProviderPolicy(sb, googleOAuthUser(), {
      callbackAttemptId: "woc-test-subject",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("provider_account_conflict");
    expect(result.diag.conflictReason).toBe("SAME_PROVIDER_SUBJECT_DIFFERENT_USER");
    expect(result.diag.sameProviderSubjectMatch).toBe(true);
    expect(result.diag.rejectionBranch).toBe("existing.user_auth_identities.user_id_mismatch");
    expect(result.diag.autoLinkAllowed).toBe(false);
  });

  it("allows when session user already owns the google identity", async () => {
    const sb = mockSb({
      identities: [
        {
          id: "id-1",
          user_id: "session-user-new",
          provider: "google",
          provider_user_id: "google-sub-1",
          email: "same@gmail.com",
          email_is_private_relay: false,
        },
      ],
      profiles: [{ id: "session-user-new" }],
    });
    const result = await enforceWebOAuthProviderPolicy(sb, googleOAuthUser(), {
      callbackAttemptId: "woc-test-allow",
    });
    expect(result.ok).toBe(true);
    expect(result.diag.policyResult).toBe("allow");
    expect(result.diag.conflictReason).toBeNull();
  });
});
