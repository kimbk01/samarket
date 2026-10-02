/**
 * R7-3 — established-member rebind guard (Package A/B).
 * Structural fixture mirrors Production split shape without mutating Prod.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import {
  enforceWebOAuthProviderPolicy,
} from "@/lib/auth/provider-identity/web-oauth-policy.server";
import { mapAuthErrorMessage } from "@/lib/auth/login-error-i18n";
import type { MessageKey } from "@/lib/i18n/messages";

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
        if (table === "profiles" && state.id) {
          const match = profileRows.find((row) => row.id === state.id);
          return { data: match ? { id: match.id } : null, error: null };
        }
        return { data: null, error: null };
      }),
      then: undefined as unknown,
    };
    Object.defineProperty(builder, "then", {
      get() {
        return (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
      },
    });
    return builder;
  });
  return { from } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

function googleUser(sessionUserId: string, sub: string): User {
  return {
    id: sessionUserId,
    email: "fixture@example.com",
    identities: [
      {
        id: "auth-id-1",
        identity_id: "auth-id-1",
        user_id: sessionUserId,
        identity_data: { sub, email: "fixture@example.com" },
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
  } as unknown as User;
}

describe("R7-3 established-member rebind guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  it("T01: identity owner == session → normal, no rebind", async () => {
    const sb = mockSb({
      identities: [
        {
          id: "i1",
          user_id: "same-user",
          provider: "google",
          provider_user_id: "sub-same",
          email: "fixture@example.com",
          email_is_private_relay: false,
        },
      ],
      profiles: [{ id: "same-user", status: "verified_user" }],
    });
    const result = await enforceWebOAuthProviderPolicy(sb, googleUser("same-user", "sub-same"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rebindToUserId).toBeUndefined();
  });

  it("T02: owner differs + no session profile → temp rebind allowed", async () => {
    const sb = mockSb({
      identities: [
        {
          id: "i1",
          user_id: "owner-u",
          provider: "google",
          provider_user_id: "sub-b",
          email: "fixture@example.com",
          email_is_private_relay: false,
        },
      ],
      profiles: [{ id: "owner-u" }],
    });
    const result = await enforceWebOAuthProviderPolicy(sb, googleUser("temp-v", "sub-b"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rebindToUserId).toBe("owner-u");
  });

  it("T03: verified session profile → reconciliation; no rebindToUserId", async () => {
    const sb = mockSb({
      identities: [
        {
          id: "i1",
          user_id: "owner-u",
          provider: "google",
          provider_user_id: "sub-c",
          email: "fixture@example.com",
          email_is_private_relay: false,
        },
      ],
      profiles: [
        { id: "owner-u", status: "verified_user" },
        { id: "session-v", status: "verified_user" },
      ],
    });
    const result = await enforceWebOAuthProviderPolicy(sb, googleUser("session-v", "sub-c"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("provider_account_reconciliation_required");
    expect("rebindToUserId" in result).toBe(false);
  });

  it("T04: sns_pending session profile → reconciliation", async () => {
    const sb = mockSb({
      identities: [
        {
          id: "i1",
          user_id: "owner-u",
          provider: "google",
          provider_user_id: "sub-e",
          email: "fixture@example.com",
          email_is_private_relay: false,
        },
      ],
      profiles: [
        { id: "owner-u" },
        { id: "pending-v", status: "sns_pending" },
      ],
    });
    const result = await enforceWebOAuthProviderPolicy(sb, googleUser("pending-v", "sub-e"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("provider_account_reconciliation_required");
  });

  it("T05/T06: deleted/blocked session profile → still reconciliation (no tombstone path)", async () => {
    for (const status of ["deleted", "blocked", "suspended"] as const) {
      const sb = mockSb({
        identities: [
          {
            id: "i1",
            user_id: "owner-u",
            provider: "google",
            provider_user_id: `sub-${status}`,
            email: "fixture@example.com",
            email_is_private_relay: false,
          },
        ],
        profiles: [{ id: "owner-u" }, { id: `v-${status}`, status }],
      });
      const result = await enforceWebOAuthProviderPolicy(
        sb,
        googleUser(`v-${status}`, `sub-${status}`),
      );
      expect(result.ok, status).toBe(false);
      if (result.ok) return;
      expect(result.errorCode).toBe("provider_account_reconciliation_required");
    }
  });

  it("T14: retry same CASE C → deterministic same conflict", async () => {
    const sb = mockSb({
      identities: [
        {
          id: "i1",
          user_id: "owner-u",
          provider: "google",
          provider_user_id: "sub-retry",
          email: "fixture@example.com",
          email_is_private_relay: false,
        },
      ],
      profiles: [{ id: "owner-u" }, { id: "session-v" }],
    });
    const a = await enforceWebOAuthProviderPolicy(sb, googleUser("session-v", "sub-retry"));
    const b = await enforceWebOAuthProviderPolicy(sb, googleUser("session-v", "sub-retry"));
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (a.ok || b.ok) return;
    expect(a.errorCode).toBe(b.errorCode);
    expect(a.diag.conflictReason).toBe("ESTABLISHED_MEMBER_REBIND_FORBIDDEN");
  });

  it("error contract maps reconciliation key without PII", () => {
    const catalog: Partial<Record<MessageKey, string>> = {
      auth_err_provider_account_reconciliation_required:
        "이 로그인 계정은 기존 dibaY 계정과 연결 상태를 확인해야 합니다. 다른 로그인 방법을 사용하거나 고객지원에 문의해 주세요.",
    };
    const t = (key: MessageKey) => catalog[key] ?? key;
    const msg = mapAuthErrorMessage("provider_account_reconciliation_required", undefined, t);
    expect(msg).toContain("고객지원");
    expect(msg).not.toMatch(/c741|5a22|@|uuid|sub-/i);
  });
});

describe("R7-3 callback integration (CASE C)", () => {
  const exchangeCodeForSession = vi.fn();
  const getUser = vi.fn();
  const signOut = vi.fn();
  const enforceWebOAuthProviderPolicyMock = vi.fn();
  const rebindWebOAuthSessionToOwner = vi.fn();
  const ensureAuthProfileForLogin = vi.fn();
  const persistOAuthProviderIdentity = vi.fn();
  const syncActiveSessionForUser = vi.fn();
  const getOnboardingStatus = vi.fn();
  const resolveCommonAuthDestination = vi.fn();
  const revokeSessionForWithdrawnMember = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");

    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "session-v",
          email: "v@example.com",
          identities: [
            {
              provider: "google",
              identity_data: { sub: "google-subject-S" },
            },
          ],
          user_metadata: {},
        },
      },
      error: null,
    });
    signOut.mockResolvedValue({ error: null });
    enforceWebOAuthProviderPolicyMock.mockResolvedValue({
      ok: false,
      errorCode: "provider_account_reconciliation_required",
      message:
        "이 로그인 계정은 기존 dibaY 계정과 연결 상태를 확인해야 합니다. 다른 로그인 방법을 사용하거나 고객지원에 문의해 주세요.",
      diag: {
        conflictReason: "ESTABLISHED_MEMBER_REBIND_FORBIDDEN",
      },
      candidate: {
        provider: "google",
        providerUserId: "google-subject-S",
      },
    });

    vi.doMock("@supabase/ssr", () => ({
      createServerClient: vi.fn((_url: string, _anon: string, options: {
        cookies: { setAll: (rows: Array<{ name: string; value: string }>) => void };
      }) => {
        options.cookies.setAll([
          { name: "sb-proj-auth-token", value: "session" },
        ]);
        return {
          auth: { exchangeCodeForSession, getUser, signOut },
        };
      }),
    }));
    vi.doMock("@/lib/supabase/try-supabase-server", () => ({
      tryCreateSupabaseServiceClient: () => ({ from: vi.fn() }),
    }));
    vi.doMock("@/lib/auth/provider-identity/web-oauth-policy.server", () => ({
      enforceWebOAuthProviderPolicy: (...args: unknown[]) =>
        enforceWebOAuthProviderPolicyMock(...args),
      persistOAuthProviderIdentity: (...args: unknown[]) => persistOAuthProviderIdentity(...args),
    }));
    vi.doMock("@/lib/auth/provider-identity/web-oauth-owner-rebind.server", async () => {
      const actual = await vi.importActual<
        typeof import("@/lib/auth/provider-identity/web-oauth-owner-rebind.server")
      >("@/lib/auth/provider-identity/web-oauth-owner-rebind.server");
      return {
        ...actual,
        rebindWebOAuthSessionToOwner: (...args: unknown[]) => rebindWebOAuthSessionToOwner(...args),
      };
    });
    vi.doMock("@/lib/auth/completion/ensure-auth-profile-for-login.server", () => ({
      ensureAuthProfileForLogin: (...args: unknown[]) => ensureAuthProfileForLogin(...args),
    }));
    vi.doMock("@/lib/auth/get-onboarding-status", () => ({
      getOnboardingStatus: (...args: unknown[]) => getOnboardingStatus(...args),
    }));
    vi.doMock("@/lib/auth/completion/resolve-common-auth-destination.server", () => ({
      resolveCommonAuthDestination: (...args: unknown[]) => resolveCommonAuthDestination(...args),
    }));
    vi.doMock("@/lib/auth/server-guards", () => ({
      syncActiveSessionForUser: (...args: unknown[]) => syncActiveSessionForUser(...args),
    }));
    vi.doMock("@/lib/auth/withdrawn-account-guard", () => ({
      revokeSessionForWithdrawnMember: (...args: unknown[]) =>
        revokeSessionForWithdrawnMember(...args),
    }));
  });

  it("T07–T13: CASE C clears session, redirects, skips all writers", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const req = new NextRequest(
      "https://samarket.vercel.app/auth/callback?code=oauth-code-fixture",
      {
        headers: {
          cookie: "sb-proj-auth-token=abc; sb-proj-auth-token.0=chunk",
        },
      },
    );
    const res = await GET(req);
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/login");
    expect(location).toContain("auth_error=provider_account_reconciliation_required");
    expect(location).not.toContain("auth_conflict_email=");
    expect(exchangeCodeForSession).toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(rebindWebOAuthSessionToOwner).not.toHaveBeenCalled();
    expect(ensureAuthProfileForLogin).not.toHaveBeenCalled();
    expect(persistOAuthProviderIdentity).not.toHaveBeenCalled();
    expect(syncActiveSessionForUser).not.toHaveBeenCalled();
    expect(getOnboardingStatus).not.toHaveBeenCalled();
    expect(resolveCommonAuthDestination).not.toHaveBeenCalled();
    expect(revokeSessionForWithdrawnMember).not.toHaveBeenCalled();
    expect(res.cookies.get("sb-proj-auth-token")?.value ?? "").toBe("");
  });
});
