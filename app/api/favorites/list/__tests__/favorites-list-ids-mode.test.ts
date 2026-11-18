/**
 * `GET /api/favorites/list?ids=1` — 하트 표시용 id 만, Supabase 1회. 무인자 응답은 그대로(게시글 포함).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const tables: string[] = [];
vi.mock("@/lib/auth/get-optional-authenticated-user-id", () => ({ getOptionalAuthenticatedUserId: async () => "u1" }));
vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: (t: string) => {
      tables.push(t);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in"]) q[m] = () => q;
      q.order = async () => ({ data: [{ post_id: "p2", created_at: "2" }, { post_id: "p1", created_at: "1" }], error: null });
      return q;
    },
  }),
}));

import { GET } from "@/app/api/favorites/list/route";

beforeEach(() => {
  tables.length = 0;
});

describe("favorites list ids 모드", () => {
  it("id 만 반환, favorites 표 1회만 조회", async () => {
    const res = await GET(new NextRequest("http://localhost/api/favorites/list?ids=1"));
    expect(await res.json()).toEqual({ items: [{ id: "p2" }, { id: "p1" }], authenticated: true });
    expect(tables).toEqual(["favorites"]);
  });
});
