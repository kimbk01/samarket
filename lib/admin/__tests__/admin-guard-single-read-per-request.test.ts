/**
 * 요청 증폭 근본 수정 1단계 A-1 — 관리자 API 1회당 profiles·admin_memberships 각 1회.
 * (설계: docs/audit/supabase-request-fanout-root-fix-design-2026-10-30.md)
 * 이전: requireAdminApiUser → requireAdmin(profiles·membership) 후 requireAdminApiActor 가 profiles 1 + membership 3 재조회.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  requireAdminOpts: [] as unknown[],
  loadActive: 0,
  loadPrivileged: 0,
  resolveRole: 0,
  hasActive: 0,
  getCurrentProfile: 0,
}));

const SESSION_PROFILE = { id: "u-1", status: "verified_user" };

vi.mock("@/lib/auth/server-guards", () => ({
  requireAuth: async () => ({ ok: true, userId: "u-1" }),
  validateActiveSession: async () => ({ ok: true, profile: SESSION_PROFILE }),
  requireAdmin: async (_userId: string, opts?: unknown) => {
    calls.requireAdminOpts.push(opts);
    return {
      ok: true,
      profile: SESSION_PROFILE,
      membership: { role: "admin", admin_tier: "operator" },
    };
  },
  getCurrentProfile: async () => {
    calls.getCurrentProfile += 1;
    return SESSION_PROFILE;
  },
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
  loadActiveAdminMembership: async () => {
    calls.loadActive += 1;
    return { role: "admin", admin_tier: "operator" };
  },
  loadPrivilegedAdminMembership: async () => {
    calls.loadPrivileged += 1;
    return { role: "admin", admin_tier: "operator" };
  },
  resolveEffectiveAdminRole: async () => {
    calls.resolveRole += 1;
    return "admin";
  },
  hasActiveAdminMembershipOrLegacyRole: async () => {
    calls.hasActive += 1;
    return true;
  },
}));
vi.mock("@/lib/admin/admin-user-server", async (orig) => {
  const real = await orig<typeof import("@/lib/admin/admin-user-server")>();
  return { ...real, loadEffectiveStaffPermissions: async () => ["reports"] };
});

import { requireAdminApiActor } from "@/lib/admin/require-admin-permission";

describe("A-1 관리자 가드 요청당 1회 조회", () => {
  beforeEach(() => {
    calls.requireAdminOpts = [];
    calls.loadActive = 0;
    calls.loadPrivileged = 0;
    calls.resolveRole = 0;
    calls.hasActive = 0;
    calls.getCurrentProfile = 0;
  });

  it("requireAdmin 은 세션 확인이 읽은 profile 을 받고, actor 는 profile·membership 을 다시 읽지 않는다", async () => {
    const r = await requireAdminApiActor();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.actor.role).toBe("admin");
      expect(r.actor.profile).toBe(SESSION_PROFILE);
    }
    expect(calls.requireAdminOpts).toEqual([{ profile: SESSION_PROFILE }]);
    expect(calls.getCurrentProfile).toBe(0);
    expect(calls.loadActive + calls.loadPrivileged + calls.resolveRole + calls.hasActive).toBe(0);
  });
});
