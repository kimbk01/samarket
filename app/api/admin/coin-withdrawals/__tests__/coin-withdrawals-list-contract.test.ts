/**
 * R7 목록 계약 — GET /api/admin/coin-withdrawals
 * limit/offset 이 있으면 서버 페이지 + total(count exact) + focus 행. 없으면 기존 응답(최근 100건 · AdminFinanceOpsQueue 호환).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakePagedSb, fakeCountExact, fakeOps } from "@/lib/admin/member-ops-list/__tests__/fake-paged-sb";

const requireAdminPermission = vi.fn();
vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: (...a: unknown[]) => requireAdminPermission(...a),
}));
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({ appendAdminRouteAudit: vi.fn() }));

import { GET } from "@/app/api/admin/coin-withdrawals/route";

const TOTAL = 130;
let fake: ReturnType<typeof createFakePagedSb>;
beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakePagedSb((call) => {
    const eqId = fakeOps(call, "eq").find((a) => a[0] === "id");
    if (eqId) return { data: { id: eqId[1], status: "PAID" } };
    const range = fakeOps(call, "range")[0] as [number, number] | undefined;
    const [from, to] = range ?? [0, Number(fakeOps(call, "limit")[0]?.[0] ?? 0) - 1];
    const rows = [];
    for (let i = from; i <= Math.min(to, TOTAL - 1); i += 1) rows.push({ id: `w${i}`, status: "REQUESTED" });
    return { data: rows, count: TOTAL };
  });
  requireAdminPermission.mockResolvedValue({ ok: true, sb: fake.sb });
});

const get = async (q: string) =>
  (await (await GET(new NextRequest(`https://x.test/api/admin/coin-withdrawals?${q}`))).json()) as {
    requests: { id: string }[];
    total?: number;
    limit?: number;
    offset?: number;
    focus?: { id: string } | null;
  };

describe("GET /api/admin/coin-withdrawals", () => {
  it("limit=100&offset=100 → 30건 + total 130 (100건 상한 없음)", async () => {
    const json = await get("status=all&limit=100&offset=100");
    expect(json.total).toBe(TOTAL);
    expect(json.requests).toHaveLength(30);
    const call = fake.calls[0];
    expect(fakeCountExact(call)).toBe(true);
    expect(fakeOps(call, "range")[0]).toEqual([100, 199]);
    expect(fakeOps(call, "limit")).toHaveLength(0);
    expect(fakeOps(call, "eq")).toHaveLength(0);
  });

  it("focusId → focus 행을 함께 돌려준다 (지원 딥링크)", async () => {
    const json = await get("status=all&limit=20&offset=0&focusId=req-9");
    expect(json.focus).toEqual({ id: "req-9", status: "PAID" });
  });

  it("파라미터 없음 → 기존 응답 그대로 (total 없음 · 100건 limit) — 다른 호출자 호환", async () => {
    const json = await get("status=REQUESTED");
    expect(json.total).toBeUndefined();
    expect(fakeOps(fake.calls[0], "limit")[0]).toEqual([100]);
  });
});
