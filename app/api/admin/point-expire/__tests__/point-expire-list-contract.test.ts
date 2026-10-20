/**
 * R7 목록 계약 — GET /api/admin/point-expire
 * 실행 이력(예전 100건)·소멸 로그(예전 200건) 고정 상한 제거: limit/offset + total(count exact).
 * 요약 실행 횟수 = DB count, 합계 = 전체 합(상한 안 건수 아님).
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

import { GET } from "@/app/api/admin/point-expire/route";

const EXEC_TOTAL = 1234;
let fake: ReturnType<typeof createFakePagedSb>;

beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakePagedSb((call: FakeSbCall) => {
    const [from, to] = (fakeOps(call, "range")[0] ?? [0, 0]) as [number, number];
    if (call.table === "point_expire_executions") {
      const rows = [];
      for (let i = from; i <= Math.min(to, EXEC_TOTAL - 1); i += 1) rows.push({ id: `x${i}`, expired_point: 2 });
      return { data: rows, count: EXEC_TOTAL };
    }
    if (call.table === "point_expire_logs") {
      const rows = [];
      for (let i = from; i <= Math.min(to, 500 - 1); i += 1) rows.push({ id: `l${i}` });
      return { data: rows, count: 500 };
    }
    return { data: [] };
  });
  requireAdminPermission.mockResolvedValue({ ok: true, sb: fake.sb });
});

const get = (q: string) => GET(new Request(`https://x.test/api/admin/point-expire?${q}`));

describe("GET /api/admin/point-expire", () => {
  it("view=executions&limit=100&offset=1200 → 34건 + total 1234 (100건 상한 없음)", async () => {
    const json = (await (await get("view=executions&limit=100&offset=1200")).json()) as {
      executions: unknown[];
      total: number;
      limit: number;
      offset: number;
    };
    expect(json.total).toBe(EXEC_TOTAL);
    expect(json.executions).toHaveLength(34);
    expect([json.limit, json.offset]).toEqual([100, 1200]);
    const call = fake.calls.find((c) => c.table === "point_expire_executions");
    expect(fakeCountExact(call)).toBe(true);
    expect(fakeOps(call, "limit")).toHaveLength(0);
  });

  it("view=logs&limit=50&offset=450 → 50건 + total 500 (200건 상한 없음)", async () => {
    const json = (await (await get("view=logs&limit=50&offset=450")).json()) as { logs: unknown[]; total: number };
    expect(json.total).toBe(500);
    expect(json.logs).toHaveLength(50);
    const call = fake.calls.find((c) => c.table === "point_expire_logs");
    expect(fakeOps(call, "range")[0]).toEqual([450, 499]);
    expect(fakeOps(call, "limit")).toHaveLength(0);
  });

  it("limit 은 20/50/100 만 — 그 외 20", async () => {
    const json = (await (await get("view=logs&limit=200")).json()) as { limit: number };
    expect(json.limit).toBe(20);
  });

  it("기본 응답 요약: 실행 횟수 = count, 합계 = 전체 1234건 합", async () => {
    const json = (await (await get("")).json()) as { summary: { runCount: number; totalExpired: number } };
    expect(json.summary).toEqual({ runCount: EXEC_TOTAL, totalExpired: EXEC_TOTAL * 2 });
  });
});
