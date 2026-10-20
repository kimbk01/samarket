/**
 * R7 목록 계약 — GET /api/admin/member-notes
 * limit/offset 이 있으면 서버 페이지 + total(count exact) (이전 문의 기록 화면). 없으면 기존 응답(최근 200건) 그대로.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakePagedSb, fakeCountExact, fakeOps } from "@/lib/admin/member-ops-list/__tests__/fake-paged-sb";

const fakeHolder: { sb: unknown } = { sb: null };
vi.mock("@/lib/auth/is-route-admin", () => ({ isRouteAdmin: async () => true }));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => fakeHolder.sb }));
vi.mock("@/lib/notifications/admin-member-notes-display", () => ({
  enrichAdminNoteThreadsForDisplay: async (_sb: unknown, threads: unknown[]) => threads,
}));

import { GET } from "@/app/api/admin/member-notes/route";

let fake: ReturnType<typeof createFakePagedSb>;
beforeEach(() => {
  fake = createFakePagedSb((call) => {
    if (call.table !== "member_admin_note_threads") return { data: [] };
    const range = fakeOps(call, "range")[0] as [number, number] | undefined;
    const [from, to] = range ?? [0, 199];
    const rows = [];
    for (let i = from; i <= Math.min(to, 209); i += 1) rows.push({ id: `t${i}` });
    return { data: rows, count: 210 };
  });
  fakeHolder.sb = fake.sb;
});

describe("GET /api/admin/member-notes", () => {
  it("limit=20&offset=200 → 201~210번째 10건 + total 210 (200건 상한 없음)", async () => {
    const json = (await (await GET(new NextRequest("https://x.test/api/admin/member-notes?limit=20&offset=200"))).json()) as {
      threads: unknown[];
      total: number;
    };
    expect(json.total).toBe(210);
    expect(json.threads).toHaveLength(10);
    const call = fake.calls[0];
    expect(fakeCountExact(call)).toBe(true);
    expect(fakeOps(call, "limit")).toHaveLength(0);
  });

  it("파라미터 없음 → 기존 응답 (200건 · total 없음)", async () => {
    const json = (await (await GET(new NextRequest("https://x.test/api/admin/member-notes"))).json()) as {
      threads: unknown[];
      total?: number;
    };
    expect(json.total).toBeUndefined();
    expect(fakeOps(fake.calls[0], "limit")[0]).toEqual([200]);
  });
});
