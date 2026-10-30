/**
 * 요청 증폭 근본 수정 1단계 A-1 — requireAdmin 은 넘겨받은 profile 을 재사용하고 membership 을 1회만 읽는다.
 * 판정식(활성 membership role 이 admin·super_admin)은 그대로다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ profileReads: 0, privileged: 0, role: "admin" as string | null }));

vi.mock("@/lib/profile/fetch-profile-row-safe", () => ({
  fetchProfileRowSafe: async () => {
    calls.profileReads += 1;
    return { id: "u-1", status: "verified_user" };
  },
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => ({}) }));
vi.mock("@/lib/admin/admin-membership", () => ({
  hasActiveAdminMembershipOrLegacyRole: async () => true,
  loadPrivilegedAdminMembership: async () => {
    calls.privileged += 1;
    return calls.role === "admin" || calls.role === "super_admin"
      ? { role: calls.role, admin_tier: "operator" }
      : null;
  },
}));

import { requireAdmin } from "@/lib/auth/server-guards";

describe("requireAdmin 요청당 1회 조회", () => {
  beforeEach(() => {
    calls.profileReads = 0;
    calls.privileged = 0;
    calls.role = "admin";
  });

  it("profile 을 넘기면 profiles 를 다시 읽지 않고 membership 1회로 통과 + 행 반환", async () => {
    const profile = { id: "u-1", status: "verified_user" } as never;
    const r = await requireAdmin("u-1", { profile });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.membership.role).toBe("admin");
    expect(calls.profileReads).toBe(0);
    expect(calls.privileged).toBe(1);
  });

  it("profile 을 넘기지 않으면 지금처럼 1회 읽는다", async () => {
    const r = await requireAdmin("u-1");
    expect(r.ok).toBe(true);
    expect(calls.profileReads).toBe(1);
  });

  it("관리자 membership 이 아니면 403 (판정 불변)", async () => {
    calls.role = null;
    const r = await requireAdmin("u-1", { profile: { id: "u-1" } as never });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });
});
