import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const gate = vi.fn();
vi.mock("@/lib/admin/require-admin-permission", () => ({ requireAdminApiActor: () => gate() }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => null }));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => null }));

const sourcesInput = vi.fn();
vi.mock("@/lib/admin/metrics/load-admin-dashboard-sources", () => ({
  createAdminDashboardSources: (input: unknown) => {
    sourcesInput(input);
    return {
      metrics: async (key: string) => {
        if (key === "commission") throw new Error("rpc_down");
        return new Map([
          ["members.total", { value: 10 }],
          ["members.new", { value: 1 }],
        ]);
      },
      queue: async () => [],
      trend: async () => [{ key: "2026-10-20", values: { signups: 1 } }],
      recent: async () => [],
    };
  },
}));

import { GET } from "@/app/api/admin/dashboard/overview/route";

const req = (qs: string) => new NextRequest(`http://localhost/api/admin/dashboard/overview${qs}`);

describe("GET /api/admin/dashboard/overview", () => {
  beforeEach(() => {
    gate.mockReset();
    sourcesInput.mockReset();
  });

  it("관리자 가드 실패 응답을 그대로 돌려준다", async () => {
    gate.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 }) });
    const res = await GET(req(""));
    expect(res.status).toBe(403);
  });

  it("탭·부분 파라미터 → 탭별 응답, 실패 지표는 value null + error", async () => {
    gate.mockResolvedValue({
      ok: true,
      sb: {},
      actor: { role: "super_admin", permissions: [], isSuperAdmin: true },
    });
    const res = await GET(req("?tab=finance&parts=metrics,band&period=30d"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, tab: "finance" });
    expect(json.trend).toBeUndefined();
    expect(json.pending).toBeUndefined();
    expect(Array.isArray(json.band)).toBe(true);
    const out = json.metrics.find((m: { id: string }) => m.id === "finance.commission_outstanding");
    expect(out.value).toBeNull();
    expect(out.error).toMatch(/commission:rpc_down/);
    expect(sourcesInput.mock.calls[0][0]).toMatchObject({
      scope: { isSuperAdmin: true, permissions: [] },
      range: { period: "30d", trendDays: 30 },
    });
    expect(json.period.id).toBe("30d");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("모르는 탭 = 전체 현황 · 모르는 기간 = 오늘", async () => {
    gate.mockResolvedValue({ ok: true, sb: {}, actor: { role: "super_admin", permissions: [], isSuperAdmin: true } });
    const json = await (await GET(req("?tab=nope&parts=trend&period=bogus"))).json();
    expect(json.tab).toBe("overview");
    expect(json.period.id).toBe("today");
    expect(json.trend.id).toBe("signups_orders_daily");
  });
});
