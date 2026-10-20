/**
 * R7 목록 계약 — GET /api/admin/point-executions
 * 실행 이력·보상 로그 모두 limit/offset + total(count exact), 예전 200건 고정 상한(.limit(200)) 없음.
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

import { GET } from "@/app/api/admin/point-executions/route";

let fake: ReturnType<typeof createFakePagedSb>;

function logRow(i: number) {
  return { id: `log-${i}`, execution_id: `ex-${i}`, action_type: "reward", point_amount: 10, created_at: "2026-10-01T00:00:00Z" };
}

beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakePagedSb((call: FakeSbCall) => {
    if (call.table === "point_reward_logs") {
      const [from, to] = (fakeOps(call, "range")[0] ?? [0, 0]) as [number, number];
      const rows = [];
      for (let i = from; i <= Math.min(to, 200); i += 1) rows.push(logRow(i));
      return { data: rows, count: 201 };
    }
    if (call.table === "point_reward_executions") return { data: [{ id: "e1", status: "success" }], count: 345 };
    return { data: [] };
  });
  requireAdminPermission.mockResolvedValue({ ok: true, sb: fake.sb });
});

const get = (q: string) => GET(new Request(`https://x.test/api/admin/point-executions?${q}`));

describe("GET /api/admin/point-executions — 보상 로그 탭 (운영 201건 중 1건 숨김 결함)", () => {
  it("view=logs&limit=100&offset=200 → 201번째 1건 + total 201", async () => {
    const res = await get("view=logs&limit=100&offset=200");
    const json = (await res.json()) as { ok: boolean; rewardLogs: unknown[]; total: number; limit: number; offset: number };
    expect(json.ok).toBe(true);
    expect(json.total).toBe(201);
    expect(json.rewardLogs).toHaveLength(1);
    expect(json.limit).toBe(100);
    expect(json.offset).toBe(200);
    const call = fake.calls.find((c) => c.table === "point_reward_logs");
    expect(fakeCountExact(call)).toBe(true);
    expect(fakeOps(call, "range")[0]).toEqual([200, 299]);
    expect(fakeOps(call, "limit")).toHaveLength(0);
  });

  it("limit 은 20/50/100 만 — 200 은 기본 20", async () => {
    const res = await get("view=logs&limit=200");
    const json = (await res.json()) as { limit: number };
    expect(json.limit).toBe(20);
    expect(fakeOps(fake.calls.find((c) => c.table === "point_reward_logs"), "range")[0]).toEqual([0, 19]);
  });
});

describe("GET /api/admin/point-executions — 실행 이력", () => {
  it("파라미터 없이도 서버 페이지 (기본 20) + total, 200건 상한 없음", async () => {
    const res = await get("");
    const json = (await res.json()) as { total: number; limit: number; offset: number; rewardLogs?: unknown };
    expect(json.total).toBe(345);
    expect(json.limit).toBe(20);
    expect(json.offset).toBe(0);
    expect(json.rewardLogs).toBeUndefined();
    const call = fake.calls.find((c) => c.table === "point_reward_executions");
    expect(fakeCountExact(call)).toBe(true);
    expect(fakeOps(call, "limit")).toHaveLength(0);
    expect(fake.calls.some((c) => c.table === "point_reward_logs")).toBe(false);
  });

  it("limit=50&offset=50&status=blocked → range 50..99 + 상태 필터", async () => {
    await get("limit=50&offset=50&status=blocked");
    const call = fake.calls.find((c) => c.table === "point_reward_executions");
    expect(fakeOps(call, "range")[0]).toEqual([50, 99]);
    expect(fakeOps(call, "eq")).toContainEqual(["status", "blocked"]);
  });
});
