import { describe, expect, it, vi } from "vitest";

/** 설계 2026-11-21 §5-6 — 빈 계정만 지운다 */
const blockerState = vi.hoisted(() => ({ value: { ok: true, blockers: [] as string[] }, duplicate: true as boolean }));
vi.mock("@/lib/admin/admin-user-deletion", () => ({
  fetchAuthUserPurgeBlockers: async () => blockerState.value,
}));
vi.mock("@/lib/auth/phone-otp-duplicate-check", () => ({
  findPhoneDuplicateOnOtherProfile: async () =>
    blockerState.duplicate ? { profileId: "other", matchedOn: "phone", matchedValue: "+639170000000" } : null,
}));
const NOW = Date.parse("2026-11-21T00:00:00Z");
const RECENT = "2026-11-20T00:00:00Z";

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
          return Promise.resolve({
            data: opts.profile === undefined ? { id: "u1", provider: "google", created_at: RECENT } : opts.profile,
            error: null,
          });
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
    expect(await checkEmptyAccountForDiscard(fakeSb({}), "u1", "09170000000", NOW)).toEqual({ ok: true, empty: true });
  });

  it.each(EMPTY_ACCOUNT_ACTIVITY_CHECKS.map((c) => [`${c.table}.${c.column}`, `${c.table}.${c.column}`] as const))(
    "%s 활동이 있으면 빈 계정 아님",
    async (key, reason) => {
      const r = await checkEmptyAccountForDiscard(fakeSb({ counts: { [key]: 1 } }), "u1", "09170000000", NOW);
      expect(r).toMatchObject({ ok: true, empty: false });
      expect((r as { reasons: string[] }).reasons).toContain(reason);
    },
  );

  it("전화 인증됨 · 관리자 · 관리자 생성 계정 · 영구 삭제 막힘 → 빈 계정 아님", async () => {
    for (const sb of [
      fakeSb({ profile: { id: "u1", phone_verified: true, created_at: RECENT } }),
      fakeSb({ admin: [{ role: "admin" }] }),
      fakeSb({ profile: { id: "u1", provider: "admin_manual", created_at: RECENT } }),
    ]) {
      expect(await checkEmptyAccountForDiscard(sb, "u1", "09170000000", NOW)).toMatchObject({ ok: true, empty: false });
    }
    blockerState.value = { ok: false, blockers: ["stores.owner_user_id"] };
    expect(await checkEmptyAccountForDiscard(fakeSb({}), "u1", "09170000000", NOW)).toMatchObject({ ok: true, empty: false });
    blockerState.value = { ok: true, blockers: [] };
  });

  it("조회 실패 → 지우지 않음(ok:false)", async () => {
    expect(await checkEmptyAccountForDiscard(fakeSb({ failTable: "posts" }), "u1", "09170000000", NOW)).toMatchObject({ ok: false });
    expect(await checkEmptyAccountForDiscard(fakeSb({ profile: null }), "u1", "09170000000", NOW)).toMatchObject({ ok: false, error: "not_found" });
  });

  it("재감사3 #1 — 번호 중복 상황이 아니거나(번호 없음·다른 계정에 없음) 가입 7일이 지났으면 지우지 않음", async () => {
    expect(await checkEmptyAccountForDiscard(fakeSb({}), "u1", "", NOW)).toMatchObject({ ok: true, empty: false });
    blockerState.duplicate = false;
    expect(await checkEmptyAccountForDiscard(fakeSb({}), "u1", "09170000000", NOW)).toMatchObject({ ok: true, empty: false });
    blockerState.duplicate = true;
    const old = fakeSb({ profile: { id: "u1", provider: "google", created_at: "2026-11-01T00:00:00Z" } });
    expect(await checkEmptyAccountForDiscard(old, "u1", "09170000000", NOW)).toMatchObject({ ok: true, empty: false });
  });
});
