/**
 * R7 목록 계약 — GET /api/admin/points/ledger
 * 「더 보기」 커서(50건) 대신 limit(20/50/100)/offset + total(count exact). 조건 status·q·from/to(PHT).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
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

import { GET } from "@/app/api/admin/points/ledger/route";

const USER = "11111111-2222-3333-4444-555555555555";
let fake: ReturnType<typeof createFakePagedSb>;

beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakePagedSb((call: FakeSbCall) => {
    if (call.table === "point_ledger") {
      const [from, to] = (fakeOps(call, "range")[0] ?? [0, 0]) as [number, number];
      const rows = [];
      for (let i = from; i <= Math.min(to, 119); i += 1) {
        rows.push({
          id: `l${i}`,
          user_id: USER,
          entry_type: "admin_adjust",
          amount: 10,
          balance_after: 10,
          related_type: "admin",
          related_id: "",
          description: "",
          created_at: "2026-10-01T00:00:00Z",
          actor_type: "admin",
        });
      }
      return { data: rows, count: 120 };
    }
    return { data: [] };
  });
  requireAdminPermission.mockResolvedValue({ ok: true, sb: fake.sb });
});

const get = (q: string) => GET(new NextRequest(`https://x.test/api/admin/points/ledger?${q}`));

describe("GET /api/admin/points/ledger", () => {
  it("limit=100&offset=100 → 20건 + total 120 (예전 50건 커서 대체)", async () => {
    const json = (await (await get("limit=100&offset=100")).json()) as { items: unknown[]; total: number; limit: number; offset: number };
    expect(json.total).toBe(120);
    expect(json.items).toHaveLength(20);
    expect([json.limit, json.offset]).toEqual([100, 100]);
    const call = fake.calls.find((c) => c.table === "point_ledger");
    expect(fakeCountExact(call)).toBe(true);
    expect(fakeOps(call, "range")[0]).toEqual([100, 199]);
    expect(fakeOps(call, "limit")).toHaveLength(0);
  });

  it("status=debit·q=회원 UUID·기간(PHT) → DB 조건", async () => {
    await get(`status=debit&q=${USER}&from=2026-10-01&to=2026-10-02`);
    const call = fake.calls.find((c) => c.table === "point_ledger");
    expect(fakeOps(call, "lt")).toContainEqual(["amount", 0]);
    expect(fakeOps(call, "eq")).toContainEqual(["user_id", USER]);
    expect(fakeOps(call, "gte")).toContainEqual(["created_at", "2026-09-30T16:00:00.000Z"]);
    expect(fakeOps(call, "lt")).toContainEqual(["created_at", "2026-10-02T16:00:00.000Z"]);
  });

  it("limit=200 → 기본 20", async () => {
    const json = (await (await get("limit=200")).json()) as { limit: number };
    expect(json.limit).toBe(20);
  });
});
