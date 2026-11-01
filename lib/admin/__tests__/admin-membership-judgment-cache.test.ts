/**
 * 관리자 판정 캐시 (2026-11-02 Owner 승인 — 있음 15초 · 없음 60초 · 회수 지연 ≤15초 허용).
 * 판정 경로(loadPrivilegedAdminMembership · hasActiveAdminMembershipOrLegacyRole)만 캐시하고,
 * 변경·대상 확인 경로(loadActiveAdminMembership)는 매번 DB 를 읽는다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_MEMBERSHIP_JUDGMENT_NEGATIVE_TTL_MS,
  ADMIN_MEMBERSHIP_JUDGMENT_POSITIVE_TTL_MS,
  hasActiveAdminMembershipOrLegacyRole,
  invalidateAdminMembershipJudgmentCache,
  loadActiveAdminMembership,
  loadPrivilegedAdminMembership,
  revokeActiveAdminMembership,
} from "@/lib/admin/admin-membership";

const UID = "aaaaaaaa-0000-0000-0000-000000000001";

function adminRow(role: "admin" | "super_admin" = "admin") {
  return {
    id: "m1",
    user_id: UID,
    role,
    status: "active",
    admin_tier: "operator",
    granted_at: "2026-11-01T00:00:00Z",
    granted_by: null,
    revoked_at: null,
    revoked_by: null,
    revoke_reason: null,
    bootstrap_seed: false,
  };
}

/** admin_memberships 단건 조회만 흉내 — 호출 수와 현재 행을 바꿀 수 있다. */
function fakeDb(initial: ReturnType<typeof adminRow> | null) {
  const state = { row: initial as ReturnType<typeof adminRow> | null, reads: 0, fail: false };
  let release: (() => void) | null = null;
  const gate = { hold: false };
  const sb = {
    from(table: string) {
      if (table === "admin_memberships") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          update: () => ({
            eq: async () => {
              state.row = null;
              return { error: null };
            },
          }),
          maybeSingle: async () => {
            state.reads += 1;
            if (gate.hold) await new Promise<void>((r) => (release = r));
            if (state.fail) return { data: null, error: { message: "boom" } };
            return { data: state.row, error: null };
          },
        };
        return chain;
      }
      if (table === "admin_staff_permissions") {
        return { delete: () => ({ eq: async () => ({ error: null }) }) };
      }
      if (table === "support_cases") {
        const c = {
          update: () => c,
          eq: () => c,
          not: () => c,
          select: async () => ({ data: [], error: null }),
        };
        return c;
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
  return { sb, state, gate, release: () => release?.() };
}

describe("관리자 판정 캐시", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("있음 결과는 15초 동안 다시 읽지 않고, 지나면 다시 읽는다", async () => {
    const db = fakeDb(adminRow());
    expect(await loadPrivilegedAdminMembership(db.sb, UID)).not.toBeNull();
    expect(await hasActiveAdminMembershipOrLegacyRole(db.sb, UID)).toBe(true);
    expect(db.state.reads).toBe(1);
    vi.advanceTimersByTime(ADMIN_MEMBERSHIP_JUDGMENT_POSITIVE_TTL_MS + 1);
    await loadPrivilegedAdminMembership(db.sb, UID);
    expect(db.state.reads).toBe(2);
  });

  it("없음 결과는 60초 동안 재사용한다", async () => {
    const db = fakeDb(null);
    expect(await hasActiveAdminMembershipOrLegacyRole(db.sb, UID)).toBe(false);
    vi.advanceTimersByTime(ADMIN_MEMBERSHIP_JUDGMENT_POSITIVE_TTL_MS + 1);
    expect(await hasActiveAdminMembershipOrLegacyRole(db.sb, UID)).toBe(false);
    expect(db.state.reads).toBe(1);
    vi.advanceTimersByTime(ADMIN_MEMBERSHIP_JUDGMENT_NEGATIVE_TTL_MS);
    await hasActiveAdminMembershipOrLegacyRole(db.sb, UID);
    expect(db.state.reads).toBe(2);
  });

  it("같은 사용자 동시 판정은 DB 를 1번만 읽는다", async () => {
    const db = fakeDb(adminRow());
    db.gate.hold = true;
    const a = loadPrivilegedAdminMembership(db.sb, UID);
    const b = hasActiveAdminMembershipOrLegacyRole(db.sb, UID);
    await Promise.resolve();
    db.release();
    expect(await a).not.toBeNull();
    expect(await b).toBe(true);
    expect(db.state.reads).toBe(1);
  });

  it("조회 오류는 캐시하지 않는다 (가드는 deny, 다음 요청에서 다시 읽음)", async () => {
    const db = fakeDb(adminRow());
    db.state.fail = true;
    await expect(loadPrivilegedAdminMembership(db.sb, UID)).rejects.toThrow("boom");
    expect(await hasActiveAdminMembershipOrLegacyRole(db.sb, UID)).toBe(false);
    db.state.fail = false;
    expect(await loadPrivilegedAdminMembership(db.sb, UID)).not.toBeNull();
    expect(db.state.reads).toBe(3);
  });

  it("권한 회수 직후 같은 인스턴스 판정은 바로 거부된다", async () => {
    const db = fakeDb(adminRow());
    expect(await hasActiveAdminMembershipOrLegacyRole(db.sb, UID)).toBe(true);
    const revoked = await revokeActiveAdminMembership(db.sb, { userId: UID, revokedBy: null });
    expect(revoked.ok).toBe(true);
    expect(await hasActiveAdminMembershipOrLegacyRole(db.sb, UID)).toBe(false);
  });

  it("무효화하지 않은 다른 인스턴스는 최대 15초까지 이전 판정 — 지나면 거부", async () => {
    const db = fakeDb(adminRow());
    expect(await hasActiveAdminMembershipOrLegacyRole(db.sb, UID)).toBe(true);
    db.state.row = null; // 다른 인스턴스에서 회수됨
    expect(await hasActiveAdminMembershipOrLegacyRole(db.sb, UID)).toBe(true);
    vi.advanceTimersByTime(ADMIN_MEMBERSHIP_JUDGMENT_POSITIVE_TTL_MS + 1);
    expect(await hasActiveAdminMembershipOrLegacyRole(db.sb, UID)).toBe(false);
  });

  it("조회 중에 무효화되면 그 결과를 저장하지 않는다", async () => {
    const db = fakeDb(adminRow());
    db.gate.hold = true;
    const pending = hasActiveAdminMembershipOrLegacyRole(db.sb, UID);
    await Promise.resolve();
    invalidateAdminMembershipJudgmentCache(UID);
    db.release();
    expect(await pending).toBe(true);
    db.gate.hold = false;
    db.state.row = null;
    expect(await hasActiveAdminMembershipOrLegacyRole(db.sb, UID)).toBe(false);
    expect(db.state.reads).toBe(2);
  });

  it("변경·대상 확인 경로(loadActiveAdminMembership)는 캐시를 쓰지 않는다", async () => {
    const db = fakeDb(adminRow());
    await hasActiveAdminMembershipOrLegacyRole(db.sb, UID);
    await loadActiveAdminMembership(db.sb, UID);
    await loadActiveAdminMembership(db.sb, UID);
    expect(db.state.reads).toBe(3);
  });
});
