/**
 * R7 목록 계약 — GET /api/admin/staff/memberships
 * 예전 1,000건 고정 상한 + 화면 메모리 페이지 → limit(20/50/100)/offset 서버 페이지 + total(count exact).
 * 정렬: 활성 먼저 → (정지 → 해제), 「전체」는 활성 묶음 뒤에 활성 외 묶음을 이어 붙인다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakePagedSb,
  fakeOps,
  type FakeSbCall,
} from "@/lib/admin/member-ops-list/__tests__/fake-paged-sb";

const requireSuperAdmin = vi.fn();
vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireSuperAdmin: (...a: unknown[]) => requireSuperAdmin(...a),
}));
vi.mock("@/lib/admin/admin-user-server", () => ({
  adminTierToUiRole: () => "operator",
  defaultPermissionsForUiRole: () => [],
  loadStaffPermissionsMap: async () => new Map(),
  resolveEffectiveStaffPermissionsFromStored: (stored: string[] | null | undefined) => stored ?? [],
}));

import { GET } from "@/app/api/admin/staff/memberships/route";

const ACTIVE = Array.from({ length: 3 }, (_, i) => ({ id: `a${i}`, user_id: `u-a${i}`, role: "admin", status: "active" }));
const INACTIVE = Array.from({ length: 25 }, (_, i) => ({ id: `r${i}`, user_id: `u-r${i}`, role: "admin", status: "revoked" }));

let fake: ReturnType<typeof createFakePagedSb>;

function segmentOf(call: FakeSbCall) {
  return fakeOps(call, "neq").length > 0 ? INACTIVE : ACTIVE;
}

beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakePagedSb((call) => {
    if (call.table !== "admin_memberships") return { data: [] };
    const rows = segmentOf(call);
    const head = fakeOps(call, "select").some((a) => (a[1] as { head?: boolean } | undefined)?.head);
    if (head) return { data: null, count: rows.length };
    const [from, to] = (fakeOps(call, "range")[0] ?? [0, 0]) as [number, number];
    return { data: rows.slice(from, to + 1), count: rows.length };
  });
  requireSuperAdmin.mockResolvedValue({ ok: true, sb: fake.sb });
});

const get = async (q: string) =>
  (await (await GET(new Request(`https://x.test/api/admin/staff/memberships?${q}`))).json()) as {
    memberships: { membershipId: string }[];
    total: number;
    limit: number;
    offset: number;
  };

describe("GET /api/admin/staff/memberships", () => {
  it("기본 = 활성만 · 20건 · total = count", async () => {
    const json = await get("");
    expect(json.total).toBe(3);
    expect(json.limit).toBe(20);
    expect(json.memberships.map((m) => m.membershipId)).toEqual(["a0", "a1", "a2"]);
    for (const c of fake.calls.filter((c) => c.table === "admin_memberships")) {
      expect(fakeOps(c, "limit")).toHaveLength(0);
    }
  });

  it("status=all · limit=20 · offset=0 → 활성 3 + 활성 외 17, total 28", async () => {
    const json = await get("status=all&limit=20&offset=0");
    expect(json.total).toBe(28);
    expect(json.memberships).toHaveLength(20);
    expect(json.memberships[0].membershipId).toBe("a0");
    expect(json.memberships[3].membershipId).toBe("r0");
  });

  it("status=all · 2쪽(offset=20) → 활성 외 17~24번째 8건", async () => {
    const json = await get("status=all&limit=20&offset=20");
    expect(json.total).toBe(28);
    expect(json.memberships.map((m) => m.membershipId)).toEqual(INACTIVE.slice(17).map((r) => r.id));
  });

  it("limit=200 → 기본 20", async () => {
    const json = await get("status=revoked&limit=200");
    expect(json.limit).toBe(20);
    expect(json.memberships).toHaveLength(20);
  });

  it("검색 = 닉네임·아이디·이메일 + 회원 ID 일부 (예전 화면 검색 범위 복구)", async () => {
    const UID = "3f2a9c10-1111-4222-8333-444455556666";
    fake = createFakePagedSb((call) => {
      if (call.table === "profiles") return { data: [] };
      if (call.table !== "admin_memberships") return { data: [] };
      const sel = fakeOps(call, "select")[0]?.[0];
      if (sel === "user_id") return { data: [{ user_id: UID }, { user_id: "aaaaaaaa-0000-4000-8000-000000000000" }] };
      const ids = (fakeOps(call, "in")[0]?.[1] ?? []) as string[];
      const rows = [{ id: "m1", user_id: UID, role: "admin", status: "active" }].filter((r) => ids.includes(r.user_id));
      const head = fakeOps(call, "select").some((a) => (a[1] as { head?: boolean } | undefined)?.head);
      return head ? { data: null, count: rows.length } : { data: rows, count: rows.length };
    });
    requireSuperAdmin.mockResolvedValue({ ok: true, sb: fake.sb });
    const json = await get("q=9C10-11");
    expect(json.total).toBe(1);
    expect(json.memberships.map((m) => m.membershipId)).toEqual(["m1"]);
  });
});
