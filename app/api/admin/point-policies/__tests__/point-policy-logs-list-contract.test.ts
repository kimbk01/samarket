/**
 * R7 목록 계약 — GET /api/admin/point-policies/logs
 * 예전 100건 고정 상한(.limit(100)) 제거: limit(20/50/100)/offset + total(count exact).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakePagedSb,
  fakeCountExact,
  fakeOps,
  type FakeSbCall,
} from "@/lib/admin/member-ops-list/__tests__/fake-paged-sb";

const requireAdminPermission = vi.fn();
vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: (...a: unknown[]) => requireAdminPermission(...a),
}));

import { GET } from "@/app/api/admin/point-policies/logs/route";

let fake: ReturnType<typeof createFakePagedSb>;

beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakePagedSb((call: FakeSbCall) => {
    const [from, to] = (fakeOps(call, "range")[0] ?? [0, 0]) as [number, number];
    const rows = [];
    for (let i = from; i <= Math.min(to, 149); i += 1) rows.push({ id: `p${i}`, policy_type: "board" });
    return { data: rows, count: 150 };
  });
  requireAdminPermission.mockResolvedValue({ ok: true, sb: fake.sb });
});

const get = (q: string) => GET(new Request(`https://x.test/api/admin/point-policies/logs?${q}`));

describe("GET /api/admin/point-policies/logs", () => {
  it("limit=100&offset=100 → 101~150번째 50건 + total 150", async () => {
    const json = (await (await get("limit=100&offset=100")).json()) as { logs: unknown[]; total: number; limit: number; offset: number };
    expect(json.total).toBe(150);
    expect(json.logs).toHaveLength(50);
    expect([json.limit, json.offset]).toEqual([100, 100]);
    const call = fake.calls.find((c) => c.table === "point_policy_logs");
    expect(fakeCountExact(call)).toBe(true);
    expect(fakeOps(call, "range")[0]).toEqual([100, 199]);
    expect(fakeOps(call, "limit")).toHaveLength(0);
  });

  it("파라미터 없음 → 기본 20건 한 쪽", async () => {
    const json = (await (await get("")).json()) as { logs: unknown[]; limit: number };
    expect(json.limit).toBe(20);
    expect(json.logs).toHaveLength(20);
  });
});
