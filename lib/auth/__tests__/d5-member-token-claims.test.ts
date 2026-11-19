/**
 * D5 (auth-hard-lock.md Amendment 2026-11-19 (2)) — 토큰 클레임 `dibay_m` 로 proxy 게이트의 profiles 조회 생략.
 * 긍정 판정(활성·정지 읽기 / 약관 완료)만 DB 를 건너뛰고, 나머지는 기존 DB 경로.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const UID = "11111111-1111-4111-8111-111111111111";
const URL_ = "https://abcd.supabase.co";

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
function jwt(alg: string, payload: Record<string, unknown>): string {
  return `${b64url({ alg, typ: "JWT" })}.${b64url(payload)}.sig`;
}
function sessionCookie(token: string): { name: string; value: string } {
  const session = { access_token: token, expires_at: Math.floor(Date.now() / 1000) + 3600 };
  return { name: "sb-abcd-auth-token", value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}` };
}

const CLAIM_ACTIVE = {
  v: 1,
  status: "verified_user",
  deleted_at: null,
  terms_accepted_at: "2026-11-17T18:43:57Z",
  terms_version: "t1",
  privacy_accepted_at: "2026-11-17T18:43:57Z",
  privacy_version: "p1",
};

function mockGetClaims(result: { data: unknown; error: unknown }, spy = vi.fn()) {
  vi.doMock("@supabase/ssr", async () => {
    const actual = await vi.importActual<typeof import("@supabase/ssr")>("@supabase/ssr");
    return {
      ...actual,
      createServerClient: () => ({
        auth: {
          getClaims: async (...args: unknown[]) => {
            spy(...args);
            return result;
          },
        },
      }),
    };
  });
  return spy;
}

describe("D5 readVerifiedDibayMemberClaim", () => {
  beforeEach(() => vi.resetModules());

  const future = () => Math.floor(Date.now() / 1000) + 600;

  it("asymmetric, verified, not expired, same sub → claim", async () => {
    const token = jwt("ES256", { sub: UID });
    const spy = mockGetClaims({ data: { claims: { sub: UID, exp: future(), dibay_m: CLAIM_ACTIVE } }, error: null });
    const { readVerifiedDibayMemberClaim } = await import("@/lib/auth/member-token-claims");
    const c = await readVerifiedDibayMemberClaim({ cookies: [sessionCookie(token)], supabaseUrl: URL_, anonKey: "a", expectedUserId: UID });
    expect(c?.status).toBe("verified_user");
    expect(spy).toHaveBeenCalledWith(token);
  });

  it("HS256 token → null without calling getClaims (no extra Auth call)", async () => {
    const spy = mockGetClaims({ data: { claims: { sub: UID, exp: future(), dibay_m: CLAIM_ACTIVE } }, error: null });
    const { readVerifiedDibayMemberClaim } = await import("@/lib/auth/member-token-claims");
    const c = await readVerifiedDibayMemberClaim({
      cookies: [sessionCookie(jwt("HS256", { sub: UID }))],
      supabaseUrl: URL_,
      anonKey: "a",
      expectedUserId: UID,
    });
    expect(c).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it.each([
    ["expired exp", { data: { claims: { sub: UID, exp: Math.floor(Date.now() / 1000) - 5, dibay_m: CLAIM_ACTIVE } }, error: null }],
    ["other sub", { data: { claims: { sub: "22222222-2222-4222-8222-222222222222", exp: Math.floor(Date.now() / 1000) + 600, dibay_m: CLAIM_ACTIVE } }, error: null }],
    ["verify error", { data: null, error: new Error("bad sig") }],
    ["no dibay_m (hook off / old token)", { data: { claims: { sub: UID, exp: Math.floor(Date.now() / 1000) + 600 } }, error: null }],
  ])("%s → null", async (_name, result) => {
    mockGetClaims(result as { data: unknown; error: unknown });
    const { readVerifiedDibayMemberClaim } = await import("@/lib/auth/member-token-claims");
    const c = await readVerifiedDibayMemberClaim({
      cookies: [sessionCookie(jwt("ES256", { sub: UID }))],
      supabaseUrl: URL_,
      anonKey: "a",
      expectedUserId: UID,
    });
    expect(c).toBeNull();
  });

  it("read allowed only for active / suspended (same lifecycle mapping)", async () => {
    const { isDibayMemberClaimReadAllowed, parseDibayMemberClaim } = await import("@/lib/auth/member-token-claims");
    const mk = (status: string, deleted_at: string | null = null) => parseDibayMemberClaim({ ...CLAIM_ACTIVE, status, deleted_at })!;
    expect(isDibayMemberClaimReadAllowed(mk("verified_user"))).toBe(true);
    expect(isDibayMemberClaimReadAllowed(mk("active"))).toBe(true);
    expect(isDibayMemberClaimReadAllowed(mk("suspended"))).toBe(true);
    expect(isDibayMemberClaimReadAllowed(mk("blocked"))).toBe(false);
    expect(isDibayMemberClaimReadAllowed(mk("withdrawn"))).toBe(false);
    expect(isDibayMemberClaimReadAllowed(mk("active", "2026-11-01T00:00:00Z"))).toBe(false);
    expect(parseDibayMemberClaim({ ...CLAIM_ACTIVE, v: 2 })).toBeNull();
  });
});

describe("D5 read gate — DB skipped only for allowed claims", () => {
  beforeEach(() => vi.resetModules());

  function setup(claim: unknown, lifecycle: string) {
    const lifecycleSpy = vi.fn();
    vi.doMock("@/lib/auth/enforce-api-member-mutation-policy", () => ({
      resolveApiIdentity: async () => ({ userId: UID, transientError: false }),
    }));
    vi.doMock("@/lib/env/runtime", () => ({
      requireSupabaseEnv: () => ({ ok: true, url: URL_, anonKey: "anon" }),
    }));
    vi.doMock("@/lib/auth/member-token-claims", async () => {
      const actual = await vi.importActual<typeof import("@/lib/auth/member-token-claims")>("@/lib/auth/member-token-claims");
      return { ...actual, readVerifiedDibayMemberClaim: async () => (claim ? actual.parseDibayMemberClaim(claim) : null) };
    });
    vi.doMock("@/lib/auth/resolve-member-lifecycle-authority", () => ({
      resolveMemberLifecycleAuthority: async (...a: unknown[]) => {
        lifecycleSpy(...a);
        return { kind: "RESOLVED", profile: { status: lifecycle }, lifecycle, source: "db" };
      },
    }));
    return lifecycleSpy;
  }
  const get = () =>
    new NextRequest("http://localhost/api/me/notifications/badge-count", {
      method: "GET",
      headers: { cookie: "sb-abcd-auth-token=x" },
    });

  it("active claim → pass, no DB", async () => {
    const spy = setup(CLAIM_ACTIVE, "active");
    const { enforceApiMemberReadPolicy } = await import("@/lib/auth/enforce-api-member-read-policy");
    expect(await enforceApiMemberReadPolicy(get())).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("blocked claim → DB path → 403 when DB says blocked", async () => {
    const spy = setup({ ...CLAIM_ACTIVE, status: "blocked" }, "blocked");
    const { enforceApiMemberReadPolicy } = await import("@/lib/auth/enforce-api-member-read-policy");
    const res = await enforceApiMemberReadPolicy(get());
    expect(res?.status).toBe(403);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("no claim → DB path (unchanged)", async () => {
    const spy = setup(null, "withdrawn");
    const { enforceApiMemberReadPolicy } = await import("@/lib/auth/enforce-api-member-read-policy");
    expect((await enforceApiMemberReadPolicy(get()))?.status).toBe(403);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("D5 signup gate — profiles skipped only when claim consent complete", () => {
  beforeEach(() => vi.resetModules());

  function setup() {
    vi.doMock("@/lib/legal/resolve-required-consent-versions", () => ({
      resolveRequiredConsentVersions: async () => ({ termsVersion: "t1", privacyVersion: "p1" }),
    }));
    vi.doMock("@/lib/admin/admin-membership", () => ({ hasActiveAdminMembershipOrLegacyRole: async () => false }));
    const from = vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: UID, ...CLAIM_ACTIVE }, error: null }) }) }),
    }));
    return { sb: { from } as never, from };
  }

  it("claim complete → no profiles read", async () => {
    const { sb, from } = setup();
    const { resolveProxySignupGateRedirect } = await import("@/lib/auth/proxy-signup-gate");
    const { parseDibayMemberClaim } = await import("@/lib/auth/member-token-claims");
    const r = await resolveProxySignupGateRedirect(sb, UID, "/chats", {
      loadVerifiedClaim: async () => parseDibayMemberClaim(CLAIM_ACTIVE),
    });
    expect(r).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("claim with old terms version → DB path", async () => {
    const { sb, from } = setup();
    const { resolveProxySignupGateRedirect } = await import("@/lib/auth/proxy-signup-gate");
    const { parseDibayMemberClaim } = await import("@/lib/auth/member-token-claims");
    await resolveProxySignupGateRedirect(sb, UID, "/chats", {
      loadVerifiedClaim: async () => parseDibayMemberClaim({ ...CLAIM_ACTIVE, terms_version: "t0" }),
    });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("no claim → DB path (unchanged)", async () => {
    const { sb, from } = setup();
    const { resolveProxySignupGateRedirect } = await import("@/lib/auth/proxy-signup-gate");
    await resolveProxySignupGateRedirect(sb, UID, "/chats", { loadVerifiedClaim: async () => null });
    expect(from).toHaveBeenCalledTimes(1);
  });
});
