import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
let profileRow: Record<string, unknown> | null = null;
let ageState: { ok: true; fields: Record<string, unknown> } | { ok: false } = { ok: false };
let marketingRead: { ok: true; consent: { source: string | null } | null } | { ok: false } = {
  ok: true,
  consent: null,
};
const rpcInputs: Record<string, unknown>[] = [];

vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserIdStrict: async () => ({ ok: true, userId: "u1" }),
}));
vi.mock("@/lib/auth/member-access", () => ({ ensurePendingAuthProfileRow: async () => undefined }));
vi.mock("@/lib/legal/resolve-required-consent-versions", () => ({
  resolveRequiredConsentVersions: async () => ({ termsVersion: "t1", privacyVersion: "p1", source: "cms" }),
  resolveRequiredConsentVersionsStrict: async () => ({ termsVersion: "t1", privacyVersion: "p1", source: "cms" }),
}));
vi.mock("@/lib/legal/marketing-consent.server", () => ({
  loadMarketingConsentDoc: async () => ({ version: "m1", title: { ko: "", en: "" }, summary: { ko: "", en: "" } }),
  readMemberMarketingConsent: async () => marketingRead,
  writeMemberMarketingConsent: async (_sb: unknown, _uid: string, input: { enabled: boolean }) => {
    calls.push(`marketing:${input.enabled}`);
    return { ok: true };
  },
}));
vi.mock("@/lib/profile/fetch-profile-row-safe", () => ({ fetchProfileRowSafe: async () => profileRow }));
vi.mock("@/lib/supabase/supabase-server-route", () => ({
  createSupabaseRouteHandlerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  }),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => ({}) }));
vi.mock("@/lib/legal/member-age-gate-legacy.server", () => ({ readMemberAgeGateState: async () => ageState }));
let quotaOk = true;
vi.mock("@/lib/security/rate-limit-presets", () => ({
  enforceLegalConsentSubmitQuota: async () =>
    quotaOk
      ? { ok: true }
      : { ok: false, response: new Response(JSON.stringify({ code: "legal_consent_rate_limited" }), { status: 429 }) },
}));
vi.mock("@/lib/legal/record-required-consent.server", () => ({
  recordRequiredMemberConsentServer: async (_sb: unknown, input: Record<string, unknown>) => {
    calls.push("rpc");
    rpcInputs.push(input);
    return { ok: true, idempotent: false, legacy: false, termsVersion: "t1", privacyVersion: "p1", recordedAt: "now" };
  },
}));

import { PATCH } from "@/app/api/me/legal-consent/route";

const TERMS_OK = {
  terms_accepted_at: "2026-10-01T00:00:00Z",
  terms_version: "t1",
  privacy_accepted_at: "2026-10-01T00:00:00Z",
  privacy_version: "p1",
};
const legacyState = { ok: true as const, fields: { age_gate_legacy: true, age_gate_status: null } };
const newState = { ok: true as const, fields: { age_gate_legacy: false, age_gate_status: null } };

function patch(body: Record<string, unknown>) {
  return PATCH(
    new Request("http://x/api/me/legal-consent", {
      method: "PATCH",
      body: JSON.stringify(body),
    }) as never,
  );
}

beforeEach(() => {
  calls.length = 0;
  rpcInputs.length = 0;
  profileRow = null;
  ageState = newState;
  marketingRead = { ok: true, consent: null };
  quotaOk = true;
});

describe("existing (pre-policy) member", () => {
  it("terms current + legacy → idempotent, no RPC, no age demanded", async () => {
    profileRow = TERMS_OK;
    ageState = legacyState;
    marketingRead = { ok: true, consent: { source: "existing_member_default" } };
    const res = await patch({});
    expect(res.status).toBe(200);
    expect(calls).toEqual([]);
  });

  it("terms revised → reconsent without DOB, existing marketing untouched", async () => {
    profileRow = { ...TERMS_OK, terms_version: "t0" };
    ageState = legacyState;
    marketingRead = { ok: true, consent: { source: "existing_member_default" } };
    const res = await patch({ agreeTerms: true, agreePrivacy: true, agreeMarketing: false });
    expect(res.status).toBe(200);
    expect(calls).toEqual(["rpc"]);
    expect(rpcInputs[0]).toMatchObject({ dateOfBirth: null, updateTermsPrivacy: true, source: "reconsent" });
  });

  it("DOB sent by a legacy member is ignored (never stored)", async () => {
    profileRow = { ...TERMS_OK, terms_version: "t0" };
    ageState = legacyState;
    await patch({ agreeTerms: true, agreePrivacy: true, attestAge: true, dateOfBirth: "2000-01-01" });
    expect(rpcInputs[0]).toMatchObject({ dateOfBirth: null });
  });
});

describe("new member", () => {
  it("required terms missing → 400, nothing written", async () => {
    const res = await patch({ agreeTerms: true, attestAge: true, dateOfBirth: "2000-01-01" });
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("age missing → 400, nothing written (cannot use the legacy exemption)", async () => {
    const res = await patch({ agreeTerms: true, agreePrivacy: true });
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("normal signup with marketing declined → marketing OFF saved first, then atomic RPC", async () => {
    const res = await patch({
      agreeTerms: true,
      agreePrivacy: true,
      attestAge: true,
      dateOfBirth: "2000-01-01",
      agreeMarketing: false,
    });
    expect(res.status).toBe(200);
    expect(calls).toEqual(["marketing:false", "rpc"]);
    expect(rpcInputs[0]).toMatchObject({ dateOfBirth: "2000-01-01", updateTermsPrivacy: true, source: "signup" });
  });

  it("under 14 → 403 before any write (no RPC, no marketing, no DOB)", async () => {
    const dob = `${new Date().getUTCFullYear() - 10}-01-01`;
    const res = await patch({
      agreeTerms: true,
      agreePrivacy: true,
      attestAge: true,
      dateOfBirth: dob,
      agreeMarketing: true,
    });
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
    expect(((await res.json()) as { code?: string }).code).toBe("age_under_minimum");
  });

  it("mistyped DOB (under 14) can be corrected right away — no waiting, no admin step", async () => {
    const under = `${new Date().getUTCFullYear() - 10}-01-01`;
    const first = await patch({ agreeTerms: true, agreePrivacy: true, attestAge: true, dateOfBirth: under });
    expect(first.status).toBe(403);
    const fixed = await patch({ agreeTerms: true, agreePrivacy: true, attestAge: true, dateOfBirth: "2000-01-01" });
    expect(fixed.status).toBe(200);
    expect(calls).toEqual(["rpc"]);
    expect(rpcInputs[0]).toMatchObject({ dateOfBirth: "2000-01-01" });
  });

  it("repeated automatic submits → 429 from the shared rate limiter, nothing written", async () => {
    quotaOk = false;
    const res = await patch({ agreeTerms: true, agreePrivacy: true, attestAge: true, dateOfBirth: "2000-01-01" });
    expect(res.status).toBe(429);
    expect(calls).toEqual([]);
  });

  it("terms version changed while the screen was open → 409, nothing written", async () => {
    const res = await patch({
      agreeTerms: true,
      agreePrivacy: true,
      attestAge: true,
      dateOfBirth: "2000-01-01",
      termsVersion: "t0",
    });
    expect(res.status).toBe(409);
    expect(calls).toEqual([]);
  });

  it("age state unreadable → 503 (never treated as legacy)", async () => {
    ageState = { ok: false };
    const res = await patch({ agreeTerms: true, agreePrivacy: true, attestAge: true, dateOfBirth: "2000-01-01" });
    expect(res.status).toBe(503);
    expect(calls).toEqual([]);
  });
});
