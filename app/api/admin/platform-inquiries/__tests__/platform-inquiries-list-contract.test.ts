/**
 * R7 목록 계약 — GET /api/admin/platform-inquiries
 * limit/offset 이 있으면 서버 페이지 + total(count exact) (이전 문의 기록 화면). 없으면 기존 응답(최근 300건) 그대로.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakePagedSb, fakeCountExact, fakeOps } from "@/lib/admin/member-ops-list/__tests__/fake-paged-sb";

const fakeHolder: { sb: unknown } = { sb: null };
vi.mock("@/lib/auth/is-route-admin", () => ({ isRouteAdmin: async () => true }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => fakeHolder.sb }));

import { GET } from "@/app/api/admin/platform-inquiries/route";

let fake: ReturnType<typeof createFakePagedSb>;
beforeEach(() => {
  fake = createFakePagedSb((call) => {
    if (call.table !== "platform_admin_inquiries") return { data: [] };
    const range = fakeOps(call, "range")[0] as [number, number] | undefined;
    const [from, to] = range ?? [0, 299];
    const rows = [];
    for (let i = from; i <= Math.min(to, 349); i += 1) rows.push({ id: `p${i}`, store_id: null });
    return { data: rows, count: 350 };
  });
  fakeHolder.sb = fake.sb;
});

describe("GET /api/admin/platform-inquiries", () => {
  it("limit=50&offset=300 → 301~350번째 50건 + total 350 (300건 상한 없음)", async () => {
    const json = (await (await GET(new NextRequest("https://x.test/api/admin/platform-inquiries?limit=50&offset=300"))).json()) as {
      inquiries: unknown[];
      total: number;
    };
    expect(json.total).toBe(350);
    expect(json.inquiries).toHaveLength(50);
    const call = fake.calls[0];
    expect(fakeCountExact(call)).toBe(true);
    expect(fakeOps(call, "limit")).toHaveLength(0);
  });

  it("파라미터 없음 → 기존 응답 (300건 · total 없음)", async () => {
    const json = (await (await GET(new NextRequest("https://x.test/api/admin/platform-inquiries"))).json()) as {
      inquiries: unknown[];
      total?: number;
    };
    expect(json.total).toBeUndefined();
    expect(fakeOps(fake.calls[0], "limit")[0]).toEqual([300]);
  });
});
