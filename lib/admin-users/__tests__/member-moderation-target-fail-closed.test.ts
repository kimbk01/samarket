/**
 * AD-06 — 대상 관리자 확인 DB 오류 시 fail-closed (503), 일반 회원으로 간주하지 않는다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { assertMemberModerationTargetAllowed } from "@/lib/admin-users/member-moderation-target";

function sbWith(result: { data: unknown; error: { message: string } | null }): SupabaseClient {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => result,
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

describe("assertMemberModerationTargetAllowed (AD-06)", () => {
  it("membership 조회 오류 → 503 admin_target_check_failed", async () => {
    const r = await assertMemberModerationTargetAllowed(sbWith({ data: null, error: { message: "timeout" } }), {
      targetUserId: "t-1",
      actorIsSuperAdmin: false,
    });
    expect(r).toEqual({ ok: false, error: "admin_target_check_failed", status: 503 });
  });

  it("membership 없음 → 허용 · super_admin 대상 → 403", async () => {
    expect(
      await assertMemberModerationTargetAllowed(sbWith({ data: null, error: null }), {
        targetUserId: "t-1",
        actorIsSuperAdmin: false,
      })
    ).toEqual({ ok: true });
    expect(
      await assertMemberModerationTargetAllowed(sbWith({ data: { role: "super_admin" }, error: null }), {
        targetUserId: "t-1",
        actorIsSuperAdmin: true,
      })
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("회원 삭제 라우트도 membership 조회 오류를 503 으로 처리 (catch→null 금지)", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/users/[id]/delete/route.ts"), "utf8");
    expect(src).not.toMatch(/loadActiveAdminMembership\(sb, userId\)\.catch\(\(\) => null\)/);
    expect(src).toContain('"admin_target_check_failed" }, { status: 503 }');
  });
});
