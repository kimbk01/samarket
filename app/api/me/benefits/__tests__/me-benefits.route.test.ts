import { beforeEach, describe, expect, it, vi } from "vitest";

/** D19 — 회원 혜택: 내 회원 구분의 활성 정책만, 관리자 메모 미노출, 오류는 0건이 아니라 오류 */
type Res = { data: unknown; error: { message: string } | null };
let profileRes: Res;
let policiesRes: Res;
const filters: Array<[string, unknown]> = [];

vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: async () => ({ ok: true, userId: "u1" }),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (c: string, v: unknown) => {
        if (table === "member_benefit_policies") filters.push([c, v]);
        return q;
      };
      q.maybeSingle = async () => profileRes;
      q.then = (resolve: (v: Res) => unknown) => resolve(policiesRes);
      return q;
    },
  }),
}));

async function get() {
  const { GET } = await import("@/app/api/me/benefits/route");
  const res = await GET();
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("GET /api/me/benefits", () => {
  beforeEach(() => {
    filters.length = 0;
    profileRes = { data: { member_type: "premium" }, error: null };
    policiesRes = {
      data: [{ id: "p1", member_type: "premium", title: "특별 회원 혜택", is_active: true, admin_memo: "내부 메모" }],
      error: null,
    };
  });

  it("내 회원 구분 + 활성 정책만 조회, 관리자 메모 미노출", async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.json.memberType).toBe("premium");
    expect(filters).toEqual([
      ["member_type", "premium"],
      ["is_active", true],
    ]);
    expect(JSON.stringify(r.json)).not.toContain("내부 메모");
  });

  it("조회 실패는 500 (빈 혜택으로 보이지 않게)", async () => {
    policiesRes = { data: null, error: { message: "db down" } };
    expect((await get()).status).toBe(500);
  });
});
