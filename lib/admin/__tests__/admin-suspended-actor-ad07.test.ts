/**
 * AD-07 (Owner §5.4) — 정지(suspended) 운영자는 모든 관리자 API 차단, 최고관리자는 제외.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  status: "verified_user",
  membershipRole: "admin" as string | null,
}));

vi.mock("@/lib/auth/server-guards", () => ({
  requireAuth: async () => ({ ok: true, userId: "u-1" }),
  validateActiveSession: async () => ({ ok: true }),
  requireAdmin: async () =>
    state.membershipRole
      ? {
          ok: true,
          profile: { id: "u-1", status: state.status },
          membership: { role: state.membershipRole, admin_tier: "operator" },
        }
      : { ok: false, response: new Response(null, { status: 403 }) },
  getCurrentProfile: async () => ({ id: "u-1", status: state.status }),
}));
vi.mock("@/lib/auth/get-optional-authenticated-user-id", () => ({
  getOptionalAuthenticatedUserId: async () => "u-1",
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({}),
}));
vi.mock("@/lib/env/runtime", () => ({
  requireSupabaseEnv: () => ({ ok: true, url: "http://localhost", serviceKey: "k" }),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/admin/admin-membership", () => ({
  loadActiveAdminMembership: async () =>
    state.membershipRole ? { role: state.membershipRole, admin_tier: "operator" } : null,
  resolveEffectiveAdminRole: async () => state.membershipRole,
  hasActiveAdminMembershipOrLegacyRole: async () => Boolean(state.membershipRole),
}));
vi.mock("@/lib/admin/admin-user-server", async (orig) => {
  const real = await orig<typeof import("@/lib/admin/admin-user-server")>();
  return { ...real, loadEffectiveStaffPermissions: async () => ["reports"] };
});

import { requireAdminApiActor } from "@/lib/admin/require-admin-permission";
import { getOptionalAdminUserId, requireAdminApiUser } from "@/lib/admin/require-admin-api";

describe("AD-07 suspended operator", () => {
  beforeEach(() => {
    state.status = "verified_user";
    state.membershipRole = "admin";
  });

  it("활성 운영자는 통과", async () => {
    const r = await requireAdminApiActor();
    expect(r.ok).toBe(true);
  });

  it("정지 운영자 → 403 admin_actor_suspended (API actor · API user · RSC userId)", async () => {
    state.status = "suspended";
    const r = await requireAdminApiActor();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(403);
      expect(await r.response.json()).toMatchObject({ error: "admin_actor_suspended" });
    }
    const u = await requireAdminApiUser();
    expect(u.ok).toBe(false);
    expect(await getOptionalAdminUserId()).toBeNull();
  });

  it("정지 상태여도 최고관리자는 통과 (잠김 방지)", async () => {
    state.status = "suspended";
    state.membershipRole = "super_admin";
    const r = await requireAdminApiActor();
    expect(r.ok).toBe(true);
    expect(await getOptionalAdminUserId()).toBe("u-1");
  });
});
