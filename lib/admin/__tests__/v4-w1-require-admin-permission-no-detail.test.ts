/**
 * v4 W1 API-12 — requireAdminApiActor: 권한 로드 실패 시 내부 원문(detail)을 응답에 싣지 않는다 (서버 로그만).
 */
import { describe, expect, it, vi } from "vitest";

const RAW = 'relation "admin_staff_permissions" does not exist at secret_schema.x';

vi.mock("@/lib/auth/server-guards", () => ({
  requireAuth: async () => ({ ok: true, userId: "u-1" }),
  validateActiveSession: async () => ({ ok: true }),
  requireAdmin: async () => ({
    ok: true,
    profile: { id: "u-1", status: "verified_user" },
    membership: { role: "admin", admin_tier: "operator" },
  }),
  getCurrentProfile: async () => ({ id: "u-1", status: "verified_user" }),
}));
vi.mock("@/lib/auth/get-optional-authenticated-user-id", () => ({
  getOptionalAuthenticatedUserId: async () => "u-1",
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => ({}) }));
vi.mock("@/lib/env/runtime", () => ({
  requireSupabaseEnv: () => ({ ok: true, url: "http://localhost", serviceKey: "k" }),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/admin/admin-membership", () => ({
  loadActiveAdminMembership: async () => ({ role: "admin", admin_tier: "operator" }),
  resolveEffectiveAdminRole: async () => "admin",
  hasActiveAdminMembershipOrLegacyRole: async () => true,
}));
vi.mock("@/lib/admin/admin-user-server", async (orig) => {
  const real = await orig<typeof import("@/lib/admin/admin-user-server")>();
  return {
    ...real,
    loadEffectiveStaffPermissions: async () => {
      throw new Error(RAW);
    },
  };
});

import { requireAdminApiActor } from "@/lib/admin/require-admin-permission";

describe("API-12 requireAdminApiActor detail 제거", () => {
  it("권한 로드 실패 → 500 고정 코드, detail·원문 미포함", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await requireAdminApiActor();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(500);
      const text = await r.response.text();
      expect(JSON.parse(text)).toEqual({ ok: false, error: "admin_permissions_load_failed" });
      expect(text).not.toContain("secret_schema");
    }
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
