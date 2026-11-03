/**
 * R7 목록 계약 — GET /api/admin/finance/outstanding
 * 예전 100건 고정 상한 제거: limit(20/50/100)/offset + total(count exact).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakePagedSb, fakeCountExact, fakeOps } from "@/lib/admin/member-ops-list/__tests__/fake-paged-sb";

const requireAdminPermission = vi.fn();
vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: (...a: unknown[]) => requireAdminPermission(...a),
}));

import { GET } from "@/app/api/admin/finance/outstanding/route";

let fake: ReturnType<typeof createFakePagedSb>;
const rpc = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakePagedSb((call) => {
    if (call.table !== "store_sale_fee_obligations") return { data: [] };
    const [from, to] = (fakeOps(call, "range")[0] ?? [0, 0]) as [number, number];
    const rows = [];
    for (let i = from; i <= Math.min(to, 149); i += 1) rows.push({ id: `o${i}`, store_id: "s1", order_id: `ord${i}` });
    return { data: rows, count: 150 };
  });
  rpc.mockResolvedValue({
    data: { count: 150, due_minor: 15000, paid_minor: 5000, outstanding_minor: 10000, by_status: [] },
    error: null,
  });
  requireAdminPermission.mockResolvedValue({ ok: true, sb: Object.assign(fake.sb, { rpc }) });
});

describe("GET /api/admin/finance/outstanding", () => {
  it("limit=100&offset=100 → 50건 + total 150 (100건 상한 없음)", async () => {
    const res = await GET(new NextRequest("https://x.test/api/admin/finance/outstanding?limit=100&offset=100"));
    const json = (await res.json()) as { rows: unknown[]; total: number; limit: number; offset: number };
    expect(json.total).toBe(150);
    expect(json.rows).toHaveLength(50);
    expect([json.limit, json.offset]).toEqual([100, 100]);
    const call = fake.calls.find((c) => c.table === "store_sale_fee_obligations");
    expect(fakeCountExact(call)).toBe(true);
    expect(fakeOps(call, "limit")).toHaveLength(0);
    expect(fakeOps(call, "eq")).toContainEqual(["status", "open"]);
  });

  it("C-1 조건 합계 — 같은 조건(매장 없음 = 미납 전체)으로 DB 함수 한 번 · 실패면 sums null(목록은 그대로)", async () => {
    const json = (await (await GET(new NextRequest("https://x.test/api/admin/finance/outstanding"))).json()) as {
      sums: { count: number; outstandingMinor: number } | null;
      rows: unknown[];
    };
    expect(rpc).toHaveBeenCalledWith("admin_finance_outstanding_sums", { p_store_id: null });
    expect(json.sums).toEqual({ count: 150, dueMinor: 15000, paidMinor: 5000, outstandingMinor: 10000 });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const failed = (await (await GET(new NextRequest("https://x.test/api/admin/finance/outstanding"))).json()) as {
      sums: unknown;
      rows: unknown[];
    };
    expect(failed.sums).toBeNull();
    expect(failed.rows).toHaveLength(20);
  });

  it("파라미터 없음 → 기본 20건", async () => {
    const json = (await (await GET(new NextRequest("https://x.test/api/admin/finance/outstanding"))).json()) as {
      rows: unknown[];
      limit: number;
    };
    expect(json.limit).toBe(20);
    expect(json.rows).toHaveLength(20);
  });
});
