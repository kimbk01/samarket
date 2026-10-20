/**
 * R7 목록 계약 — GET /api/admin/account-deletion-requests
 * 예전 화면 30건 고정 조회 → limit(20/50/100)/offset + total(count exact).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakePagedSb, fakeCountExact, fakeOps } from "@/lib/admin/member-ops-list/__tests__/fake-paged-sb";

const requireAdminPermission = vi.fn();
vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: (...a: unknown[]) => requireAdminPermission(...a),
}));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: vi.fn() }));

import { GET } from "@/app/api/admin/account-deletion-requests/route";

let fake: ReturnType<typeof createFakePagedSb>;
beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakePagedSb((call) => {
    if (call.table !== "account_deletion_requests") return { data: [] };
    const [from, to] = (fakeOps(call, "range")[0] ?? [0, 0]) as [number, number];
    const rows = [];
    for (let i = from; i <= Math.min(to, 30); i += 1) {
      rows.push({ id: `d${i}`, user_id: `u${i}`, status: "pending", requested_at: "2026-10-01T00:00:00Z" });
    }
    return { data: rows, count: 31 };
  });
  requireAdminPermission.mockResolvedValue({ ok: true, sb: fake.sb });
});

describe("GET /api/admin/account-deletion-requests", () => {
  it("31건째도 2쪽(limit=20&offset=20)에서 보인다 + total 31", async () => {
    const res = await GET(new NextRequest("https://x.test/api/admin/account-deletion-requests?status=open&limit=20&offset=20"));
    const json = (await res.json()) as { items: { id: string }[]; total: number; limit: number; offset: number };
    expect(json.total).toBe(31);
    expect(json.items.map((i) => i.id)).toContain("d30");
    expect([json.limit, json.offset]).toEqual([20, 20]);
    const call = fake.calls.find((c) => c.table === "account_deletion_requests");
    expect(fakeCountExact(call)).toBe(true);
    expect(fakeOps(call, "range")[0]).toEqual([20, 39]);
    expect(fakeOps(call, "limit")).toHaveLength(0);
  });

  it("limit=30 (예전 값) → 표준 20", async () => {
    const json = (await (await GET(new NextRequest("https://x.test/api/admin/account-deletion-requests?status=open&limit=30"))).json()) as {
      limit: number;
    };
    expect(json.limit).toBe(20);
  });
});
