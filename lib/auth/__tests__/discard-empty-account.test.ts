import { describe, expect, it, vi } from "vitest";

/** 설계 2026-11-21 §5-6 — 빈 계정만 지운다 */
vi.mock("@/lib/admin/admin-user-deletion", () => ({
  fetchAuthUserPurgeBlockers: async () => blockerState.value,
}));
const blockerState = vi.hoisted(() => ({ value: { ok: true, blockers: [] as string[] } }));

import { checkEmptyAccountForDiscard, EMPTY_ACCOUNT_ACTIVITY_CHECKS } from "@/lib/auth/discard-empty-account.server";

function fakeSb(opts: { profile?: Record<string, unknown> | null; admin?: unknown[]; counts?: Record<string, number>; failTable?: string }) {
  return {
    from(table: string) {
      const q = {
        _table: table,
        select() {
          return q;
        },
        eq(col: string) {
          (q as { _col?: string })._col = col;
          if (table !== "profiles" && table !== "admin_memberships") {
            if (opts.failTable === table) return Promise.resolve({ count: null, error: { message: "x" } });
            return Promise.resolve({ count: opts.counts?.[`${table}.${col}`] ?? 0, error: null });
          }
          return q;
        },
        maybeSingle() {
          return Promise.resolve({ data: opts.profile === undefined ? { id: "u1", provider: "google" } : opts.profile, error: null });
        },
        limit() {
          return Promise.resolve({ data: opts.admin ?? [], error: null });
        },
      };
      return q;
    },
  } as never;
}

describe("checkEmptyAccountForDiscard", () => {
  it("전화 미인증 · 활동 0 · 관리자 아님 → 빈 계정", async () => {
    expect(await checkEmptyAccountForDiscard(fakeSb({}), "u1")).toEqual({ ok: true, empty: true });
  });

  it.each(EMPTY_ACCOUNT_ACTIVITY_CHECKS.map((c) => [`${c.table}.${c.column}`, c.reason] as const))(
    "%s 활동이 있으면 빈 계정 아님",
    async (key, reason) => {
      const r = await checkEmptyAccountForDiscard(fakeSb({ counts: { [key]: 1 } }), "u1");
      expect(r).toMatchObject({ ok: true, empty: false });
      expect((r as { reasons: string[] }).reasons).toContain(reason);
    },
  );

  it("전화 인증됨 · 관리자 · 관리자 생성 계정 · 영구 삭제 막힘 → 빈 계정 아님", async () => {
    for (const sb of [
      fakeSb({ profile: { id: "u1", phone_verified: true } }),
      fakeSb({ admin: [{ role: "admin" }] }),
      fakeSb({ profile: { id: "u1", provider: "admin_manual" } }),
    ]) {
      expect(await checkEmptyAccountForDiscard(sb, "u1")).toMatchObject({ ok: true, empty: false });
    }
    blockerState.value = { ok: false, blockers: ["stores.owner_user_id"] };
    expect(await checkEmptyAccountForDiscard(fakeSb({}), "u1")).toMatchObject({ ok: true, empty: false });
    blockerState.value = { ok: true, blockers: [] };
  });

  it("조회 실패 → 지우지 않음(ok:false)", async () => {
    expect(await checkEmptyAccountForDiscard(fakeSb({ failTable: "posts" }), "u1")).toMatchObject({ ok: false });
    expect(await checkEmptyAccountForDiscard(fakeSb({ profile: null }), "u1")).toMatchObject({ ok: false, error: "not_found" });
  });
});
