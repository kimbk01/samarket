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

  // Package D lookup (password member by verified email) — OAuth-only users never match.
  const auth = {
    admin: {
      listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
    },
  };

  return { from, auth } as unknown as import("@supabase/supabase-js").SupabaseClient;
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

  it("allows rebind when SSOT identity owner ≠ session and session has NO profile (CASE B)", async () => {
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
      profiles: [{ id: "user-existing" }],
    });
    const result = await enforceWebOAuthProviderPolicy(sb, googleOAuthUser(), {
      callbackAttemptId: "woc-test-subject",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rebindToUserId).toBe("user-existing");
    expect(result.diag.conflictReason).toBe("SAME_PROVIDER_SUBJECT_DIFFERENT_USER");
    expect(result.diag.rejectionBranch).toBe(
      "existing.user_auth_identities.user_id_mismatch.rebind",
    );
    expect(result.diag.policyResult).toBe("allow");
    expect(result.diag.autoLinkAllowed).toBe(false);
    expect(result.diag.orphanAuthUserDetected).toBe(true);
  });

  it("requires reconciliation when SSOT owner ≠ session and session has profile (CASE C / R7-3)", async () => {
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
      callbackAttemptId: "woc-test-established",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("provider_account_reconciliation_required");
    expect(result.diag.conflictReason).toBe("ESTABLISHED_MEMBER_REBIND_FORBIDDEN");
    expect(result.diag.rejectionBranch).toBe(
      "existing.user_auth_identities.user_id_mismatch.established_member_reconciliation",
    );
    expect(result.diag.policyResult).toBe("reject");
    expect(result.diag.orphanAuthUserDetected).toBe(false);
  });

  it("still rejects profiles_fallback owner mismatch (no email merge / no weak rebind)", async () => {
    const sb = mockSb({
      identities: [],
      profiles: [
        {
          id: "profile-owner",
          provider: "google",
          provider_user_id: "google-sub-1",
        },
        { id: "session-user-new" },
      ],
    });
    const result = await enforceWebOAuthProviderPolicy(sb, googleOAuthUser(), {
      callbackAttemptId: "woc-test-profile-fallback",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("provider_account_conflict");
    expect(result.diag.conflictReason).toBe("EXISTING_PROVIDER_IDENTITY_ALREADY_LINKED");
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

function googleUserWithAutoLinkedApple(opts?: { appleEmail?: string }): User {
  const appleEmail = opts?.appleEmail ?? "same@gmail.com";
  return {
    id: "user-google",
    email: "same@gmail.com",
    identities: [
      {
        id: "auth-identity-google",
        user_id: "user-google",
        identity_data: { sub: "google-sub-1", email: "same@gmail.com", email_verified: true },
        provider: "google",
        created_at: "",
        last_sign_in_at: "2026-10-01T00:00:00Z",
        updated_at: "",
      },
      {
        id: "auth-identity-apple",
        user_id: "user-google",
        identity_data: { sub: "apple-sub-1", email: appleEmail, email_verified: true },
        provider: "apple",
        created_at: "",
        last_sign_in_at: "2026-10-21T00:00:00Z",
        updated_at: "",
      },
    ],
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "",
  } as unknown as User;
}

describe("P1-6 this-login identity candidate", () => {
  it("prefers identity matching callback ?provider=", () => {
    const user = googleUserWithAutoLinkedApple();
    expect(buildOAuthUserProviderCandidate(user, { loginProvider: "google" })?.provider).toBe(
      "google",
    );
    expect(buildOAuthUserProviderCandidate(user, { loginProvider: "apple" })?.providerUserId).toBe(
      "apple-sub-1",
    );
  });

  it("falls back to newest last_sign_in_at when provider param is absent", () => {
    const candidate = buildOAuthUserProviderCandidate(googleUserWithAutoLinkedApple());
    expect(candidate?.provider).toBe("apple");
  });
});

describe("P1-6 Supabase email auto-link bypass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  it("auto-linked Apple on Google member (email match) → provider_email_conflict", async () => {
    const sb = mockSb({
      identities: [
        {
          id: "id-g",
          user_id: "user-google",
          provider: "google",
          provider_user_id: "google-sub-1",
          email: "same@gmail.com",
          email_is_private_relay: false,
        },
      ],
      profiles: [{ id: "user-google" }],
    });
    const result = await enforceWebOAuthProviderPolicy(sb, googleUserWithAutoLinkedApple(), {
      callbackAttemptId: "woc-p16-email",
      loginProvider: "apple",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("provider_email_conflict");
    expect(result.conflict?.attemptedProvider).toBe("apple");
    expect(result.conflict?.existingProviders).toEqual(["google"]);
    expect(result.conflict?.stashToken).toBeTruthy();
  });

  it("auto-linked Apple without SSOT email match (resolve=new) → provider_email_conflict, not existing-account login", async () => {
    const sb = mockSb({
      identities: [
        {
          id: "id-g",
          user_id: "user-google",
          provider: "google",
          provider_user_id: "google-sub-1",
          email: null,
          email_is_private_relay: false,
        },
      ],
      profiles: [{ id: "user-google" }],
    });
    const result = await enforceWebOAuthProviderPolicy(sb, googleUserWithAutoLinkedApple(), {
      callbackAttemptId: "woc-p16-new",
      loginProvider: "apple",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("provider_email_conflict");
    expect(result.diag.rejectionBranch).toBe("new.supabase_auto_linked_identity");
    expect(result.diag.autoLinkAllowed).toBe(false);
    expect(result.conflict).toMatchObject({
      email: "same@gmail.com",
      attemptedProvider: "apple",
      existingProviders: ["google"],
    });
  });

  it("same-provider Google relogin on the same user stays allowed (no rebind, no conflict)", async () => {
    const sb = mockSb({
      identities: [
        {
          id: "id-g",
          user_id: "user-google",
          provider: "google",
          provider_user_id: "google-sub-1",
          email: "same@gmail.com",
          email_is_private_relay: false,
        },
      ],
      profiles: [{ id: "user-google" }],
    });
    const result = await enforceWebOAuthProviderPolicy(sb, googleUserWithAutoLinkedApple(), {
      callbackAttemptId: "woc-p16-relogin",
      loginProvider: "google",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidate?.provider).toBe("google");
    expect(result.rebindToUserId).toBeUndefined();
  });

  it("DIBAY-linked Apple (SSOT row on same user) relogin stays allowed", async () => {
    const sb = mockSb({
      identities: [
        {
          id: "id-g",
          user_id: "user-google",
          provider: "google",
          provider_user_id: "google-sub-1",
          email: "same@gmail.com",
          email_is_private_relay: false,
        },
        {
          id: "id-a",
          user_id: "user-google",
          provider: "apple",
          provider_user_id: "apple-sub-1",
          email: "same@gmail.com",
          email_is_private_relay: false,
        },
      ],
      profiles: [{ id: "user-google" }],
    });
    const result = await enforceWebOAuthProviderPolicy(sb, googleUserWithAutoLinkedApple(), {
      callbackAttemptId: "woc-p16-linked",
      loginProvider: "apple",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidate?.provider).toBe("apple");
  });

  it("brand-new single-identity Apple user stays allowed", async () => {
    const sb = mockSb({ identities: [], profiles: [] });
    const user = googleUserWithAutoLinkedApple();
    const fresh = {
      ...user,
      id: "fresh-apple",
      email: "fresh@icloud.com",
      identities: [
        {
          ...(user.identities?.[1] ?? {}),
          user_id: "fresh-apple",
          identity_data: { sub: "apple-fresh", email: "fresh@icloud.com", email_verified: true },
        },
      ],
    } as User;
    const result = await enforceWebOAuthProviderPolicy(sb, fresh, {
      callbackAttemptId: "woc-p16-fresh",
      loginProvider: "apple",
    });
    expect(result.ok).toBe(true);
  });
});

describe("OA-17 persistOAuthProviderIdentity retry", () => {
  it("retries once then logs oauth_identity_persist_failed without throwing", async () => {
    vi.resetModules();
    const ensure = vi.fn(async () => {
      throw Object.assign(new Error("db down"), { code: "57P01" });
    });
    vi.doMock("@/lib/auth/provider-identity/native-session-bridge.server", () => ({
      ensureProviderAuthIdentityRow: ensure,
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const mod = await import("@/lib/auth/provider-identity/web-oauth-policy.server");
    const ok = await mod.persistOAuthProviderIdentity(
      {} as import("@supabase/supabase-js").SupabaseClient,
      "user-1",
      { provider: "kakao", providerUserId: "kakao-1" },
      { callbackAttemptId: "woc-oa17" },
    );
    expect(ok).toBe(false);
    expect(ensure).toHaveBeenCalledTimes(2);
    const logged = String(errSpy.mock.calls[0]?.[1] ?? "");
    expect(logged).toContain("oauth_identity_persist_failed");
    expect(logged).toContain("woc-oa17");
    expect(logged).not.toContain("kakao-1");
    expect(logged).not.toContain("user-1");
    vi.doUnmock("@/lib/auth/provider-identity/native-session-bridge.server");
  });

  it("second attempt success returns true without error log", async () => {
    vi.resetModules();
    let calls = 0;
    const ensure = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("transient");
    });
    vi.doMock("@/lib/auth/provider-identity/native-session-bridge.server", () => ({
      ensureProviderAuthIdentityRow: ensure,
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    errSpy.mockClear();
    const mod = await import("@/lib/auth/provider-identity/web-oauth-policy.server");
    const ok = await mod.persistOAuthProviderIdentity(
      {} as import("@supabase/supabase-js").SupabaseClient,
      "user-1",
      { provider: "google", providerUserId: "g-1" },
    );
    expect(ok).toBe(true);
    expect(ensure).toHaveBeenCalledTimes(2);
    expect(errSpy).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/auth/provider-identity/native-session-bridge.server");
  });
});
